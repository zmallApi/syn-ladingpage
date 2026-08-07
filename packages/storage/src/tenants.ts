import type Database from "better-sqlite3";
import {
  createHash,
  randomBytes,
  randomUUID,
  scryptSync,
  timingSafeEqual,
} from "node:crypto";

export const LEGACY_TENANT_ID = "00000000-0000-4000-8000-000000000001";

export type MembershipRole = "owner" | "admin" | "member";
export type TenantPlan = "beta" | "starter" | "business" | "enterprise";
export type TenantStatus = "active" | "suspended";

export interface TenantRecord {
  id: string;
  name: string;
  slug: string;
  plan: TenantPlan;
  status: TenantStatus;
  maxProjects: number;
  maxMissionRunsMonth: number;
  createdAt: string;
}

export interface UserRecord {
  id: string;
  email: string;
  name: string;
  passwordHash: string;
  createdAt: string;
}

export interface MembershipRecord {
  tenantId: string;
  userId: string;
  role: MembershipRole;
}

export interface TenantApiKeyRecord {
  id: string;
  tenantId: string;
  name: string;
  prefix: string;
  createdAt: string;
  revokedAt: string | null;
}

export interface CreatedTenantApiKey extends TenantApiKeyRecord {
  /** Plaintext — shown once */
  token: string;
}

export interface TenantUsage {
  projects: number;
  missionRunsMonth: number;
  maxProjects: number;
  maxMissionRunsMonth: number;
}

const PLAN_DEFAULTS: Record<
  TenantPlan,
  { maxProjects: number; maxMissionRunsMonth: number }
> = {
  beta: { maxProjects: 3, maxMissionRunsMonth: 200 },
  starter: { maxProjects: 1, maxMissionRunsMonth: 100 },
  business: { maxProjects: 10, maxMissionRunsMonth: 2000 },
  enterprise: { maxProjects: 100, maxMissionRunsMonth: 50_000 },
};

