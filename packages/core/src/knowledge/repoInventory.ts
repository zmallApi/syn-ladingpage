import type { CanonicalEdge, CanonicalEntity } from "./types.js";
import { extractGithubRepo } from "./impactParse.js";

const STOP = new Set([
  "the", "and", "for", "add", "fix", "feat", "chore", "with", "from", "this",
  "that", "into", "update", "criar", "criacao", "ajuste", "para", "com", "uma",
  "dos", "das", "pelo", "pela", "repo", "github", "service", "api", "app",
  "implementar", "desenvolver", "historia", "story", "task",
]);

export type InventoryRepoCandidate = {
  repository: string;
  url?: string;
  via: string;
  confidence: "inferred";
  score: number;
};

function tokens(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .normalize("NFD")
      .replace(/\p{M}/gu, "")
      .split(/[^a-z0-9]+/)
      .filter((t) => t.length >= 3 && !STOP.has(t)),
  );
}

function overlap(
  story: Set<string>,
  hay: Set<string>,
): { score: number; hits: number } {
  if (!story.size || !hay.size) return { score: 0, hits: 0 };
  let hits = 0;
  for (const t of story) if (hay.has(t)) hits += 1;
  return { score: hits / Math.max(story.size, 1), hits };
}

function repoFullName(ent: CanonicalEntity): string | null {
  return (
    extractGithubRepo(ent.externalId) ??
    extractGithubRepo(ent.title) ??
    extractGithubRepo(ent.id) ??
    (ent.externalId.includes("/") ? ent.externalId : null)
  );
}

/** Map Module entity id → repository full_name via part_of edges. */
export function moduleReposFromEdges(
  modules: CanonicalEntity[],
  repositories: CanonicalEntity[],
  edges: CanonicalEdge[],
): Map<string, string[]> {
  const repoById = new Map(
    repositories.map((r) => [r.id, repoFullName(r)] as const),
  );
  const out = new Map<string, string[]>();
  for (const e of edges) {
    if (e.rel !== "part_of") continue;
    const repoName =
      repoById.get(e.toId) ??
      (e.toId.includes("Repository:")
        ? e.toId.replace(/^.*Repository:/, "")
        : null);
    if (!repoName) continue;
    if (!modules.some((m) => m.id === e.fromId)) continue;
    const list = out.get(e.fromId) ?? [];
    if (!list.includes(repoName)) list.push(repoName);
    out.set(e.fromId, list);
  }
  // Fallback: namespaced module id github:Module:owner/repo:Name
  for (const m of modules) {
    const mNs = /^github:Module:([^/]+\/[^:]+):/.exec(m.id);
    if (mNs?.[1]) {
      const list = out.get(m.id) ?? [];
      if (!list.includes(mNs[1])) list.push(mNs[1]);
      out.set(m.id, list);
    }
    const payloadRepo = m.payload?.repository;
    if (typeof payloadRepo === "string" && payloadRepo.includes("/")) {
      const list = out.get(m.id) ?? [];
      if (!list.includes(payloadRepo)) list.push(payloadRepo);
      out.set(m.id, list);
    }
  }
  return out;
}

const MIN_SCORE = 0.08;
const MIN_HITS = 2;

/**
 * Rank synced repositories against a greenfield story.
 * Does not invent Task↔PR — only inventory candidates (confidence inferred).
 */
export function rankReposFromInventory(opts: {
  storyText: string;
  repositories: CanonicalEntity[];
  modules?: CanonicalEntity[];
  edges?: CanonicalEdge[];
  /** subjectId → semantic summary text */
  enrichSummaries?: Map<string, string>;
  limit?: number;
}): InventoryRepoCandidate[] {
  const limit = opts.limit ?? 3;
  const storyTok = tokens(opts.storyText);
  const storyLower = opts.storyText.toLowerCase();
  const modules = opts.modules ?? [];
  const moduleRepos = moduleReposFromEdges(
    modules,
    opts.repositories,
    opts.edges ?? [],
  );

  const modulesByRepo = new Map<string, string[]>();
  for (const [modId, repos] of moduleRepos) {
    const mod = modules.find((m) => m.id === modId);
    const label = mod?.title ?? modId;
    for (const r of repos) {
      const list = modulesByRepo.get(r) ?? [];
      if (!list.includes(label)) list.push(label);
      modulesByRepo.set(r, list);
    }
  }

  const scored: InventoryRepoCandidate[] = [];

  for (const ent of opts.repositories) {
    const repository = repoFullName(ent);
    if (!repository) continue;
    const short = repository.split("/")[1] ?? repository;
    const desc =
      typeof ent.payload?.description === "string"
        ? ent.payload.description
        : "";
    const language =
      typeof ent.payload?.language === "string" ? ent.payload.language : "";
    const topics = Array.isArray(ent.payload?.topics)
      ? (ent.payload.topics as unknown[]).filter((t) => typeof t === "string").join(" ")
      : "";
    const enrich = opts.enrichSummaries?.get(ent.id) ?? "";
    const modNames = (modulesByRepo.get(repository) ?? []).join(" ");
    const hayText = [
      repository,
      short,
      ent.text,
      desc,
      language,
      topics,
      enrich,
      modNames,
    ].join("\n");
    const { score: baseScore, hits } = overlap(storyTok, tokens(hayText));

    let bonus = 0;
    if (storyLower.includes(repository.toLowerCase())) bonus += 0.5;
    else if (
      short.length >= 4 &&
      new RegExp(
        `(^|[^a-z0-9])${short.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^a-z0-9]|$)`,
        "i",
      ).test(opts.storyText)
    ) {
      bonus += 0.25;
    }

    const score = Math.min(1, baseScore + bonus);
    if (bonus < 0.25 && score < MIN_SCORE && hits < MIN_HITS) continue;

    scored.push({
      repository,
      url: ent.url ?? `https://github.com/${repository}`,
      via: `repo-inventory:${short}${hits ? ` hits=${hits}` : ""}`,
      confidence: "inferred",
      score,
    });
  }

  // Single synced repo: always propose (same spirit as Impact fallback)
  if (scored.length === 0 && opts.repositories.length === 1) {
    const ent = opts.repositories[0]!;
    const repository = repoFullName(ent);
    if (repository) {
      scored.push({
        repository,
        url: ent.url ?? `https://github.com/${repository}`,
        via: "repo-inventory:único repositório na KL",
        confidence: "inferred",
        score: 0.2,
      });
    }
  }

  scored.sort((a, b) => b.score - a.score || a.repository.localeCompare(b.repository));
  return scored.slice(0, limit);
}
