import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import type { ConnectionConfig } from "@synapse/core";
import {
  ENGINEERING_STORY_OS_CAPABILITIES,
  normalizeCapabilityIds,
} from "@synapse/core";
import { decrypt, encrypt } from "./crypto.js";
import {
  computeProductMetrics,
  migrateProductEvents,
  recordProductEvent,
  type ProductEvent,
  type ProductEventType,
  type ProductMetrics,
} from "./events.js";
import { KnowledgeLayerStore } from "./knowledge.js";
import { MissionStore } from "./missions.js";
import { LEGACY_TENANT_ID, TenantStore } from "./tenants.js";

/** Legacy Discovery-only eng projects → full Story OS pack. */
function ensureStoryOsCapabilities(
  vertical: string | undefined,
  caps: string[],
): { caps: string[]; upgraded: boolean } {
  const normalized = normalizeCapabilityIds(caps);
  if (vertical !== "engineering") return { caps: normalized, upgraded: false };

  const missing = ENGINEERING_STORY_OS_CAPABILITIES.filter(
    (id) => !normalized.includes(id),
  );
  if (missing.length === 0) return { caps: normalized, upgraded: false };

  return {
    caps: normalizeCapabilityIds([
      ...normalized,
      ...ENGINEERING_STORY_OS_CAPABILITIES,
    ]),
    upgraded: true,
  };
}

export type ConnectionMode = "cloud" | "edge";
export type EdgeStatus = "pending" | "online" | "offline" | "error";
export type ProjectVertical = "business" | "engineering";

export interface ProjectRecord {
  id: string;
  tenantId: string;
  name: string;
  engine: string;
  host: string;
  port: number;
  database: string;
  username: string;
  passwordEncrypted: string;
  optionsJson: string | null;
  readOnly: number;
  exposedResourcesJson: string;
  activeCapabilitiesJson: string;
  businessProfileJson: string | null;
  roleOverridesJson: string;
  connectionMode: ConnectionMode;
  vertical: ProjectVertical;
  knowledgeSourcesJson: string;
  edgeStatus: EdgeStatus;
  edgeLastSeen: string | null;
  edgeVersion: string | null;
  edgeResourceCount: number | null;
  edgeLastError: string | null;
  /** JSON: { provider, model?, baseUrl?, apiKey? } — apiKey encrypted at rest when set */
  llmConfigJson: string | null;
  status: string;
  createdAt: string;
}

export interface CreateProjectData {
  tenantId: string;
  name: string;
  engine: string;
  host: string;
  port: number;
  database: string;
  username: string;
  password: string;
  readOnly?: boolean;
  options?: Record<string, unknown>;
  connectionMode?: ConnectionMode;
}

export interface CreateEdgeProjectData {
  tenantId: string;
  name: string;
  engine?: string;
  readOnly?: boolean;
  vertical?: ProjectVertical;
}

export interface KnowledgeSourceConfig {
  kind: "github" | "clickup" | "confluence";
  enabled: boolean;
  /** Non-secret scope selection (repos, space ids) */
  scopes?: string[];
}

export interface EdgeTokenRecord {
  id: string;
  projectId: string;
  tokenPrefix: string;
  createdAt: string;
  revokedAt: string | null;
  lastUsedAt: string | null;
}

export interface CreatedEdgeToken {
  id: string;
  projectId: string;
  token: string;
  tokenPrefix: string;
  createdAt: string;
}

export interface ProjectMcpKeyRecord {
  id: string;
  projectId: string;
  name: string;
  tokenPrefix: string;
  createdByUserId: string | null;
  createdAt: string;
  revokedAt: string | null;
  lastUsedAt: string | null;
}

export interface CreatedProjectMcpKey {
  id: string;
  projectId: string;
  name: string;
  token: string;
  tokenPrefix: string;
  createdAt: string;
}

export interface PublicLlmConfig {
  provider: string;
  model?: string;
  baseUrl?: string;
  hasApiKey: boolean;
  /** false = LLM desligado neste projeto (ignora env). */
  enabled: boolean;
}

