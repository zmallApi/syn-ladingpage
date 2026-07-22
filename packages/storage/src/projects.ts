import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import type { ConnectionConfig } from "@synapse/core";
import { decrypt, encrypt } from "./crypto.js";
import {
  computeProductMetrics,
  migrateProductEvents,
  recordProductEvent,
  type ProductEvent,
  type ProductEventType,
  type ProductMetrics,
} from "./events.js";

export type ConnectionMode = "cloud" | "edge";
export type EdgeStatus = "pending" | "online" | "offline" | "error";

export interface ProjectRecord {
  id: string;
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
  edgeStatus: EdgeStatus;
  edgeLastSeen: string | null;
  edgeVersion: string | null;
  edgeResourceCount: number | null;
  status: string;
  createdAt: string;
}

export interface CreateProjectData {
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
  name: string;
  engine?: string;
  readOnly?: boolean;
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

export interface PublicProject {
  id: string;
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
  edgeStatus: EdgeStatus;
  edgeLastSeen: string | null;
  edgeVersion: string | null;
  edgeResourceCount: number | null;
  status: "connected" | "error" | "pending" | "online" | "offline";
  createdAt: string;
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function generateEdgeToken(): string {
  return `syn_edge_${randomBytes(24).toString("base64url")}`;
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

export class ProjectStore {
  private db: Database.Database;
  private encryptionKey: string;

  constructor(dbPath: string, encryptionKey: string) {
    mkdirSync(dirname(dbPath), { recursive: true });
    this.db = new Database(dbPath);
    this.encryptionKey = encryptionKey;
    this.db.pragma("journal_mode = WAL");
    this.migrate();
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

    migrateProductEvents(this.db);
  }

  private rowToRecord(row: Record<string, unknown>): ProjectRecord {
    return {
      id: String(row.id),
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
      edgeStatus: (String(row.edge_status ?? "pending") as EdgeStatus) || "pending",
      edgeLastSeen: row.edge_last_seen == null ? null : String(row.edge_last_seen),
      edgeVersion: row.edge_version == null ? null : String(row.edge_version),
      edgeResourceCount:
        row.edge_resource_count == null ? null : Number(row.edge_resource_count),
      status: String(row.status),
      createdAt: String(row.created_at),
    };
  }

  create(data: CreateProjectData): ProjectRecord {
    const id = randomUUID();
    const createdAt = new Date().toISOString();
    const mode: ConnectionMode = data.connectionMode === "edge" ? "edge" : "cloud";
    const passwordEncrypted = encrypt(data.password, this.encryptionKey);

    this.db
      .prepare(
        `INSERT INTO projects (
          id, name, engine, host, port, database_name, username,
          password_encrypted, options_json, read_only, exposed_resources_json,
          active_capabilities_json, business_profile_json, connection_mode,
          edge_status, status, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '[]', '[]', NULL, ?, ?, ?, ?)`,
      )
      .run(
        id,
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
    const engine = data.engine?.trim() || "postgresql";

    this.db
      .prepare(
        `INSERT INTO projects (
          id, name, engine, host, port, database_name, username,
          password_encrypted, options_json, read_only, exposed_resources_json,
          active_capabilities_json, business_profile_json, connection_mode,
          edge_status, status, created_at
        ) VALUES (?, ?, ?, '', 0, '', '', '', NULL, ?, '[]', '[]', NULL, 'edge', 'pending', 'pending', ?)`,
      )
      .run(id, data.name, engine, data.readOnly === false ? 0 : 1, createdAt);

    return this.get(id)!;
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

  setEdgePresence(
    projectId: string,
    data: {
      status: EdgeStatus;
      version?: string | null;
      engine?: string | null;
      resourceCount?: number | null;
    },
  ): ProjectRecord | undefined {
    const now = new Date().toISOString();
    const project = this.get(projectId);
    if (!project) return undefined;

    const engine = data.engine?.trim() || project.engine;
    this.db
      .prepare(
        `UPDATE projects SET
          edge_status = ?,
          edge_last_seen = ?,
          edge_version = COALESCE(?, edge_version),
          edge_resource_count = COALESCE(?, edge_resource_count),
          engine = ?,
          status = ?
         WHERE id = ?`,
      )
      .run(
        data.status,
        now,
        data.version ?? null,
        data.resourceCount ?? null,
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

  list(): ProjectRecord[] {
    const rows = this.db.prepare(`SELECT * FROM projects ORDER BY created_at DESC`).all();
    return rows.map((r) => this.rowToRecord(r as Record<string, unknown>));
  }

  get(id: string): ProjectRecord | undefined {
    const row = this.db.prepare(`SELECT * FROM projects WHERE id = ?`).get(id);
    return row ? this.rowToRecord(row as Record<string, unknown>) : undefined;
  }

  delete(id: string): boolean {
    this.db.prepare(`DELETE FROM edge_tokens WHERE project_id = ?`).run(id);
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
      name: record.name,
      engine: record.engine,
      host: record.connectionMode === "edge" ? "(edge)" : record.host,
      port: record.port,
      database: record.connectionMode === "edge" ? "(local)" : record.database,
      username: record.connectionMode === "edge" ? "(edge)" : record.username,
      readOnly: record.readOnly === 1,
      exposedResources: parseJsonArray(record.exposedResourcesJson),
      activeCapabilities: parseJsonArray(record.activeCapabilitiesJson),
      roleOverrides: parseJsonObject(record.roleOverridesJson),
      connectionMode: record.connectionMode,
      edgeStatus: record.edgeStatus,
      edgeLastSeen: record.edgeLastSeen,
      edgeVersion: record.edgeVersion,
      edgeResourceCount: record.edgeResourceCount,
      status,
      createdAt: record.createdAt,
    };
  }

  getActiveCapabilities(record: ProjectRecord): string[] {
    return parseJsonArray(record.activeCapabilitiesJson);
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
