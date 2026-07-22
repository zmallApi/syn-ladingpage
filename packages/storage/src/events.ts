import type Database from "better-sqlite3";
import { randomUUID } from "node:crypto";

export type ProductEventType =
  | "capability_activated"
  | "role_override"
  | "cap_preview"
  | "cap_mcp_invoke";

export interface ProductEvent {
  id: string;
  projectId: string;
  type: ProductEventType;
  payload: Record<string, unknown>;
  createdAt: string;
}

export interface ProductMetrics {
  projectsTotal: number;
  projectsWithActiveCapabilities: number;
  pctWithActiveCapabilities: number;
  avgActiveCapabilities: number;
  overridesLast7Days: number;
  timeToFirstUseful: {
    sampleSize: number;
    medianMs: number | null;
    p90Ms: number | null;
  };
  eventsLast7Days: Array<{ type: ProductEventType; count: number }>;
}

function percentile(sorted: number[], p: number): number | null {
  if (!sorted.length) return null;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil(p * sorted.length) - 1));
  return sorted[idx]!;
}

export function migrateProductEvents(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS product_events (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      type TEXT NOT NULL,
      payload_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_product_events_type_created
      ON product_events (type, created_at);
    CREATE INDEX IF NOT EXISTS idx_product_events_project_type
      ON product_events (project_id, type, created_at);
  `);
}

export function recordProductEvent(
  db: Database.Database,
  input: {
    projectId: string;
    type: ProductEventType;
    payload?: Record<string, unknown>;
  },
): ProductEvent {
  const id = randomUUID();
  const createdAt = new Date().toISOString();
  const payload = input.payload ?? {};
  db.prepare(
    `INSERT INTO product_events (id, project_id, type, payload_json, created_at)
     VALUES (?, ?, ?, ?, ?)`,
  ).run(id, input.projectId, input.type, JSON.stringify(payload), createdAt);

  return {
    id,
    projectId: input.projectId,
    type: input.type,
    payload,
    createdAt,
  };
}

export function computeProductMetrics(
  db: Database.Database,
  projects: Array<{ id: string; createdAt: string; activeCapabilities: string[] }>,
): ProductMetrics {
  const projectsTotal = projects.length;
  const withCaps = projects.filter((p) => p.activeCapabilities.length > 0);
  const projectsWithActiveCapabilities = withCaps.length;
  const pctWithActiveCapabilities =
    projectsTotal === 0
      ? 0
      : Math.round((projectsWithActiveCapabilities / projectsTotal) * 1000) / 10;
  const avgActiveCapabilities =
    projectsTotal === 0
      ? 0
      : Math.round(
          (projects.reduce((sum, p) => sum + p.activeCapabilities.length, 0) /
            projectsTotal) *
            10,
        ) / 10;

  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const overridesLast7Days = Number(
    (
      db
        .prepare(
          `SELECT COUNT(*) AS c FROM product_events
           WHERE type = 'role_override' AND created_at >= ?`,
        )
        .get(weekAgo) as { c: number }
    ).c,
  );

  const eventRows = db
    .prepare(
      `SELECT type, COUNT(*) AS c FROM product_events
       WHERE created_at >= ?
       GROUP BY type
       ORDER BY type`,
    )
    .all(weekAgo) as Array<{ type: string; c: number }>;

  const eventsLast7Days = eventRows.map((r) => ({
    type: r.type as ProductEventType,
    count: Number(r.c),
  }));

  const projectCreated = new Map(projects.map((p) => [p.id, p.createdAt]));
  const firstUsefulRows = db
    .prepare(
      `SELECT project_id AS projectId, MIN(created_at) AS firstAt
       FROM product_events
       WHERE type IN ('cap_preview', 'cap_mcp_invoke')
       GROUP BY project_id`,
    )
    .all() as Array<{ projectId: string; firstAt: string }>;

  const deltas: number[] = [];
  for (const row of firstUsefulRows) {
    const created = projectCreated.get(row.projectId);
    if (!created) continue;
    const ms = Date.parse(row.firstAt) - Date.parse(created);
    if (Number.isFinite(ms) && ms >= 0) deltas.push(ms);
  }
  deltas.sort((a, b) => a - b);

  return {
    projectsTotal,
    projectsWithActiveCapabilities,
    pctWithActiveCapabilities,
    avgActiveCapabilities,
    overridesLast7Days,
    timeToFirstUseful: {
      sampleSize: deltas.length,
      medianMs: percentile(deltas, 0.5),
      p90Ms: percentile(deltas, 0.9),
    },
    eventsLast7Days,
  };
}
