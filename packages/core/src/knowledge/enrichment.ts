import { createHash } from "node:crypto";

/** Durable Knowledge Layer enrichments (proposed → confirmed). */
export type EnrichmentKind =
  | "entity_role"
  | "relationship"
  | "domain_tag"
  | "semantic_summary"
  | "risk_signal"
  | "module_map";

export type EnrichmentStatus = "proposed" | "confirmed" | "rejected";

export interface KnowledgeEnrichment {
  id: string;
  projectId: string;
  subjectId: string;
  kind: EnrichmentKind;
  payload: Record<string, unknown>;
  confidence: number;
  status: EnrichmentStatus;
  provider: string;
  model: string;
  promptVersion: string;
  inputFingerprint: string;
  evidence: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export type EnrichmentUpsert = Omit<
  KnowledgeEnrichment,
  "id" | "createdAt" | "updatedAt" | "projectId"
> & { id?: string };

export interface EnrichmentPort {
  findFresh(
    subjectId: string,
    kind: EnrichmentKind,
    inputFingerprint: string,
  ): KnowledgeEnrichment | null;
  listBySubjects(
    subjectIds: string[],
    opts?: { status?: EnrichmentStatus | EnrichmentStatus[]; kinds?: EnrichmentKind[] },
  ): KnowledgeEnrichment[];
  list(opts?: {
    status?: EnrichmentStatus;
    kind?: EnrichmentKind;
    limit?: number;
  }): KnowledgeEnrichment[];
  upsert(row: EnrichmentUpsert): KnowledgeEnrichment;
  setStatus(
    id: string,
    status: EnrichmentStatus,
  ): KnowledgeEnrichment | null;
}

export const SEMANTIC_SUMMARY_PROMPT_VERSION = "semantic_summary_v1";
export const ENTITY_ROLE_PROMPT_VERSION = "entity_role_v1";
export const DOMAIN_TAG_PROMPT_VERSION = "domain_tag_v1";

export function fingerprintInput(parts: unknown[]): string {
  const h = createHash("sha256");
  h.update(JSON.stringify(parts));
  return h.digest("hex").slice(0, 32);
}

export function schemaSubjectId(resourceName: string): string {
  return `schema:${resourceName}`;
}

export function projectDomainSubjectId(projectId: string): string {
  return `project:${projectId}:domain`;
}
