import type { CanonicalEdge, CanonicalEntity } from "./types.js";
import { edgeKey } from "./types.js";

const STOP = new Set([
  "the", "and", "for", "add", "fix", "feat", "chore", "with", "from", "this",
  "that", "into", "update", "criar", "criação", "criacao", "ajuste", "para",
  "com", "uma", "dos", "das", "pelo", "pela", "refactor", "merge", "pull",
  "request", "branch", "main", "master", "wip", "teste", "testes", "test",
]);

/** Structured refs only — never random words. */
export function extractTaskKeys(text: string): string[] {
  const keys = new Set<string>();
  const patterns = [
    /\bCU[-_ ]?\d+\b/gi,
    /\bTASK[-_ ]?\d+\b/gi,
    /\bPF[-_ ]?\d+\b/gi,
    /\bUS[-_ ]?\d+\b/gi,
  ];
  for (const re of patterns) {
    for (const m of text.matchAll(re)) {
      keys.add(m[0].toLowerCase().replace(/[\s_]+/g, "-"));
    }
  }
  for (const m of text.matchAll(/#(\d{3,})\b/g)) {
    keys.add(`#${m[1]}`);
  }
  return [...keys];
}

function escapeRe(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** ClickUp custom ids (e.g. 86e200kcz) must appear as a whole token. */
export function hayContainsExternalId(hay: string, externalId: string): boolean {
  const id = externalId.trim().toLowerCase();
  if (id.length < 6 || id.length > 14) return false;
  if (!/^[a-z0-9]+$/i.test(id)) return false;
  const re = new RegExp(`(^|[^a-z0-9])${escapeRe(id)}([^a-z0-9]|$)`, "i");
  return re.test(hay);
}

function titleTokens(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .normalize("NFD")
      .replace(/\p{M}/gu, "")
      .split(/[^a-z0-9]+/)
      .filter((t) => t.length >= 4 && !STOP.has(t)),
  );
}

function overlapScore(a: string, b: string): { score: number; hits: number } {
  const ta = titleTokens(a);
  const tb = titleTokens(b);
  if (!ta.size || !tb.size) return { score: 0, hits: 0 };
  let hit = 0;
  for (const t of ta) if (tb.has(t)) hit += 1;
  return { score: hit / Math.max(ta.size, tb.size), hits: hit };
}

export interface LinkTasksOptions {
  /** Keys `${from}|${rel}|${to}` rejected by human — never re-infer. */
  rejectKeys?: Set<string>;
}

/**
 * Deterministic Task ↔ PR / Commit linking.
 * High precision: explicit IDs in branch/title/commit, or strong title overlap.
 */
export function linkTasksToCode(
  entities: CanonicalEntity[],
  opts?: LinkTasksOptions,
): CanonicalEdge[] {
  const rejectKeys = opts?.rejectKeys ?? new Set<string>();
  const tasks = entities.filter(
    (e) => e.type === "Task" || e.type === "Story" || e.type === "Epic",
  );
  const prs = entities.filter((e) => e.type === "PullRequest");
  const commits = entities.filter((e) => e.type === "Commit");
  const edges: CanonicalEdge[] = [];

  for (const task of tasks) {
    const structuredKeys = new Set([
      ...extractTaskKeys(task.title),
      ...extractTaskKeys(task.text),
    ]);

    for (const pr of prs) {
      const key = edgeKey(task.id, "implements", pr.id);
      if (rejectKeys.has(key)) continue;

      const hay = `${pr.title}\n${pr.text}\n${String(pr.payload.branch ?? "")}`;
      const hayKeys = extractTaskKeys(hay);
      const byExternalId = hayContainsExternalId(hay, task.externalId);
      const byStructured = hayKeys.some((k) => structuredKeys.has(k));
      const { score: textScore, hits } = overlapScore(task.title, pr.title);
      const byText = textScore >= 0.5 && hits >= 2;

      if (byExternalId || byStructured || byText) {
        edges.push({
          fromId: task.id,
          toId: pr.id,
          rel: "implements",
          score: byExternalId || byStructured ? 0.95 : textScore,
          status: "inferred",
          evidence: {
            via: byExternalId
              ? "external_id"
              : byStructured
                ? "structured_key"
                : "title_overlap",
            keys: hayKeys,
            hits,
          },
        });
      }
    }

    for (const commit of commits) {
      const key = edgeKey(task.id, "related_to", commit.id);
      if (rejectKeys.has(key)) continue;

      const hay = commit.text;
      const hayKeys = extractTaskKeys(hay);
      const byExternalId = hayContainsExternalId(hay, task.externalId);
      const byStructured = hayKeys.some((k) => structuredKeys.has(k));
      if (byExternalId || byStructured) {
        edges.push({
          fromId: task.id,
          toId: commit.id,
          rel: "related_to",
          score: 0.9,
          status: "inferred",
          evidence: {
            via: byExternalId ? "external_id" : "structured_key",
            keys: hayKeys,
          },
        });
      }
    }
  }

  return edges;
}