function hashApiKey(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function generateTenantApiKey(): string {
  return `syn_tk_${randomBytes(24).toString("base64url")}`;
}

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `scrypt$${salt}$${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const parts = stored.split("$");
  if (parts.length !== 3 || parts[0] !== "scrypt") return false;
  const [, salt, hash] = parts;
  const next = scryptSync(password, salt, 64).toString("hex");
  try {
    return timingSafeEqual(Buffer.from(hash, "hex"), Buffer.from(next, "hex"));
  } catch {
    return false;
  }
}

function slugify(name: string): string {
  const base = name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return base || "tenant";
}

export class TenantStore {
  constructor(private db: Database.Database) {
    this.migrate();
  }

  private migrate() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS tenants (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        slug TEXT NOT NULL UNIQUE,
        plan TEXT NOT NULL DEFAULT 'beta',
        status TEXT NOT NULL DEFAULT 'active',
        max_projects INTEGER NOT NULL DEFAULT 3,
        max_mission_runs_month INTEGER NOT NULL DEFAULT 200,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        email TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        password_hash TEXT NOT NULL,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS memberships (
        tenant_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        role TEXT NOT NULL,
        PRIMARY KEY (tenant_id, user_id),
        FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS tenant_api_keys (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        name TEXT NOT NULL,
        token_hash TEXT NOT NULL UNIQUE,
        prefix TEXT NOT NULL,
        created_at TEXT NOT NULL,
        revoked_at TEXT,
        FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_memberships_user ON memberships(user_id);
      CREATE INDEX IF NOT EXISTS idx_tenant_keys_tenant ON tenant_api_keys(tenant_id);
    `);

    this.ensureLegacyTenant();
  }

  /** Ops tenant for projects created before multi-tenant. */
  private ensureLegacyTenant() {
    const existing = this.db
      .prepare(`SELECT id FROM tenants WHERE id = ?`)
      .get(LEGACY_TENANT_ID) as { id: string } | undefined;
    if (existing) return;

    const createdAt = new Date().toISOString();
    this.db
      .prepare(
        `INSERT INTO tenants (
          id, name, slug, plan, status, max_projects, max_mission_runs_month, created_at
        ) VALUES (?, ?, ?, 'enterprise', 'active', 1000, 100000, ?)`,
      )
      .run(LEGACY_TENANT_ID, "Legacy / Ops", "legacy-ops", createdAt);
  }

  private uniqueSlug(base: string): string {
    let slug = slugify(base);
    let n = 0;
    while (
      this.db.prepare(`SELECT 1 FROM tenants WHERE slug = ?`).get(slug)
    ) {
      n += 1;
      slug = `${slugify(base)}-${n}`;
    }
    return slug;
  }

  private rowToTenant(row: Record<string, unknown>): TenantRecord {
    const plan = String(row.plan ?? "beta") as TenantPlan;
    return {
      id: String(row.id),
      name: String(row.name),
      slug: String(row.slug),
      plan: PLAN_DEFAULTS[plan] ? plan : "beta",
      status: row.status === "suspended" ? "suspended" : "active",
      maxProjects: Number(row.max_projects ?? 3),
      maxMissionRunsMonth: Number(row.max_mission_runs_month ?? 200),
      createdAt: String(row.created_at),
    };
  }

  getTenant(id: string): TenantRecord | undefined {
    const row = this.db
      .prepare(`SELECT * FROM tenants WHERE id = ?`)
      .get(id) as Record<string, unknown> | undefined;
    return row ? this.rowToTenant(row) : undefined;
  }

  getUserByEmail(email: string): UserRecord | undefined {
    const row = this.db
      .prepare(`SELECT * FROM users WHERE email = ?`)
      .get(email.trim().toLowerCase()) as Record<string, unknown> | undefined;
    if (!row) return undefined;
    return {
      id: String(row.id),
      email: String(row.email),
      name: String(row.name),
      passwordHash: String(row.password_hash),
      createdAt: String(row.created_at),
    };
  }

  getUserById(id: string): UserRecord | undefined {
    const row = this.db
      .prepare(`SELECT * FROM users WHERE id = ?`)
      .get(id) as Record<string, unknown> | undefined;
    if (!row) return undefined;
    return {
      id: String(row.id),
      email: String(row.email),
      name: String(row.name),
      passwordHash: String(row.password_hash),
      createdAt: String(row.created_at),
    };
  }

  getMembership(userId: string, tenantId: string): MembershipRecord | undefined {
    const row = this.db
      .prepare(
        `SELECT * FROM memberships WHERE user_id = ? AND tenant_id = ?`,
      )
      .get(userId, tenantId) as Record<string, unknown> | undefined;
    if (!row) return undefined;
    return {
      tenantId: String(row.tenant_id),
      userId: String(row.user_id),
      role: String(row.role) as MembershipRole,
    };
  }

  /** MVP: first membership for the user. */
  getPrimaryMembership(userId: string): MembershipRecord | undefined {
    const row = this.db
      .prepare(
        `SELECT * FROM memberships WHERE user_id = ? ORDER BY rowid ASC LIMIT 1`,
      )
      .get(userId) as Record<string, unknown> | undefined;
    if (!row) return undefined;
    return {
      tenantId: String(row.tenant_id),
      userId: String(row.user_id),
      role: String(row.role) as MembershipRole,
    };
  }

  createTenantWithOwner(input: {
    companyName: string;
    email: string;
    password: string;
    userName?: string;
  }): {
    tenant: TenantRecord;
    user: UserRecord;
    membership: MembershipRecord;
    apiKey: CreatedTenantApiKey;
  } {
    const email = input.email.trim().toLowerCase();
    if (this.getUserByEmail(email)) {
      throw new Error("EMAIL_TAKEN");
    }

    const tenantId = randomUUID();
    const userId = randomUUID();
    const createdAt = new Date().toISOString();
    const plan: TenantPlan = "beta";
    const defaults = PLAN_DEFAULTS[plan];
    const slug = this.uniqueSlug(input.companyName);
    const name = input.userName?.trim() || email.split("@")[0] || "Owner";

    const tx = this.db.transaction(() => {
      this.db
        .prepare(
          `INSERT INTO tenants (
            id, name, slug, plan, status, max_projects, max_mission_runs_month, created_at
          ) VALUES (?, ?, ?, ?, 'active', ?, ?, ?)`,
        )
        .run(
          tenantId,
          input.companyName.trim(),
          slug,
          plan,
          defaults.maxProjects,
          defaults.maxMissionRunsMonth,
          createdAt,
        );

      this.db
        .prepare(
          `INSERT INTO users (id, email, name, password_hash, created_at)
           VALUES (?, ?, ?, ?, ?)`,
        )
        .run(userId, email, name, hashPassword(input.password), createdAt);

      this.db
        .prepare(
          `INSERT INTO memberships (tenant_id, user_id, role) VALUES (?, ?, 'owner')`,
        )
        .run(tenantId, userId);
    });
    tx();

    const apiKey = this.createApiKey(tenantId, "Default");
    return {
      tenant: this.getTenant(tenantId)!,
      user: this.getUserById(userId)!,
      membership: { tenantId, userId, role: "owner" },
      apiKey,
    };
  }

  createApiKey(tenantId: string, name: string): CreatedTenantApiKey {
    const tenant = this.getTenant(tenantId);
    if (!tenant) throw new Error("TENANT_NOT_FOUND");

    const id = randomUUID();
    const token = generateTenantApiKey();
    const createdAt = new Date().toISOString();
    const prefix = token.slice(0, 14);

    this.db
      .prepare(
        `INSERT INTO tenant_api_keys (id, tenant_id, name, token_hash, prefix, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(id, tenantId, name.trim() || "API key", hashApiKey(token), prefix, createdAt);

    return {
      id,
      tenantId,
      name: name.trim() || "API key",
      prefix,
      createdAt,
      revokedAt: null,
      token,
    };
  }

  listApiKeys(tenantId: string): TenantApiKeyRecord[] {
    const rows = this.db
      .prepare(
        `SELECT id, tenant_id, name, prefix, created_at, revoked_at
         FROM tenant_api_keys WHERE tenant_id = ? ORDER BY created_at DESC`,
      )
      .all(tenantId) as Array<Record<string, unknown>>;

    return rows.map((row) => ({
      id: String(row.id),
      tenantId: String(row.tenant_id),
      name: String(row.name),
      prefix: String(row.prefix),
      createdAt: String(row.created_at),
      revokedAt: row.revoked_at == null ? null : String(row.revoked_at),
    }));
  }

  revokeApiKey(tenantId: string, keyId: string): boolean {
    const now = new Date().toISOString();
    const info = this.db
      .prepare(
        `UPDATE tenant_api_keys SET revoked_at = ?
         WHERE id = ? AND tenant_id = ? AND revoked_at IS NULL`,
      )
      .run(now, keyId, tenantId);
    return info.changes > 0;
  }

  resolveApiKey(
    raw: string,
  ): { tenantId: string; keyId: string } | undefined {
    const row = this.db
      .prepare(
        `SELECT id, tenant_id FROM tenant_api_keys
         WHERE token_hash = ? AND revoked_at IS NULL`,
      )
      .get(hashApiKey(raw)) as { id: string; tenant_id: string } | undefined;
    if (!row) return undefined;
    return { tenantId: row.tenant_id, keyId: row.id };
  }

  countProjects(tenantId: string): number {
    const row = this.db
      .prepare(`SELECT COUNT(*) AS n FROM projects WHERE tenant_id = ?`)
      .get(tenantId) as { n: number };
    return Number(row?.n ?? 0);
  }

  countMissionRunsMonth(tenantId: string): number {
    const start = new Date();
    start.setUTCDate(1);
    start.setUTCHours(0, 0, 0, 0);
    const since = start.toISOString();
    const row = this.db
      .prepare(
        `SELECT COUNT(*) AS n FROM mission_runs mr
         INNER JOIN projects p ON p.id = mr.project_id
         WHERE p.tenant_id = ? AND mr.created_at >= ?`,
      )
      .get(tenantId, since) as { n: number };
    return Number(row?.n ?? 0);
  }

  getUsage(tenantId: string): TenantUsage | undefined {
    const tenant = this.getTenant(tenantId);
    if (!tenant) return undefined;
    return {
      projects: this.countProjects(tenantId),
      missionRunsMonth: this.countMissionRunsMonth(tenantId),
      maxProjects: tenant.maxProjects,
      maxMissionRunsMonth: tenant.maxMissionRunsMonth,
    };
  }

  assertCanCreateProject(tenantId: string): void {
    const usage = this.getUsage(tenantId);
    if (!usage) throw new Error("TENANT_NOT_FOUND");
    if (usage.projects >= usage.maxProjects) {
      throw new Error("QUOTA_PROJECTS");
    }
  }

  assertCanRunMission(tenantId: string): void {
    const usage = this.getUsage(tenantId);
    if (!usage) throw new Error("TENANT_NOT_FOUND");
    if (usage.missionRunsMonth >= usage.maxMissionRunsMonth) {
      throw new Error("QUOTA_MISSIONS");
    }
  }
}