export interface PublicProject {
  id: string;
  tenantId: string;
  name: string;
  engine: string;
  host: string;
  port: number;
  database: string;
  username: string;
  readOnly: boolean;
  exposedResources: string[];
  activeCapabilities: string[];
  roleOverrides: Record<string, string>;
  connectionMode: ConnectionMode;
  vertical: ProjectVertical;
  knowledgeSources: KnowledgeSourceConfig[];
  edgeStatus: EdgeStatus;
  edgeLastSeen: string | null;
  edgeVersion: string | null;
  edgeResourceCount: number | null;
  edgeLastError: string | null;
  llmConfig: PublicLlmConfig;
  status: "connected" | "error" | "pending" | "online" | "offline";
  createdAt: string;
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function generateEdgeToken(): string {
  return `syn_edge_${randomBytes(24).toString("base64url")}`;
}

function generateMcpDevKey(): string {
  return `syn_mcp_${randomBytes(24).toString("base64url")}`;
}

function parseJsonArray(raw: string | null | undefined): string[] {
  try {
    const v = JSON.parse(raw ?? "[]") as unknown;
    return Array.isArray(v) ? v.map(String) : [];
  } catch {
    return [];
  }
}

function parseJsonObject(raw: string | null | undefined): Record<string, string> {
  try {
    const v = JSON.parse(raw ?? "{}") as unknown;
    if (!v || typeof v !== "object" || Array.isArray(v)) return {};
    const out: Record<string, string> = {};
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
      if (typeof val === "string" && val.trim()) out[k] = val;
    }
    return out;
  } catch {
    return {};
  }
}

function parseKnowledgeSources(raw: string | null | undefined): KnowledgeSourceConfig[] {
  try {
    const v = JSON.parse(raw ?? "[]") as unknown;
    if (!Array.isArray(v)) return [];
    return v
      .filter((x) => x && typeof x === "object")
      .map((x) => {
        const o = x as Record<string, unknown>;
        const kind = o.kind === "clickup" ? "clickup" : "github";
        return {
          kind,
          enabled: o.enabled !== false,
          scopes: Array.isArray(o.scopes)
            ? o.scopes.map(String).filter(Boolean)
            : undefined,
        } satisfies KnowledgeSourceConfig;
      });
  } catch {
    return [];
  }
}

export class ProjectStore {
  private db: Database.Database;
  private encryptionKey: string;
  readonly knowledge: KnowledgeLayerStore;
  readonly missions: MissionStore;
  readonly tenants: TenantStore;

  constructor(dbPath: string, encryptionKey: string) {
    mkdirSync(dirname(dbPath), { recursive: true });
    this.db = new Database(dbPath);
    this.encryptionKey = encryptionKey;
    this.db.pragma("journal_mode = WAL");
    this.migrate();
    this.tenants = new TenantStore(this.db);
    this.knowledge = new KnowledgeLayerStore(this.db);
    this.missions = new MissionStore(this.db);
    this.backfillProjectTenants();
  }

