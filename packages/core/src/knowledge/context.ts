import type { CanonicalEntity, CanonicalEdge } from "./types.js";
import { discoverStory } from "./discovery.js";
import {
  refineDiscoveryWithLlm,
  type DiscoveryLlmMeta,
} from "./llm.js";
import type { DiscoveryResult } from "./discovery.js";
import { refineStory, type RefineResult } from "./refine.js";
import { impactStory, type ImpactResult } from "./impact.js";
import { planStory, type PlanResult } from "./plan.js";
import { executeContext, type ExecuteResult } from "./execute.js";
import { significantTokens } from "./similarity.js";
import { parseStoryBody } from "./storyBody.js";
import { resolveTaskRef } from "./resolveTask.js";
import { applyEnrichmentsToDiscovery } from "./applyEnrichments.js";
import type { EnrichmentPort } from "./enrichment.js";
import type { LlmProvider } from "../llm/index.js";

export interface KnowledgeLayerPort {
  get(id: string): CanonicalEntity | null;
  findByExternalId(
    source: string,
    type: string,
    externalId: string,
  ): CanonicalEntity | null;
  searchFacts(query: string, limit?: number): CanonicalEntity[];
  listByType(type: string, limit?: number): CanonicalEntity[];
  traverse(
    id: string,
    opts?: { depth?: number },
  ): { entities: CanonicalEntity[]; edges: CanonicalEdge[] };
  /** Optional — when present, Mission/Context Engine reuses durable enrichments */
  enrichments?: EnrichmentPort;
}

export type DiscoveryContextResult =
  | (DiscoveryResult & DiscoveryLlmMeta)
  | { error: string };

/**
 * Context Engine — neighborhood + title/token search + AS-IS code symbols.
 */
export async function buildDiscoveryContext(
  kl: KnowledgeLayerPort,
  taskRef: string,
  opts?: { llmProvider?: LlmProvider },
): Promise<DiscoveryContextResult> {
  const resolved = resolveTaskRef(kl, taskRef);
  if ("error" in resolved) return resolved;
  const { task } = resolved;

  const neighborhood = kl.traverse(task.id, { depth: 2 });
  const titleHits = kl.searchFacts(task.title, 30).filter(
    (e) =>
      e.type === "PullRequest" ||
      e.type === "Commit" ||
      e.type === "Document" ||
      e.type === "Module",
  );

  const tokenHits: CanonicalEntity[] = [];
  for (const token of significantTokens(task.title).slice(0, 6)) {
    for (const hit of kl.searchFacts(token, 12)) {
      if (
        hit.type === "PullRequest" ||
        hit.type === "Module" ||
        hit.type === "Document" ||
        hit.type === "Commit"
      ) {
        tokenHits.push(hit);
      }
    }
  }

  const story = parseStoryBody(task.text);
  const symbolHits: CanonicalEntity[] = [];
  for (const symbol of story.codeSymbols.slice(0, 8)) {
    for (const hit of kl.searchFacts(symbol, 10)) {
      if (
        hit.type === "PullRequest" ||
        hit.type === "Commit" ||
        hit.type === "Module"
      ) {
        symbolHits.push(hit);
      }
    }
  }

  // Domain soft search — PRs/commits only (never dump all Repository nodes)
  const domainHits: CanonicalEntity[] = [];
  const hay = `${task.title}\n${task.text}`.toLowerCase();
  for (const stem of ["playbook", "reten", "alunos"]) {
    if (!hay.includes(stem)) continue;
    for (const hit of kl.searchFacts(stem, 12)) {
      if (hit.type === "PullRequest" || hit.type === "Commit") {
        domainHits.push(hit);
      }
    }
  }

  const projectRepos = kl.listByType("Repository", 30).map((r) => ({
    id: r.id,
    name: r.title || r.externalId,
    url: r.url,
  }));

  const unique = [
    ...new Map(
      [
        ...neighborhood.entities,
        ...titleHits,
        ...tokenHits,
        ...symbolHits,
        ...domainHits,
      ].map((e) => [e.id, e]),
    ).values(),
  ];

  const base = discoverStory({
    task,
    related: unique,
    edges: neighborhood.edges,
  });

  let enrichmentsHit = 0;
  let llmCallsSaved = false;
  let working = base;

  if (kl.enrichments) {
    const subjectIds = unique.map((e) => e.id);
    const stored = kl.enrichments.listBySubjects(subjectIds, {
      status: ["confirmed", "proposed"],
      kinds: ["semantic_summary"],
    });
    const applied = applyEnrichmentsToDiscovery(base, stored);
    working = applied.result;
    enrichmentsHit = applied.enrichmentsHit;
    if (applied.skipLlmRefine) {
      llmCallsSaved = true;
      return {
        ...working,
        llmUsed: false,
        enrichmentsHit,
        llmCallsSaved: true,
        resolvedTask: resolved.resolved,
        candidateRepositories:
          working.candidateRepositories ?? base.candidateRepositories,
        projectRepositories: projectRepos,
      };
    }
  }

  const withMeta = await refineDiscoveryWithLlm(
    working,
    opts?.llmProvider,
  );
  return {
    ...withMeta,
    enrichmentsHit,
    llmCallsSaved,
    resolvedTask: resolved.resolved,
    candidateRepositories:
      withMeta.candidateRepositories ?? base.candidateRepositories,
    projectRepositories: projectRepos,
  };
}

