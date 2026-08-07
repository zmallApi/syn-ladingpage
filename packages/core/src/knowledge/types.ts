/** Canonical engineering facts — only facts, never conclusions. */

export type CanonicalEntityType =
  | "Story"
  | "Task"
  | "Epic"
  | "Repository"
  | "Branch"
  | "Commit"
  | "PullRequest"
  | "Module"
  | "Service"
  | "API"
  | "Document";

export type CanonicalRelation =
  | "child"
  | "implements"
  | "contains"
  | "touches"
  | "related_to";

/** inferred = linker; confirmed/rejected = humano (sobrevive ao re-link). */
export type EdgeStatus = "inferred" | "confirmed" | "rejected";

export type ProjectionKind = "github" | "clickup" | "confluence";

export type KnowledgeSource = ProjectionKind | "inferred";

export interface CanonicalEntity {
  /** Stable id within a project: `${source}:${type}:${externalId}` */
  id: string;
  type: CanonicalEntityType;
  source: KnowledgeSource;
  externalId: string;
  title: string;
  url?: string;
  updatedAt?: string;
  text: string;
  payload: Record<string, unknown>;
}

export interface CanonicalEdge {
  fromId: string;
  toId: string;
  rel: CanonicalRelation;
  score?: number;
  evidence?: Record<string, unknown>;
  status?: EdgeStatus;
}

export function edgeKey(
  fromId: string,
  rel: CanonicalRelation | string,
  toId: string,
): string {
  return `${fromId}|${rel}|${toId}`;
}

export type CanonicalFact =
  | { kind: "entity"; entity: CanonicalEntity }
  | { kind: "edge"; edge: CanonicalEdge };

/** Watermark ISO for incremental sync (max entity.updatedAt in a page). */
export function watermarkFromFacts(facts: CanonicalFact[]): string | null {
  let max = 0;
  for (const f of facts) {
    if (f.kind !== "entity" || !f.entity.updatedAt) continue;
    const t = Date.parse(f.entity.updatedAt);
    if (!Number.isNaN(t) && t > max) max = t;
  }
  return max > 0 ? new Date(max).toISOString() : null;
}

export interface ScopeMeta {
  id: string;
  label: string;
  kind: string;
  meta?: Record<string, unknown>;
}

export interface SourceProjection {
  kind: ProjectionKind;
  testConnection(): Promise<void>;
  introspectScopes(): Promise<ScopeMeta[]>;
  project(cursor?: string | null): AsyncIterable<CanonicalFact>;
  getByExternalId(
    type: CanonicalEntityType,
    externalId: string,
  ): Promise<CanonicalEntity | null>;
}

export function entityId(
  source: KnowledgeSource,
  type: CanonicalEntityType,
  externalId: string,
): string {
  return `${source}:${type}:${externalId}`;
}
