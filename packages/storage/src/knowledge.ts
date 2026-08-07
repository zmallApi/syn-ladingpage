import type Database from "better-sqlite3";
import { randomUUID } from "node:crypto";
import type {
  CanonicalEdge,
  CanonicalEntity,
  CanonicalFact,
  CanonicalRelation,
  EdgeStatus,
  EnrichmentKind,
  EnrichmentPort,
  EnrichmentStatus,
  EnrichmentUpsert,
  KnowledgeEnrichment,
  KnowledgeLayerPort,
  ProjectionKind,
} from "@synapse/core";
import { edgeKey } from "@synapse/core";

export interface KlSyncState {
  projectId: string;
  projection: ProjectionKind;
  cursor: string | null;
  lastSyncAt: string | null;
  entityCount: number;
  edgeCount: number;
  lastError: string | null;
}

export interface KlLinkRow {
  id: string;
  fromId: string;
  toId: string;
  rel: CanonicalRelation;
  score: number | null;
  status: EdgeStatus;
  evidence?: Record<string, unknown>;
  fromTitle: string;
  toTitle: string;
  fromType: string;
  toType: string;
  fromUrl?: string;
  toUrl?: string;
}

export class KnowledgeLayerStore implements KnowledgeLayerPort {
  constructor(private db: Database.Database) {
    this.migrate();
  }

  private migrate() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS kl_nodes (
        project_id TEXT NOT NULL,
        id TEXT NOT NULL,
        type TEXT NOT NULL,
        source TEXT NOT NULL,
        external_id TEXT NOT NULL,
        title TEXT NOT NULL,
        url TEXT,
        updated_at TEXT,
        text TEXT NOT NULL DEFAULT '',
        payload_json TEXT NOT NULL DEFAULT '{}',
        PRIMARY KEY (project_id, id)
      );
      CREATE INDEX IF NOT EXISTS idx_kl_nodes_type
        ON kl_nodes(project_id, type);
      CREATE INDEX IF NOT EXISTS idx_kl_nodes_ext
        ON kl_nodes(project_id, source, type, external_id);

      CREATE TABLE IF NOT EXISTS kl_edges (
        project_id TEXT NOT NULL,
        id TEXT NOT NULL,
        from_id TEXT NOT NULL,
        rel TEXT NOT NULL,
        to_id TEXT NOT NULL,
        score REAL,
        evidence_json TEXT,
        PRIMARY KEY (project_id, id)
      );
      CREATE INDEX IF NOT EXISTS idx_kl_edges_from
        ON kl_edges(project_id, from_id);
      CREATE INDEX IF NOT EXISTS idx_kl_edges_to
        ON kl_edges(project_id, to_id);

      CREATE TABLE IF NOT EXISTS kl_sync_state (
        project_id TEXT NOT NULL,
        projection TEXT NOT NULL,
        cursor TEXT,
        last_sync_at TEXT,
        entity_count INTEGER NOT NULL DEFAULT 0,
        edge_count INTEGER NOT NULL DEFAULT 0,
        last_error TEXT,
        PRIMARY KEY (project_id, projection)
      );

