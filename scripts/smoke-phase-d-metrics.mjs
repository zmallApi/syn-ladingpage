/**
 * Phase D smoke: product_events + computeProductMetrics.
 * Run: npx tsx scripts/smoke-phase-d-metrics.mjs
 */
import Database from "better-sqlite3";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  computeProductMetrics,
  migrateProductEvents,
  recordProductEvent,
} from "../packages/storage/src/events.ts";

const dir = mkdtempSync(join(tmpdir(), "synapsee-d-"));
const dbPath = join(dir, "test.sqlite");
const db = new Database(dbPath);

try {
  migrateProductEvents(db);

  const t0 = "2026-07-01T10:00:00.000Z";
  const t1 = "2026-07-01T10:05:00.000Z"; // 5 min
  const t2 = "2026-07-01T11:00:00.000Z"; // 60 min
  const recent = new Date().toISOString();

  const projects = [
    { id: "p1", createdAt: t0, activeCapabilities: ["search_parties", "party_360"] },
    { id: "p2", createdAt: t0, activeCapabilities: [] },
    { id: "p3", createdAt: t0, activeCapabilities: ["list_at_risk"] },
  ];

  recordProductEvent(db, {
    projectId: "p1",
    type: "capability_activated",
    payload: { capabilityIds: ["search_parties"] },
  });
  // backdate first useful for p1
  db.prepare(
    `UPDATE product_events SET created_at = ? WHERE project_id = ? AND type = ?`,
  ).run(t0, "p1", "capability_activated");

  const e1 = recordProductEvent(db, {
    projectId: "p1",
    type: "cap_preview",
    payload: { capabilityId: "search_parties" },
  });
  db.prepare(`UPDATE product_events SET created_at = ? WHERE id = ?`).run(t1, e1.id);

  const e2 = recordProductEvent(db, {
    projectId: "p3",
    type: "cap_mcp_invoke",
    payload: { capabilityId: "list_at_risk" },
  });
  db.prepare(`UPDATE product_events SET created_at = ? WHERE id = ?`).run(t2, e2.id);

  recordProductEvent(db, {
    projectId: "p1",
    type: "role_override",
    payload: { changed: 1 },
  });
  db.prepare(
    `UPDATE product_events SET created_at = ? WHERE type = 'role_override'`,
  ).run(recent);

  const metrics = computeProductMetrics(db, projects);

  const assert = (cond, msg) => {
    if (!cond) throw new Error(msg);
  };

  assert(metrics.projectsTotal === 3, `projectsTotal=${metrics.projectsTotal}`);
  assert(
    metrics.projectsWithActiveCapabilities === 2,
    `withCaps=${metrics.projectsWithActiveCapabilities}`,
  );
  assert(
    metrics.pctWithActiveCapabilities === 66.7,
    `pct=${metrics.pctWithActiveCapabilities}`,
  );
  assert(metrics.overridesLast7Days === 1, `overrides=${metrics.overridesLast7Days}`);
  assert(
    metrics.timeToFirstUseful.sampleSize === 2,
    `sample=${metrics.timeToFirstUseful.sampleSize}`,
  );
  assert(
    metrics.timeToFirstUseful.medianMs === 5 * 60 * 1000,
    `median=${metrics.timeToFirstUseful.medianMs}`,
  );
  assert(
    metrics.timeToFirstUseful.p90Ms === 60 * 60 * 1000,
    `p90=${metrics.timeToFirstUseful.p90Ms}`,
  );

  console.log("smoke-phase-d-metrics: OK", metrics);
} finally {
  db.close();
  rmSync(dir, { recursive: true, force: true });
}
