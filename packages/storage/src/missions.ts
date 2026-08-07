import type Database from "better-sqlite3";
import { randomUUID } from "node:crypto";

export interface MissionRunRecord {
  id: string;
  projectId: string;
  missionId: string;
  paramsJson: string;
  packageJson: string;
  capabilityTraceJson: string;
  ready: boolean;
  createdAt: string;
}

export class MissionStore {
  constructor(private db: Database.Database) {
    this.migrate();
  }

  private migrate() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS mission_runs (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        mission_id TEXT NOT NULL,
        params_json TEXT NOT NULL DEFAULT '{}',
        package_json TEXT NOT NULL,
        capability_trace_json TEXT NOT NULL DEFAULT '[]',
        ready INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_mission_runs_project
        ON mission_runs(project_id, created_at DESC);
    `);
  }

  save(input: {
    projectId: string;
    missionId: string;
    params: Record<string, unknown>;
    package: unknown;
    capabilityTrace: string[];
    ready: boolean;
  }): MissionRunRecord {
    const id = randomUUID();
    const createdAt = new Date().toISOString();
    this.db
      .prepare(
        `INSERT INTO mission_runs (
          id, project_id, mission_id, params_json, package_json,
          capability_trace_json, ready, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        input.projectId,
        input.missionId,
        JSON.stringify(input.params ?? {}),
        JSON.stringify(input.package),
        JSON.stringify(input.capabilityTrace ?? []),
        input.ready ? 1 : 0,
        createdAt,
      );
    return {
      id,
      projectId: input.projectId,
      missionId: input.missionId,
      paramsJson: JSON.stringify(input.params ?? {}),
      packageJson: JSON.stringify(input.package),
      capabilityTraceJson: JSON.stringify(input.capabilityTrace ?? []),
      ready: input.ready,
      createdAt,
    };
  }

  list(projectId: string, limit = 20): MissionRunRecord[] {
    const rows = this.db
      .prepare(
        `SELECT * FROM mission_runs
         WHERE project_id = ?
         ORDER BY created_at DESC
         LIMIT ?`,
      )
      .all(projectId, limit) as Array<Record<string, unknown>>;
    return rows.map((r) => ({
      id: String(r.id),
      projectId: String(r.project_id),
      missionId: String(r.mission_id),
      paramsJson: String(r.params_json),
      packageJson: String(r.package_json),
      capabilityTraceJson: String(r.capability_trace_json),
      ready: Boolean(r.ready),
      createdAt: String(r.created_at),
    }));
  }

  get(projectId: string, runId: string): MissionRunRecord | null {
    const r = this.db
      .prepare(
        `SELECT * FROM mission_runs WHERE project_id = ? AND id = ?`,
      )
      .get(projectId, runId) as Record<string, unknown> | undefined;
    if (!r) return null;
    return {
      id: String(r.id),
      projectId: String(r.project_id),
      missionId: String(r.mission_id),
      paramsJson: String(r.params_json),
      packageJson: String(r.package_json),
      capabilityTraceJson: String(r.capability_trace_json),
      ready: Boolean(r.ready),
      createdAt: String(r.created_at),
    };
  }
}
