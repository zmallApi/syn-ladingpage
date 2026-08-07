import type { CanonicalEntity } from "./types.js";
import { significantTokens } from "./similarity.js";

/** Minimal KL port for task resolution (avoids circular import with context). */
export interface TaskResolvePort {
  get(id: string): CanonicalEntity | null;
  findByExternalId(
    source: string,
    type: string,
    externalId: string,
  ): CanonicalEntity | null;
  searchFacts(query: string, limit?: number): CanonicalEntity[];
}

function normalizeText(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Story keys like [P1c], ClickUp custom ids, CU-123 */
export function extractStoryKeys(text: string): string[] {
  const keys = new Set<string>();
  for (const m of text.matchAll(/\[(p\d+[a-z]?)\]/gi)) {
    keys.add(m[1]!.toLowerCase());
  }
  for (const m of text.matchAll(/\b(p\d+[a-z]?)\b/gi)) {
    if (m[1] && m[1].length <= 4) keys.add(m[1].toLowerCase());
  }
  for (const m of text.matchAll(/\b(86[a-z0-9]{5,})\b/gi)) {
    keys.add(m[1]!.toLowerCase());
  }
  for (const m of text.matchAll(/\b(cu-\d+)\b/gi)) {
    keys.add(m[1]!.toLowerCase());
  }
  return [...keys];
}

const GENERIC_TOKENS = new Set([
  "playbook",
  "playbooks",
  "acao",
  "acoes",
  "retencao",
  "reten",
  "regra",
  "regras",
  "qual",
  "aplicar",
  "cadastro",
]);

/**
 * Score how well an entity matches a user taskRef (title or id).
 * Higher is better. Negative = reject for Task resolution.
 */
export function scoreTaskMatch(query: string, entity: CanonicalEntity): number {
  if (
    entity.type !== "Task" &&
    entity.type !== "Story" &&
    entity.type !== "Epic"
  ) {
    return -1;
  }

  const q = normalizeText(query);
  const title = normalizeText(entity.title);
  const ext = normalizeText(entity.externalId);
  const idNorm = normalizeText(entity.id);

  if (!q) return -1;
  if (idNorm === q || ext === q || title === q) return 10_000;
  if (entity.id === query || entity.externalId === query) return 10_000;

  let score = 0;

  const qKeys = extractStoryKeys(query);
  const hayKeys = extractStoryKeys(
    `${entity.title}\n${entity.externalId}\n${entity.text.slice(0, 400)}`,
  );

  if (qKeys.length) {
    const hit = qKeys.some(
      (k) =>
        hayKeys.includes(k) ||
        title.includes(k) ||
        ext.includes(k) ||
        idNorm.includes(k),
    );
    if (!hit) {
      // "[P1c] …" must not resolve to "[P1] Cadastro de playbooks…"
      return -100;
    }
    score += 900;
  }

  if (title.includes(q)) score += 500;
  else if (q.length >= 12 && title.includes(q.slice(0, Math.min(q.length, 40)))) {
    score += 200;
  }

  const qTokens = significantTokens(query);
  const tTokens = new Set(significantTokens(entity.title));
  let overlap = 0;
  for (const t of qTokens) {
    if (tTokens.has(t) || title.includes(t)) overlap += 1;
  }
  score += overlap * 45;

  // Prefer distinctive tokens (not just "playbook")
  const distinctive = qTokens.filter((t) => !GENERIC_TOKENS.has(t));
  for (const t of distinctive) {
    if (tTokens.has(t) || title.includes(t)) score += 60;
    else score -= 25;
  }

  // Slight type preference
  if (entity.type === "Task") score += 5;

  return score;
}

export type ResolvedTask = {
  id: string;
  title: string;
  externalId: string;
  url?: string;
  matchScore: number;
};

/**
 * Resolve taskRef to a Task/Story/Epic with ranked title/key matching.
 */
export function resolveTaskRef(
  kl: TaskResolvePort,
  taskRef: string,
): { task: CanonicalEntity; resolved: ResolvedTask } | { error: string } {
  const ref = taskRef.trim();
  if (!ref) return { error: "taskRef vazio" };

  let task =
    kl.get(ref) ??
    kl.findByExternalId("clickup", "Task", ref) ??
    kl.findByExternalId("clickup", "Story", ref) ??
    kl.findByExternalId("clickup", "Epic", ref);

  if (task && (task.type === "Task" || task.type === "Story" || task.type === "Epic")) {
    return {
      task,
      resolved: {
        id: task.id,
        title: task.title,
        externalId: task.externalId,
        url: task.url,
        matchScore: 10_000,
      },
    };
  }

  const hits = kl.searchFacts(ref, 40);
  const ranked = hits
    .map((h) => ({ h, score: scoreTaskMatch(ref, h) }))
    .filter((x) => x.score >= 0)
    .sort((a, b) => b.score - a.score);

  const best = ranked[0];
  if (!best || best.score < 80) {
    const hint =
      ranked[0] && ranked[0].score < 80
        ? ` Melhor candidato fraco: “${ranked[0].h.title}” (score ${ranked[0].score}). Use o id ClickUp.`
        : "";
    return {
      error: `Task/Story não encontrada com precisão: “${ref}”.${hint} Rode o sync ClickUp ou cole o id externo.`,
    };
  }

  // Ambiguous: second close to first and keys disagree
  const second = ranked[1];
  if (
    second &&
    best.score - second.score < 40 &&
    extractStoryKeys(ref).length === 0
  ) {
    // still take best but OK
  }

  task = best.h;
  return {
    task,
    resolved: {
      id: task.id,
      title: task.title,
      externalId: task.externalId,
      url: task.url,
      matchScore: best.score,
    },
  };
}