  private migrate() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS projects (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        engine TEXT NOT NULL,
        host TEXT NOT NULL,
        port INTEGER NOT NULL,
        database_name TEXT NOT NULL,
        username TEXT NOT NULL,
        password_encrypted TEXT NOT NULL,
        options_json TEXT,
        read_only INTEGER NOT NULL DEFAULT 1,
        exposed_resources_json TEXT NOT NULL DEFAULT '[]',
        active_capabilities_json TEXT NOT NULL DEFAULT '[]',
        business_profile_json TEXT,
        role_overrides_json TEXT NOT NULL DEFAULT '{}',
        status TEXT NOT NULL DEFAULT 'connected',
        created_at TEXT NOT NULL
      )
    `);

    const cols = this.db
      .prepare(`PRAGMA table_info(projects)`)
      .all() as Array<{ name: string }>;
    const names = new Set(cols.map((c) => c.name));
    if (!names.has("active_capabilities_json")) {
      this.db.exec(
        `ALTER TABLE projects ADD COLUMN active_capabilities_json TEXT NOT NULL DEFAULT '[]'`,
      );
    }
    if (!names.has("business_profile_json")) {
      this.db.exec(`ALTER TABLE projects ADD COLUMN business_profile_json TEXT`);
    }
    if (!names.has("role_overrides_json")) {
      this.db.exec(
        `ALTER TABLE projects ADD COLUMN role_overrides_json TEXT NOT NULL DEFAULT '{}'`,
      );
    }
    if (!names.has("connection_mode")) {
      this.db.exec(
        `ALTER TABLE projects ADD COLUMN connection_mode TEXT NOT NULL DEFAULT 'cloud'`,
      );
    }
    if (!names.has("edge_status")) {
      this.db.exec(
        `ALTER TABLE projects ADD COLUMN edge_status TEXT NOT NULL DEFAULT 'pending'`,
      );
    }
    if (!names.has("edge_last_seen")) {
      this.db.exec(`ALTER TABLE projects ADD COLUMN edge_last_seen TEXT`);
    }
    if (!names.has("edge_version")) {
      this.db.exec(`ALTER TABLE projects ADD COLUMN edge_version TEXT`);
    }
    if (!names.has("edge_resource_count")) {
      this.db.exec(`ALTER TABLE projects ADD COLUMN edge_resource_count INTEGER`);
    }
    if (!names.has("edge_last_error")) {
      this.db.exec(`ALTER TABLE projects ADD COLUMN edge_last_error TEXT`);
    }
    if (!names.has("vertical")) {
      this.db.exec(
        `ALTER TABLE projects ADD COLUMN vertical TEXT NOT NULL DEFAULT 'business'`,
      );
    }
    if (!names.has("knowledge_sources_json")) {
      this.db.exec(
        `ALTER TABLE projects ADD COLUMN knowledge_sources_json TEXT NOT NULL DEFAULT '[]'`,
      );
    }
    if (!names.has("llm_config_json")) {
      this.db.exec(`ALTER TABLE projects ADD COLUMN llm_config_json TEXT`);
    }
    if (!names.has("tenant_id")) {
      this.db.exec(`ALTER TABLE projects ADD COLUMN tenant_id TEXT`);
    }

    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_projects_tenant ON projects(tenant_id);
    `);

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS edge_tokens (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        token_hash TEXT NOT NULL UNIQUE,
        token_prefix TEXT NOT NULL,
        created_at TEXT NOT NULL,
        revoked_at TEXT,
        last_used_at TEXT,
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
      )
    `);

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS project_mcp_keys (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        name TEXT NOT NULL,
        token_hash TEXT NOT NULL UNIQUE,
        token_prefix TEXT NOT NULL,
        created_by_user_id TEXT,
        created_at TEXT NOT NULL,
        revoked_at TEXT,
        last_used_at TEXT,
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_project_mcp_keys_project
        ON project_mcp_keys(project_id, created_at DESC);
    `);

    migrateProductEvents(this.db);
  }

  /** Assign legacy tenant to any project missing tenant_id. */
  private backfillProjectTenants() {
    this.db
      .prepare(
        `UPDATE projects SET tenant_id = ? WHERE tenant_id IS NULL OR tenant_id = ''`,
      )
      .run(LEGACY_TENANT_ID);
  }

  private rowToRecord(row: Record<string, unknown>): ProjectRecord {
    return {
      id: String(row.id),
      tenantId: String(row.tenant_id ?? LEGACY_TENANT_ID),
      name: String(row.name),
      engine: String(row.engine),
      host: String(row.host),
      port: Number(row.port),
      database: String(row.database_name),
      username: String(row.username),
      passwordEncrypted: String(row.password_encrypted),
      optionsJson: row.options_json == null ? null : String(row.options_json),
      readOnly: Number(row.read_only),
      exposedResourcesJson: String(row.exposed_resources_json ?? "[]"),
      activeCapabilitiesJson: String(row.active_capabilities_json ?? "[]"),
      businessProfileJson:
        row.business_profile_json == null ? null : String(row.business_profile_json),
      roleOverridesJson: String(row.role_overrides_json ?? "{}"),
      connectionMode: (row.connection_mode === "edge" ? "edge" : "cloud") as ConnectionMode,
      vertical:
        row.vertical === "engineering" ? "engineering" : ("business" as ProjectVertical),
      knowledgeSourcesJson: String(row.knowledge_sources_json ?? "[]"),
      edgeStatus: (String(row.edge_status ?? "pending") as EdgeStatus) || "pending",
      edgeLastSeen: row.edge_last_seen == null ? null : String(row.edge_last_seen),
      edgeVersion: row.edge_version == null ? null : String(row.edge_version),
      edgeResourceCount:
        row.edge_resource_count == null ? null : Number(row.edge_resource_count),
      edgeLastError: row.edge_last_error == null ? null : String(row.edge_last_error),
      llmConfigJson:
        row.llm_config_json == null ? null : String(row.llm_config_json),
      status: String(row.status),
      createdAt: String(row.created_at),
    };
  }

  getLlmConfig(record: ProjectRecord): {
    provider?: string;
    model?: string;
    baseUrl?: string;
    apiKey?: string;
    enabled?: boolean;
  } {
    if (!record.llmConfigJson) return {};
    try {
      const v = JSON.parse(record.llmConfigJson) as Record<string, unknown>;
      const apiKeyEnc =
        typeof v.apiKeyEncrypted === "string" ? v.apiKeyEncrypted : null;
      let apiKey: string | undefined;
      if (apiKeyEnc) {
        try {
          apiKey = decrypt(apiKeyEnc, this.encryptionKey);
        } catch {
          apiKey = undefined;
        }
      }
      const provider = typeof v.provider === "string" ? v.provider : undefined;
      const enabled =
        v.enabled === false || provider === "none" ? false : v.enabled === true ? true : undefined;
      return {
        provider,
        model: typeof v.model === "string" ? v.model : undefined,
        baseUrl: typeof v.baseUrl === "string" ? v.baseUrl : undefined,
        apiKey,
        enabled,
      };
    } catch {
      return {};
    }
  }

  setLlmConfig(
    id: string,
    patch: {
      provider?: string;
      model?: string | null;
      baseUrl?: string | null;
      apiKey?: string | null;
      clearApiKey?: boolean;
      enabled?: boolean;
    },
  ): ProjectRecord | undefined {
    const cur = this.get(id);
    if (!cur) return undefined;
    const prev = this.getLlmConfig(cur);
    const disconnect =
      patch.enabled === false ||
      patch.provider === "none" ||
      patch.provider === "disabled";
    let nextKey = prev.apiKey;
    if (patch.clearApiKey || disconnect) nextKey = undefined;
    else if (patch.apiKey != null && patch.apiKey !== "") nextKey = patch.apiKey;

    // Connect only with a project-stored API key — empty "Salvar" must not enable LLM.
    const wantsEnable = !disconnect && patch.enabled !== false;
    const nextEnabled = Boolean(wantsEnable && nextKey);
    const nextProvider = nextEnabled
      ? patch.provider ?? prev.provider ?? "openai"
      : "none";

    const stored: Record<string, unknown> = {
      provider: nextEnabled ? nextProvider : "none",
      enabled: nextEnabled,
      model:
        !nextEnabled || patch.model === null
          ? undefined
          : (patch.model ?? prev.model) || undefined,
      baseUrl:
        !nextEnabled || patch.baseUrl === null
          ? undefined
          : (patch.baseUrl ?? prev.baseUrl) || undefined,
    };
    if (nextKey && nextEnabled) {
      stored.apiKeyEncrypted = encrypt(nextKey, this.encryptionKey);
    }
    this.db
      .prepare(`UPDATE projects SET llm_config_json = ? WHERE id = ?`)
      .run(JSON.stringify(stored), id);
    return this.get(id);
  }

  create(data: CreateProjectData): ProjectRecord {
    const id = randomUUID();
    const createdAt = new Date().toISOString();
    const mode: ConnectionMode = data.connectionMode === "edge" ? "edge" : "cloud";
    const passwordEncrypted = encrypt(data.password, this.encryptionKey);
    const tenantId = data.tenantId || LEGACY_TENANT_ID;

    this.db
      .prepare(
        `INSERT INTO projects (
          id, tenant_id, name, engine, host, port, database_name, username,
          password_encrypted, options_json, read_only, exposed_resources_json,
          active_capabilities_json, business_profile_json, connection_mode,
          edge_status, status, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '[]', '[]', NULL, ?, ?, ?, ?)`,
      )
      .run(
        id,
        tenantId,
        data.name,
        data.engine,
        data.host,
        data.port,
        data.database,
        data.username,
        passwordEncrypted,
        data.options ? JSON.stringify(data.options) : null,
        data.readOnly === false ? 0 : 1,
        mode,
        mode === "edge" ? "pending" : "pending",
        mode === "edge" ? "pending" : "connected",
        createdAt,
      );

    return this.get(id)!;
  }

  createEdgeProject(data: CreateEdgeProjectData): ProjectRecord {
    const id = randomUUID();
    const createdAt = new Date().toISOString();
    const tenantId = data.tenantId || LEGACY_TENANT_ID;
    const vertical: ProjectVertical =
      data.vertical === "engineering" ? "engineering" : "business";
    const engine =
      data.engine?.trim() ||
      (vertical === "engineering" ? "engineering" : "postgresql");
    const defaultSources =
      vertical === "engineering"
        ? JSON.stringify([
            { kind: "github", enabled: true, scopes: [] },
            { kind: "clickup", enabled: true, scopes: [] },
            { kind: "confluence", enabled: false, scopes: [] },
          ])
        : "[]";

    this.db
      .prepare(
        `INSERT INTO projects (
          id, tenant_id, name, engine, host, port, database_name, username,
          password_encrypted, options_json, read_only, exposed_resources_json,
          active_capabilities_json, business_profile_json, connection_mode,
          vertical, knowledge_sources_json,
          edge_status, status, created_at
        ) VALUES (?, ?, ?, ?, '', 0, '', '', '', NULL, ?, '[]', ?, NULL, 'edge', ?, ?, 'pending', 'pending', ?)`,
      )
      .run(
        id,
        tenantId,
        data.name,
        engine,
        data.readOnly === false ? 0 : 1,
        vertical === "engineering"
          ? JSON.stringify([...ENGINEERING_STORY_OS_CAPABILITIES])
          : "[]",
        vertical,
        defaultSources,
        createdAt,
      );

    return this.get(id)!;
  }

  setKnowledgeSources(
    id: string,
    sources: KnowledgeSourceConfig[],
  ): ProjectRecord | undefined {
    this.db
      .prepare(`UPDATE projects SET knowledge_sources_json = ? WHERE id = ?`)
      .run(JSON.stringify(sources), id);
    return this.get(id);
  }

  getKnowledgeSources(record: ProjectRecord): KnowledgeSourceConfig[] {
    return parseKnowledgeSources(record.knowledgeSourcesJson);
  }

  createEdgeToken(projectId: string): CreatedEdgeToken | undefined {
    const project = this.get(projectId);
    if (!project || project.connectionMode !== "edge") return undefined;

    const id = randomUUID();
    const token = generateEdgeToken();
    const createdAt = new Date().toISOString();
    const tokenPrefix = token.slice(0, 16);

    this.db
      .prepare(
        `INSERT INTO edge_tokens (id, project_id, token_hash, token_prefix, created_at)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .run(id, projectId, hashToken(token), tokenPrefix, createdAt);

    return { id, projectId, token, tokenPrefix, createdAt };
  }

  listEdgeTokens(projectId: string): EdgeTokenRecord[] {
    const rows = this.db
      .prepare(
        `SELECT id, project_id, token_prefix, created_at, revoked_at, last_used_at
         FROM edge_tokens WHERE project_id = ? ORDER BY created_at DESC`,
      )
      .all(projectId) as Array<Record<string, unknown>>;

    return rows.map((row) => ({
      id: String(row.id),
      projectId: String(row.project_id),
      tokenPrefix: String(row.token_prefix),
      createdAt: String(row.created_at),
      revokedAt: row.revoked_at == null ? null : String(row.revoked_at),
      lastUsedAt: row.last_used_at == null ? null : String(row.last_used_at),
    }));
  }

  revokeEdgeToken(projectId: string, tokenId: string): boolean {
    const now = new Date().toISOString();
    const info = this.db
      .prepare(
        `UPDATE edge_tokens SET revoked_at = ?
         WHERE id = ? AND project_id = ? AND revoked_at IS NULL`,
      )
      .run(now, tokenId, projectId);
    return info.changes > 0;
  }

  /** Resolve active (non-revoked) project from plaintext Edge token. */
  resolveEdgeToken(token: string): { projectId: string; tokenId: string } | undefined {
    const row = this.db
      .prepare(
        `SELECT id, project_id FROM edge_tokens
         WHERE token_hash = ? AND revoked_at IS NULL`,
      )
      .get(hashToken(token)) as { id: string; project_id: string } | undefined;
    if (!row) return undefined;

    const now = new Date().toISOString();
    this.db
      .prepare(`UPDATE edge_tokens SET last_used_at = ? WHERE id = ?`)
      .run(now, row.id);

    return { projectId: row.project_id, tokenId: row.id };
  }

  createMcpKey(
    projectId: string,
    name: string,
    createdByUserId?: string | null,
  ): CreatedProjectMcpKey | undefined {
    const project = this.get(projectId);
    if (!project) return undefined;

    const id = randomUUID();
    const token = generateMcpDevKey();
    const createdAt = new Date().toISOString();
    const tokenPrefix = token.slice(0, 16);
    const label = name.trim() || "Developer";

    this.db
      .prepare(
        `INSERT INTO project_mcp_keys (
          id, project_id, name, token_hash, token_prefix,
          created_by_user_id, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        projectId,
        label,
        hashToken(token),
        tokenPrefix,
        createdByUserId ?? null,
        createdAt,
      );

    return {
      id,
      projectId,
      name: label,
      token,
      tokenPrefix,
      createdAt,
    };
  }

  listMcpKeys(projectId: string): ProjectMcpKeyRecord[] {
    const rows = this.db
      .prepare(
        `SELECT id, project_id, name, token_prefix, created_by_user_id,
                created_at, revoked_at, last_used_at
         FROM project_mcp_keys
         WHERE project_id = ?
         ORDER BY created_at DESC`,
      )
      .all(projectId) as Array<Record<string, unknown>>;

    return rows.map((row) => ({
      id: String(row.id),
      projectId: String(row.project_id),
      name: String(row.name),
      tokenPrefix: String(row.token_prefix),
      createdByUserId:
        row.created_by_user_id == null ? null : String(row.created_by_user_id),
      createdAt: String(row.created_at),
      revokedAt: row.revoked_at == null ? null : String(row.revoked_at),
      lastUsedAt: row.last_used_at == null ? null : String(row.last_used_at),
    }));
  }

  revokeMcpKey(projectId: string, keyId: string): boolean {
    const now = new Date().toISOString();
    const info = this.db
      .prepare(
        `UPDATE project_mcp_keys SET revoked_at = ?
         WHERE id = ? AND project_id = ? AND revoked_at IS NULL`,
      )
      .run(now, keyId, projectId);
    return info.changes > 0;
  }

  /**
   * Resolve active MCP developer key.
   * Returns tenantId for auth context + projectId for path scoping.
   */
  resolveMcpKey(token: string): {
    keyId: string;
    projectId: string;
    tenantId: string;
  } | undefined {
    if (!token.startsWith("syn_mcp_")) return undefined;
    const row = this.db
      .prepare(
        `SELECT k.id, k.project_id, p.tenant_id
         FROM project_mcp_keys k
         JOIN projects p ON p.id = k.project_id
         WHERE k.token_hash = ? AND k.revoked_at IS NULL`,
      )
      .get(hashToken(token)) as
      | { id: string; project_id: string; tenant_id: string }
      | undefined;
    if (!row) return undefined;

    const now = new Date().toISOString();
    this.db
      .prepare(`UPDATE project_mcp_keys SET last_used_at = ? WHERE id = ?`)
      .run(now, row.id);

    return {
      keyId: row.id,
      projectId: row.project_id,
      tenantId: String(row.tenant_id ?? LEGACY_TENANT_ID),
    };
  }

  setEdgePresence(
    projectId: string,
    data: {
      status: EdgeStatus;
      version?: string | null;
      engine?: string | null;
      resourceCount?: number | null;
      /** When true, wipe resource count (e.g. DB probe failed). */
      clearResourceCount?: boolean;
      /** null clears; undefined keeps previous */
      lastError?: string | null;
    },
  ): ProjectRecord | undefined {
    const now = new Date().toISOString();
    const project = this.get(projectId);
    if (!project) return undefined;

    const engine = data.engine?.trim() || project.engine;
    const clearCount = Boolean(data.clearResourceCount) || data.status === "error";
    const lastError =
      data.lastError === undefined
        ? project.edgeLastError
        : data.lastError === null || data.lastError === ""
          ? null
          : data.lastError;
    const resourceCount = clearCount
      ? null
      : data.resourceCount !== undefined && data.resourceCount !== null
        ? data.resourceCount
        : project.edgeResourceCount;

    this.db
      .prepare(
        `UPDATE projects SET
          edge_status = ?,
          edge_last_seen = ?,
          edge_version = COALESCE(?, edge_version),
          edge_resource_count = ?,
          edge_last_error = ?,
          engine = ?,
          status = ?
         WHERE id = ?`,
      )
      .run(
        data.status,
        now,
        data.version ?? null,
        resourceCount,
        data.status === "online" ? null : lastError,
        engine,
        data.status === "online" ? "online" : data.status,
        projectId,
      );
    return this.get(projectId);
  }

  markEdgeOffline(projectId: string): void {
    this.db
      .prepare(
        `UPDATE projects SET edge_status = 'offline', status = 'offline' WHERE id = ? AND connection_mode = 'edge'`,
      )
      .run(projectId);
  }

  /** Cloud (direct DB) presence — not Edge. Reuses edge_last_error for the message. */
  setCloudStatus(
    projectId: string,
    status: "connected" | "error" | "pending",
    lastError?: string | null,
  ): ProjectRecord | undefined {
    const project = this.get(projectId);
    if (!project || project.connectionMode === "edge") return undefined;
    const errorMsg =
      status === "connected"
        ? null
        : (lastError && lastError.trim()) ||
          project.edgeLastError ||
          "Banco indisponível";
    this.db
      .prepare(
        `UPDATE projects SET
          status = ?,
          edge_last_error = ?
         WHERE id = ? AND connection_mode = 'cloud'`,
      )
      .run(status, errorMsg, projectId);
    return this.get(projectId);
  }

  list(): ProjectRecord[] {
    const rows = this.db.prepare(`SELECT * FROM projects ORDER BY created_at DESC`).all();
    return rows.map((r) => this.rowToRecord(r as Record<string, unknown>));
  }

  listForTenant(tenantId: string): ProjectRecord[] {
    const rows = this.db
      .prepare(
        `SELECT * FROM projects WHERE tenant_id = ? ORDER BY created_at DESC`,
      )
      .all(tenantId);
    return rows.map((r) => this.rowToRecord(r as Record<string, unknown>));
  }

  get(id: string): ProjectRecord | undefined {
    const row = this.db.prepare(`SELECT * FROM projects WHERE id = ?`).get(id);
    return row ? this.rowToRecord(row as Record<string, unknown>) : undefined;
  }

  getInTenant(id: string, tenantId: string): ProjectRecord | undefined {
    const row = this.db
      .prepare(`SELECT * FROM projects WHERE id = ? AND tenant_id = ?`)
      .get(id, tenantId);
    return row ? this.rowToRecord(row as Record<string, unknown>) : undefined;
  }

  delete(id: string): boolean {
    this.db.prepare(`DELETE FROM edge_tokens WHERE project_id = ?`).run(id);
    this.db.prepare(`DELETE FROM project_mcp_keys WHERE project_id = ?`).run(id);
    const info = this.db.prepare(`DELETE FROM projects WHERE id = ?`).run(id);
    return info.changes > 0;
  }

  isEdgeMode(record: ProjectRecord): boolean {
    return record.connectionMode === "edge";
  }

  setExposed(id: string, resources: string[]): ProjectRecord | undefined {
    this.db
      .prepare(`UPDATE projects SET exposed_resources_json = ? WHERE id = ?`)
      .run(JSON.stringify(resources), id);
    return this.get(id);
  }

  setActiveCapabilities(id: string, capabilityIds: string[]): ProjectRecord | undefined {
    this.db
      .prepare(`UPDATE projects SET active_capabilities_json = ? WHERE id = ?`)
      .run(JSON.stringify(capabilityIds), id);
    return this.get(id);
  }

  setBusinessProfile(id: string, profile: unknown): ProjectRecord | undefined {
    this.db
      .prepare(`UPDATE projects SET business_profile_json = ? WHERE id = ?`)
      .run(JSON.stringify(profile), id);
    return this.get(id);
  }

  setRoleOverrides(
    id: string,
    overrides: Record<string, string>,
  ): ProjectRecord | undefined {
    this.db
      .prepare(`UPDATE projects SET role_overrides_json = ? WHERE id = ?`)
      .run(JSON.stringify(overrides), id);
    return this.get(id);
  }

  getRoleOverrides(record: ProjectRecord): Record<string, string> {
    return parseJsonObject(record.roleOverridesJson);
  }

  toPublic(record: ProjectRecord): PublicProject {
    let status: PublicProject["status"] = record.status as PublicProject["status"];
    if (record.connectionMode === "edge") {
      if (record.edgeStatus === "online") status = "online";
      else if (record.edgeStatus === "offline") status = "offline";
      else if (record.edgeStatus === "error") status = "error";
      else status = "pending";
    } else if (status !== "error" && status !== "pending") {
      status = "connected";
    }

    return {
      id: record.id,
      tenantId: record.tenantId,
      name: record.name,
      engine: record.engine,
      host: record.connectionMode === "edge" ? "(edge)" : record.host,
      port: record.port,
      database: record.connectionMode === "edge" ? "(local)" : record.database,
      username: record.connectionMode === "edge" ? "(edge)" : record.username,
      readOnly: record.readOnly === 1,
      exposedResources: parseJsonArray(record.exposedResourcesJson),
      activeCapabilities: this.getActiveCapabilities(record),
      roleOverrides: parseJsonObject(record.roleOverridesJson),
      connectionMode: record.connectionMode,
      vertical: record.vertical,
      knowledgeSources: parseKnowledgeSources(record.knowledgeSourcesJson),
      edgeStatus: record.edgeStatus,
      edgeLastSeen: record.edgeLastSeen,
      edgeVersion: record.edgeVersion,
      edgeResourceCount: record.edgeResourceCount,
      edgeLastError: record.edgeLastError,
      llmConfig: (() => {
        const cfg = this.getLlmConfig(record);
        const hasProjectKey = Boolean(cfg.apiKey);
        const enabled =
          cfg.enabled === true &&
          hasProjectKey &&
          String(cfg.provider ?? "").toLowerCase() !== "none";
        if (!enabled) {
          return {
            provider: "none",
            hasApiKey: false,
            enabled: false,
          };
        }
        return {
          provider: cfg.provider ?? "openai",
          model: cfg.model,
          baseUrl: cfg.baseUrl,
          hasApiKey: true,
          enabled: true,
        };
      })(),
      status,
      createdAt: record.createdAt,
    };
  }

  getActiveCapabilities(record: ProjectRecord): string[] {
    const { caps, upgraded } = ensureStoryOsCapabilities(
      record.vertical,
      parseJsonArray(record.activeCapabilitiesJson),
    );
    if (upgraded) {
      this.db
        .prepare(`UPDATE projects SET active_capabilities_json = ? WHERE id = ?`)
        .run(JSON.stringify(caps), record.id);
      record.activeCapabilitiesJson = JSON.stringify(caps);
    }
    return caps;
  }

  recordEvent(
    projectId: string,
    type: ProductEventType,
    payload?: Record<string, unknown>,
  ): ProductEvent {
    return recordProductEvent(this.db, { projectId, type, payload });
  }

  getMetrics(): ProductMetrics {
    const projects = this.list().map((r) => ({
      id: r.id,
      createdAt: r.createdAt,
      activeCapabilities: parseJsonArray(r.activeCapabilitiesJson),
    }));
    return computeProductMetrics(this.db, projects);
  }

  toConnectionConfig(record: ProjectRecord): ConnectionConfig {
    if (record.connectionMode === "edge") {
      throw new Error(
        "Projeto em modo Edge: credenciais ficam no Edge. Instale o agente ou use jobs via gateway.",
      );
    }
    let options: Record<string, unknown> | undefined;
    if (record.optionsJson) {
      try {
        options = JSON.parse(record.optionsJson) as Record<string, unknown>;
      } catch {
        options = undefined;
      }
    }
    return {
      engine: record.engine,
      host: record.host,
      port: record.port,
      database: record.database,
      username: record.username,
      password: decrypt(record.passwordEncrypted, this.encryptionKey),
      options,
      readOnly: record.readOnly === 1,
    };
  }
}