      CREATE TABLE IF NOT EXISTS kl_enrichments (
        project_id TEXT NOT NULL,
        id TEXT NOT NULL,
        subject_id TEXT NOT NULL,
        kind TEXT NOT NULL,
        payload_json TEXT NOT NULL DEFAULT '{}',
        confidence REAL NOT NULL DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'proposed',
        provider TEXT NOT NULL DEFAULT '',
        model TEXT NOT NULL DEFAULT '',
        prompt_version TEXT NOT NULL DEFAULT '',
        input_fingerprint TEXT NOT NULL DEFAULT '',
        evidence_json TEXT NOT NULL DEFAULT '{}',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (project_id, id)
      );
      CREATE INDEX IF NOT EXISTS idx_kl_enrichments_subject
        ON kl_enrichments(project_id, subject_id, kind);
      CREATE INDEX IF NOT EXISTS idx_kl_enrichments_status
        ON kl_enrichments(project_id, status);
      CREATE UNIQUE INDEX IF NOT EXISTS idx_kl_enrichments_fresh
        ON kl_enrichments(project_id, subject_id, kind, input_fingerprint);
    `);

    const cols = this.db
      .prepare(`PRAGMA table_info(kl_edges)`)
      .all() as Array<{ name: string }>;
    if (!cols.some((c) => c.name === "status")) {
      this.db.exec(
        `ALTER TABLE kl_edges ADD COLUMN status TEXT NOT NULL DEFAULT 'inferred'`,
      );
    }
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_kl_edges_status
        ON kl_edges(project_id, status)
    `);
  }

  upsertFacts(projectId: string, facts: CanonicalFact[]): {
    entities: number;
    edges: number;
  } {
    const upsertNode = this.db.prepare(`
      INSERT INTO kl_nodes (
        project_id, id, type, source, external_id, title, url, updated_at, text, payload_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(project_id, id) DO UPDATE SET
        type=excluded.type,
        source=excluded.source,
        external_id=excluded.external_id,
        title=excluded.title,
        url=excluded.url,
        updated_at=excluded.updated_at,
        text=excluded.text,
        payload_json=excluded.payload_json
    `);

    const upsertEdge = this.db.prepare(`
      INSERT INTO kl_edges (
        project_id, id, from_id, rel, to_id, score, evidence_json, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(project_id, id) DO UPDATE SET
        score=excluded.score,
        evidence_json=excluded.evidence_json,
        status=CASE
          WHEN kl_edges.status IN ('confirmed', 'rejected')
               AND COALESCE(excluded.status, 'inferred') = 'inferred'
          THEN kl_edges.status
          ELSE COALESCE(excluded.status, 'inferred')
        END
    `);

    let entities = 0;
    let edges = 0;

    const tx = this.db.transaction((items: CanonicalFact[]) => {
      for (const fact of items) {
        if (fact.kind === "entity") {
          const e = fact.entity;
          upsertNode.run(
            projectId,
            e.id,
            e.type,
            e.source,
            e.externalId,
            e.title,
            e.url ?? null,
            e.updatedAt ?? null,
            e.text,
            JSON.stringify(e.payload ?? {}),
          );
          entities += 1;
        } else {
          const edge = fact.edge;
          const id = edgeKey(edge.fromId, edge.rel, edge.toId);
          upsertEdge.run(
            projectId,
            id,
            edge.fromId,
            edge.rel,
            edge.toId,
            edge.score ?? null,
            edge.evidence ? JSON.stringify(edge.evidence) : null,
            edge.status ?? "inferred",
          );
          edges += 1;
        }
      }
    });

    tx(facts);
    return { entities, edges };
  }

  upsertEdges(projectId: string, edges: CanonicalEdge[]) {
    this.upsertFacts(
      projectId,
      edges.map((edge) => ({ kind: "edge" as const, edge })),
    );
  }

  /** Drop only inferred Task↔code links (preserves confirmed/rejected). */
  deleteEdgesByRel(
    projectId: string,
    rels: string[],
    statuses: EdgeStatus[] = ["inferred"],
  ) {
    if (!rels.length) return 0;
    const relPh = rels.map(() => "?").join(",");
    const stPh = statuses.map(() => "?").join(",");
    const info = this.db
      .prepare(
        `DELETE FROM kl_edges
         WHERE project_id = ? AND rel IN (${relPh}) AND status IN (${stPh})`,
      )
      .run(projectId, ...rels, ...statuses);
    return Number(info.changes ?? 0);
  }

  listRejectedKeys(
    projectId: string,
    rels: string[] = ["implements", "related_to"],
  ): Set<string> {
    if (!rels.length) return new Set();
    const ph = rels.map(() => "?").join(",");
    const rows = this.db
      .prepare(
        `SELECT id FROM kl_edges
         WHERE project_id = ? AND status = 'rejected' AND rel IN (${ph})`,
      )
      .all(projectId, ...rels) as Array<{ id: string }>;
    return new Set(rows.map((r) => r.id));
  }

  listLinks(
    projectId: string,
    opts?: { status?: EdgeStatus; rel?: string; limit?: number },
  ): KlLinkRow[] {
    const limit = opts?.limit ?? 50;
    const params: unknown[] = [projectId];
    let sql = `
      SELECT e.*,
        f.title AS from_title, f.type AS from_type, f.url AS from_url,
        t.title AS to_title, t.type AS to_type, t.url AS to_url
      FROM kl_edges e
      LEFT JOIN kl_nodes f ON f.project_id = e.project_id AND f.id = e.from_id
      LEFT JOIN kl_nodes t ON t.project_id = e.project_id AND t.id = e.to_id
      WHERE e.project_id = ?
        AND e.rel IN ('implements', 'related_to')
    `;
    if (opts?.status) {
      sql += ` AND e.status = ?`;
      params.push(opts.status);
    }
    if (opts?.rel) {
      sql += ` AND e.rel = ?`;
      params.push(opts.rel);
    }
    sql += ` ORDER BY CASE e.status
        WHEN 'inferred' THEN 0
        WHEN 'confirmed' THEN 1
        ELSE 2 END, COALESCE(e.score, 0) DESC
      LIMIT ?`;
    params.push(limit);

    const rows = this.db.prepare(sql).all(...params) as Array<
      Record<string, unknown>
    >;
    return rows.map((row) => {
      const edge = this.rowToEdge(row);
      return {
        id: String(row.id),
        fromId: edge.fromId,
        toId: edge.toId,
        rel: edge.rel,
        score: edge.score ?? null,
        status: edge.status ?? "inferred",
        evidence: edge.evidence,
        fromTitle: String(row.from_title ?? edge.fromId),
        toTitle: String(row.to_title ?? edge.toId),
        fromType: String(row.from_type ?? ""),
        toType: String(row.to_type ?? ""),
        fromUrl: row.from_url == null ? undefined : String(row.from_url),
        toUrl: row.to_url == null ? undefined : String(row.to_url),
      };
    });
  }

  setLinkStatus(
    projectId: string,
    fromId: string,
    toId: string,
    rel: CanonicalRelation,
    status: EdgeStatus,
    opts?: { score?: number; evidence?: Record<string, unknown> },
  ): KlLinkRow | null {
    const id = edgeKey(fromId, rel, toId);
    const existing = this.db
      .prepare(`SELECT * FROM kl_edges WHERE project_id = ? AND id = ?`)
      .get(projectId, id) as Record<string, unknown> | undefined;

    if (existing) {
      this.db
        .prepare(
          `UPDATE kl_edges SET status = ?, score = COALESCE(?, score)
           WHERE project_id = ? AND id = ?`,
        )
        .run(status, opts?.score ?? null, projectId, id);
    } else {
      this.db
        .prepare(
          `INSERT INTO kl_edges (
            project_id, id, from_id, rel, to_id, score, evidence_json, status
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          projectId,
          id,
          fromId,
          rel,
          toId,
          opts?.score ?? 1,
          opts?.evidence
            ? JSON.stringify(opts.evidence)
            : JSON.stringify({ via: "human" }),
          status,
        );
    }

    return this.listLinks(projectId, { limit: 500 }).find((l) => l.id === id) ?? null;
  }

  setSyncState(
    projectId: string,
    projection: ProjectionKind,
    patch: Partial<Omit<KlSyncState, "projectId" | "projection">>,
  ) {
    const cur = this.getSyncState(projectId, projection);
    this.db
      .prepare(
        `INSERT INTO kl_sync_state (
          project_id, projection, cursor, last_sync_at, entity_count, edge_count, last_error
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(project_id, projection) DO UPDATE SET
          cursor=excluded.cursor,
          last_sync_at=excluded.last_sync_at,
          entity_count=excluded.entity_count,
          edge_count=excluded.edge_count,
          last_error=excluded.last_error`,
      )
      .run(
        projectId,
        projection,
        patch.cursor !== undefined ? patch.cursor : cur?.cursor ?? null,
        patch.lastSyncAt !== undefined
          ? patch.lastSyncAt
          : cur?.lastSyncAt ?? null,
        patch.entityCount !== undefined
          ? patch.entityCount
          : cur?.entityCount ?? 0,
        patch.edgeCount !== undefined ? patch.edgeCount : cur?.edgeCount ?? 0,
        patch.lastError !== undefined ? patch.lastError : cur?.lastError ?? null,
      );
  }

  getSyncState(
    projectId: string,
    projection: ProjectionKind,
  ): KlSyncState | null {
    const row = this.db
      .prepare(
        `SELECT * FROM kl_sync_state WHERE project_id = ? AND projection = ?`,
      )
      .get(projectId, projection) as Record<string, unknown> | undefined;
    if (!row) return null;
    return {
      projectId,
      projection,
      cursor: row.cursor == null ? null : String(row.cursor),
      lastSyncAt: row.last_sync_at == null ? null : String(row.last_sync_at),
      entityCount: Number(row.entity_count ?? 0),
      edgeCount: Number(row.edge_count ?? 0),
      lastError: row.last_error == null ? null : String(row.last_error),
    };
  }

  listSyncStates(projectId: string): KlSyncState[] {
    const rows = this.db
      .prepare(`SELECT * FROM kl_sync_state WHERE project_id = ?`)
      .all(projectId) as Array<Record<string, unknown>>;
    return rows.map((row) => ({
      projectId,
      projection: String(row.projection) as ProjectionKind,
      cursor: row.cursor == null ? null : String(row.cursor),
      lastSyncAt: row.last_sync_at == null ? null : String(row.last_sync_at),
      entityCount: Number(row.entity_count ?? 0),
      edgeCount: Number(row.edge_count ?? 0),
      lastError: row.last_error == null ? null : String(row.last_error),
    }));
  }

  stats(projectId: string): {
    entities: number;
    edges: number;
    enrichments: number;
  } {
    const e = this.db
      .prepare(`SELECT COUNT(*) AS c FROM kl_nodes WHERE project_id = ?`)
      .get(projectId) as { c: number };
    const g = this.db
      .prepare(`SELECT COUNT(*) AS c FROM kl_edges WHERE project_id = ?`)
      .get(projectId) as { c: number };
    const en = this.db
      .prepare(`SELECT COUNT(*) AS c FROM kl_enrichments WHERE project_id = ?`)
      .get(projectId) as { c: number };
    return {
      entities: Number(e.c),
      edges: Number(g.c),
      enrichments: Number(en.c),
    };
  }

  private rowToEnrichment(row: Record<string, unknown>): KnowledgeEnrichment {
    let payload: Record<string, unknown> = {};
    let evidence: Record<string, unknown> = {};
    try {
      payload = JSON.parse(String(row.payload_json ?? "{}")) as Record<
        string,
        unknown
      >;
    } catch {
      payload = {};
    }
    try {
      evidence = JSON.parse(String(row.evidence_json ?? "{}")) as Record<
        string,
        unknown
      >;
    } catch {
      evidence = {};
    }
    const statusRaw = String(row.status ?? "proposed");
    const status: EnrichmentStatus =
      statusRaw === "confirmed" || statusRaw === "rejected"
        ? statusRaw
        : "proposed";
    return {
      id: String(row.id),
      projectId: String(row.project_id),
      subjectId: String(row.subject_id),
      kind: String(row.kind) as EnrichmentKind,
      payload,
      confidence: Number(row.confidence ?? 0),
      status,
      provider: String(row.provider ?? ""),
      model: String(row.model ?? ""),
      promptVersion: String(row.prompt_version ?? ""),
      inputFingerprint: String(row.input_fingerprint ?? ""),
      evidence,
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at),
    };
  }

  findEnrichmentByFingerprint(
    projectId: string,
    subjectId: string,
    kind: EnrichmentKind,
    inputFingerprint: string,
  ): KnowledgeEnrichment | null {
    const row = this.db
      .prepare(
        `SELECT * FROM kl_enrichments
         WHERE project_id = ? AND subject_id = ? AND kind = ?
           AND input_fingerprint = ?
         LIMIT 1`,
      )
      .get(projectId, subjectId, kind, inputFingerprint) as
      | Record<string, unknown>
      | undefined;
    return row ? this.rowToEnrichment(row) : null;
  }

  findFreshEnrichment(
    projectId: string,
    subjectId: string,
    kind: EnrichmentKind,
    inputFingerprint: string,
  ): KnowledgeEnrichment | null {
    const row = this.findEnrichmentByFingerprint(
      projectId,
      subjectId,
      kind,
      inputFingerprint,
    );
    if (!row) return null;
    if (row.status === "rejected") return null;
    return row;
  }

  listEnrichments(
    projectId: string,
    opts?: {
      status?: EnrichmentStatus;
      kind?: EnrichmentKind;
      subjectIds?: string[];
      limit?: number;
    },
  ): KnowledgeEnrichment[] {
    const limit = opts?.limit ?? 100;
    const params: unknown[] = [projectId];
    let sql = `SELECT * FROM kl_enrichments WHERE project_id = ?`;
    if (opts?.status) {
      sql += ` AND status = ?`;
      params.push(opts.status);
    }
    if (opts?.kind) {
      sql += ` AND kind = ?`;
      params.push(opts.kind);
    }
    if (opts?.subjectIds?.length) {
      const ph = opts.subjectIds.map(() => "?").join(",");
      sql += ` AND subject_id IN (${ph})`;
      params.push(...opts.subjectIds);
    }
    sql += ` ORDER BY CASE status
        WHEN 'proposed' THEN 0
        WHEN 'confirmed' THEN 1
        ELSE 2 END, updated_at DESC
      LIMIT ?`;
    params.push(limit);
    const rows = this.db.prepare(sql).all(...params) as Array<
      Record<string, unknown>
    >;
    return rows.map((r) => this.rowToEnrichment(r));
  }

  upsertEnrichment(
    projectId: string,
    row: EnrichmentUpsert,
  ): KnowledgeEnrichment {
    const now = new Date().toISOString();
    const existing = this.findEnrichmentByFingerprint(
      projectId,
      row.subjectId,
      row.kind,
      row.inputFingerprint,
    );
    const id = existing?.id ?? row.id ?? randomUUID();
    const createdAt = existing?.createdAt ?? now;
    this.db
      .prepare(
        `INSERT INTO kl_enrichments (
          project_id, id, subject_id, kind, payload_json, confidence, status,
          provider, model, prompt_version, input_fingerprint, evidence_json,
          created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(project_id, id) DO UPDATE SET
          payload_json=excluded.payload_json,
          confidence=excluded.confidence,
          status=CASE
            WHEN kl_enrichments.status = 'confirmed'
                 AND excluded.status = 'proposed'
            THEN kl_enrichments.status
            ELSE excluded.status
          END,
          provider=excluded.provider,
          model=excluded.model,
          prompt_version=excluded.prompt_version,
          input_fingerprint=excluded.input_fingerprint,
          evidence_json=excluded.evidence_json,
          updated_at=excluded.updated_at`,
      )
      .run(
        projectId,
        id,
        row.subjectId,
        row.kind,
        JSON.stringify(row.payload ?? {}),
        row.confidence,
        row.status,
        row.provider,
        row.model,
        row.promptVersion,
        row.inputFingerprint,
        JSON.stringify(row.evidence ?? {}),
        createdAt,
        now,
      );
    return this.listEnrichments(projectId, { limit: 500 }).find(
      (e) => e.id === id,
    )!;
  }

  setEnrichmentStatus(
    projectId: string,
    id: string,
    status: EnrichmentStatus,
  ): KnowledgeEnrichment | null {
    const info = this.db
      .prepare(
        `UPDATE kl_enrichments SET status = ?, updated_at = ?
         WHERE project_id = ? AND id = ?`,
      )
      .run(status, new Date().toISOString(), projectId, id);
    if (!info.changes) return null;
    return (
      this.listEnrichments(projectId, { limit: 500 }).find((e) => e.id === id) ??
      null
    );
  }

  bindEnrichments(projectId: string): EnrichmentPort {
    const self = this;
    return {
      findFresh(subjectId, kind, inputFingerprint) {
        return self.findFreshEnrichment(
          projectId,
          subjectId,
          kind,
          inputFingerprint,
        );
      },
      listBySubjects(subjectIds, opts) {
        if (!subjectIds.length) return [];
        const statuses = opts?.status
          ? Array.isArray(opts.status)
            ? opts.status
            : [opts.status]
          : undefined;
        let rows = self.listEnrichments(projectId, {
          subjectIds,
          kind: opts?.kinds?.[0],
          limit: 500,
        });
        if (opts?.kinds?.length) {
          const allowed = new Set(opts.kinds);
          rows = rows.filter((r) => allowed.has(r.kind));
        }
        if (statuses?.length) {
          const allowed = new Set(statuses);
          rows = rows.filter((r) => allowed.has(r.status));
        }
        return rows;
      },
      list(opts) {
        return self.listEnrichments(projectId, opts);
      },
      upsert(row) {
        return self.upsertEnrichment(projectId, row);
      },
      setStatus(id, status) {
        return self.setEnrichmentStatus(projectId, id, status);
      },
    };
  }

  private rowToEntity(row: Record<string, unknown>): CanonicalEntity {
    let payload: Record<string, unknown> = {};
    try {
      payload = JSON.parse(String(row.payload_json ?? "{}")) as Record<
        string,
        unknown
      >;
    } catch {
      payload = {};
    }
    return {
      id: String(row.id),
      type: String(row.type) as CanonicalEntity["type"],
      source: String(row.source) as CanonicalEntity["source"],
      externalId: String(row.external_id),
      title: String(row.title),
      url: row.url == null ? undefined : String(row.url),
      updatedAt: row.updated_at == null ? undefined : String(row.updated_at),
      text: String(row.text ?? ""),
      payload,
    };
  }

  private rowToEdge(row: Record<string, unknown>): CanonicalEdge {
    let evidence: Record<string, unknown> | undefined;
    if (row.evidence_json) {
      try {
        evidence = JSON.parse(String(row.evidence_json)) as Record<
          string,
          unknown
        >;
      } catch {
        evidence = undefined;
      }
    }
    const statusRaw = row.status == null ? "inferred" : String(row.status);
    const status =
      statusRaw === "confirmed" || statusRaw === "rejected"
        ? statusRaw
        : "inferred";
    return {
      fromId: String(row.from_id),
      toId: String(row.to_id),
      rel: String(row.rel) as CanonicalEdge["rel"],
      score: row.score == null ? undefined : Number(row.score),
      evidence,
      status,
    };
  }

  get(_id: string): CanonicalEntity | null {
    throw new Error("Use bindForProject(projectId).get");
  }

  findByExternalId(): CanonicalEntity | null {
    throw new Error("Use bindForProject(projectId).findByExternalId");
  }

  searchFacts(): CanonicalEntity[] {
    throw new Error("Use bindForProject(projectId).searchFacts");
  }

  listByType(): CanonicalEntity[] {
    throw new Error("Use bindForProject(projectId).listByType");
  }

  traverse(): { entities: CanonicalEntity[]; edges: CanonicalEdge[] } {
    throw new Error("Use bindForProject(projectId).traverse");
  }

  bindForProject(projectId: string): KnowledgeLayerPort & {
    listAll: (limit?: number) => CanonicalEntity[];
    enrichments: EnrichmentPort;
  } {
    const self = this;
    return {
      get(id: string) {
        const row = self.db
          .prepare(`SELECT * FROM kl_nodes WHERE project_id = ? AND id = ?`)
          .get(projectId, id) as Record<string, unknown> | undefined;
        return row ? self.rowToEntity(row) : null;
      },
      findByExternalId(source: string, type: string, externalId: string) {
        const row = self.db
          .prepare(
            `SELECT * FROM kl_nodes
             WHERE project_id = ? AND source = ? AND type = ? AND external_id = ?`,
          )
          .get(projectId, source, type, externalId) as
          | Record<string, unknown>
          | undefined;
        return row ? self.rowToEntity(row) : null;
      },
      searchFacts(query: string, limit = 20) {
        const tokens = query
          .toLowerCase()
          .normalize("NFD")
          .replace(/\p{M}/gu, "")
          .split(/[^a-z0-9]+/)
          .filter((t) => t.length >= 3)
          .slice(0, 10);
        const qNorm = query
          .toLowerCase()
          .normalize("NFD")
          .replace(/\p{M}/gu, "")
          .trim();

        let rows: Array<Record<string, unknown>>;
        if (!tokens.length) {
          const q = `%${query.replace(/[%_]/g, "").slice(0, 80)}%`;
          rows = self.db
            .prepare(
              `SELECT * FROM kl_nodes
               WHERE project_id = ? AND (title LIKE ? OR text LIKE ? OR external_id LIKE ?)
               LIMIT ?`,
            )
            .all(projectId, q, q, q, Math.max(limit * 4, 80)) as Array<
            Record<string, unknown>
          >;
        } else {
          const clauses = tokens
            .map(() => "(title LIKE ? OR external_id LIKE ?)")
            .join(" OR ");
          const params: string[] = [];
          for (const t of tokens) {
            const p = `%${t.replace(/[%_]/g, "")}%`;
            params.push(p, p);
          }
          rows = self.db
            .prepare(
              `SELECT * FROM kl_nodes
               WHERE project_id = ? AND (${clauses})
               LIMIT ?`,
            )
            .all(projectId, ...params, Math.max(limit * 5, 100)) as Array<
            Record<string, unknown>
          >;
        }

        const entities = rows.map((r) => self.rowToEntity(r));
        const scored = entities.map((e) => {
          const title = e.title
            .toLowerCase()
            .normalize("NFD")
            .replace(/\p{M}/gu, "");
          const ext = e.externalId.toLowerCase();
          let score = 0;
          if (title === qNorm || ext === qNorm) score += 1000;
          if (title.includes(qNorm)) score += 200;
          for (const t of tokens) {
            if (title.includes(t)) score += 20;
            if (ext.includes(t)) score += 30;
          }
          // Prefer Task/Story when query looks like a story title
          if (e.type === "Task" || e.type === "Story" || e.type === "Epic") {
            score += 15;
          }
          return { e, score };
        });
        scored.sort((a, b) => b.score - a.score);
        return scored.map((s) => s.e).slice(0, limit);
      },
      listByType(type: string, limit = 50) {
        const rows = self.db
          .prepare(
            `SELECT * FROM kl_nodes WHERE project_id = ? AND type = ? LIMIT ?`,
          )
          .all(projectId, type, limit) as Array<Record<string, unknown>>;
        return rows.map((r) => self.rowToEntity(r));
      },
      traverse(id: string, opts?: { depth?: number }) {
        const depth = opts?.depth ?? 1;
        const entities = new Map<string, CanonicalEntity>();
        const edges: CanonicalEdge[] = [];
        let frontier = [id];
        const root = this.get(id);
        if (root) entities.set(root.id, root);

        for (let d = 0; d < depth; d += 1) {
          const next: string[] = [];
          for (const nodeId of frontier) {
            const rows = self.db
              .prepare(
                `SELECT * FROM kl_edges
                 WHERE project_id = ? AND (from_id = ? OR to_id = ?)
                   AND COALESCE(status, 'inferred') != 'rejected'`,
              )
              .all(projectId, nodeId, nodeId) as Array<Record<string, unknown>>;
            for (const row of rows) {
              const edge = self.rowToEdge(row);
              edges.push(edge);
              for (const other of [edge.fromId, edge.toId]) {
                if (entities.has(other)) continue;
                const ent = this.get(other);
                if (ent) {
                  entities.set(ent.id, ent);
                  next.push(ent.id);
                }
              }
            }
          }
          frontier = next;
        }
        return { entities: [...entities.values()], edges };
      },
      listAll(limit = 200) {
        const rows = self.db
          .prepare(`SELECT * FROM kl_nodes WHERE project_id = ? LIMIT ?`)
          .all(projectId, limit) as Array<Record<string, unknown>>;
        return rows.map((r) => self.rowToEntity(r));
      },
      enrichments: self.bindEnrichments(projectId),
    };
  }
}

/** @internal helper for unique edge ids in tests */
export function newKlId() {
  return randomUUID();
}