export type RefineContextResult =
  | (RefineResult & Pick<DiscoveryLlmMeta, "llmUsed" | "llmModel">)
  | { error: string };

/**
 * Story OS Refine — Understand (KL) then close aceite/escopo/MVP gaps.
 */
export async function buildRefineContext(
  kl: KnowledgeLayerPort,
  taskRef: string,
): Promise<RefineContextResult> {
  const understand = await buildDiscoveryContext(kl, taskRef);
  if ("error" in understand) return understand;

  const refined = refineStory(understand);
  return {
    ...refined,
    llmUsed: understand.llmUsed,
    llmModel: understand.llmModel,
  };
}

export type ImpactContextResult =
  | (ImpactResult & Pick<DiscoveryLlmMeta, "llmUsed" | "llmModel">)
  | { error: string };

/**
 * Story OS Impact — Refine then blast radius tipado.
 */
export async function buildImpactContext(
  kl: KnowledgeLayerPort,
  taskRef: string,
): Promise<ImpactContextResult> {
  const refined = await buildRefineContext(kl, taskRef);
  if ("error" in refined) return refined;

  const impact = impactStory(refined);
  return {
    ...impact,
    llmUsed: refined.llmUsed,
    llmModel: refined.llmModel,
  };
}

export type PlanContextResult =
  | (PlanResult & Pick<DiscoveryLlmMeta, "llmUsed" | "llmModel">)
  | { error: string };

/**
 * Story OS Plan — Impact then ordered work items.
 */
export async function buildPlanContext(
  kl: KnowledgeLayerPort,
  taskRef: string,
): Promise<PlanContextResult> {
  const impact = await buildImpactContext(kl, taskRef);
  if ("error" in impact) return impact;

  const plan = planStory(impact);
  return {
    ...plan,
    llmUsed: impact.llmUsed,
    llmModel: impact.llmModel,
  };
}

export type ExecuteContextResult =
  | (ExecuteResult & Pick<DiscoveryLlmMeta, "llmUsed" | "llmModel">)
  | { error: string };

/**
 * Story OS Execute — Plan then agent context pack (no codegen).
 */
export async function buildExecuteContext(
  kl: KnowledgeLayerPort,
  taskRef: string,
): Promise<ExecuteContextResult> {
  const plan = await buildPlanContext(kl, taskRef);
  if ("error" in plan) return plan;

  const pack = executeContext(plan);
  return {
    ...pack,
    llmUsed: plan.llmUsed,
    llmModel: plan.llmModel,
  };
}
