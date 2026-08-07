import type { CanonicalEntity, CanonicalEdge } from "./types.js";
import type { KnowledgeLayerPort } from "./context.js";
import { significantTokens } from "./similarity.js";
import { resolveTaskRef } from "./resolveTask.js";

/**
 * Context Engine core — gathers facts only. No decisions / conclusions.
 * Answers: what evidence exists? what is related? which documents/modules?
 */
export interface EvidenceAnswer {
  question: string;
  facts: Array<Pick<CanonicalEntity, "id" | "type" | "title" | "url" | "source">>;
}

export interface GatherEvidenceResult {
  subject: CanonicalEntity | null;
  query: string;
  facts: CanonicalEntity[];
  edges: CanonicalEdge[];
  answers: EvidenceAnswer[];
  warnings: string[];
}

export function gatherEvidence(
  kl: KnowledgeLayerPort,
  query: string,
  opts?: { limit?: number; depth?: number },
): GatherEvidenceResult {
  const limit = opts?.limit ?? 40;
  const depth = opts?.depth ?? 2;
  const warnings: string[] = [];

  const resolved = resolveTaskRef(kl, query);
  const subject = "error" in resolved ? null : resolved.task;
  if ("error" in resolved) {
    warnings.push(resolved.error);
  }

  const searchHits = kl.searchFacts(query, limit);
  const tokenHits: CanonicalEntity[] = [];
  for (const token of significantTokens(query).slice(0, 8)) {
    for (const hit of kl.searchFacts(token, 10)) {
      tokenHits.push(hit);
    }
  }

  let neighborhood: { entities: CanonicalEntity[]; edges: CanonicalEdge[] } = {
    entities: [],
    edges: [],
  };
  if (subject) {
    neighborhood = kl.traverse(subject.id, { depth });
  }

  const byId = new Map<string, CanonicalEntity>();
  for (const e of [
    ...(subject ? [subject] : []),
    ...neighborhood.entities,
    ...searchHits,
    ...tokenHits,
  ]) {
    byId.set(e.id, e);
  }
  const facts = [...byId.values()].slice(0, limit);

  const documents = facts.filter((f) => f.type === "Document");
  const modules = facts.filter(
    (f) => f.type === "Module" || f.type === "Service" || f.type === "API",
  );
  const relatedCode = facts.filter(
    (f) =>
      f.type === "PullRequest" ||
      f.type === "Commit" ||
      f.type === "Repository",
  );

  const answers: EvidenceAnswer[] = [
    {
      question: "quais evidências existem?",
      facts: facts.slice(0, 20).map(slim),
    },
    {
      question: "quais fatos estão relacionados?",
      facts: neighborhood.entities.slice(0, 20).map(slim),
    },
    {
      question: "quais documentos explicam isso?",
      facts: documents.slice(0, 12).map(slim),
    },
    {
      question: "quais módulos foram afetados?",
      facts: modules.slice(0, 12).map(slim),
    },
    {
      question: "quais PRs/commits/repos estão ligados?",
      facts: relatedCode.slice(0, 16).map(slim),
    },
  ];

  return {
    subject,
    query,
    facts,
    edges: neighborhood.edges,
    answers,
    warnings,
  };
}

function slim(e: CanonicalEntity) {
  return {
    id: e.id,
    type: e.type,
    title: e.title,
    url: e.url,
    source: e.source,
  };
}
