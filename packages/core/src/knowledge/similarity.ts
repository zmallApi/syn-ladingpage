const STOP = new Set([
  "the", "and", "for", "add", "fix", "feat", "chore", "with", "from", "this",
  "that", "into", "update", "criar", "criacao", "ajuste", "para", "com", "uma",
  "dos", "das", "pelo", "pela", "refactor", "merge", "pull", "request", "branch",
  "main", "master", "wip", "teste", "testes", "test", "cadastro",
]);

/** Domain stems that justify soft similar-PR matching in greenfield. */
export const DOMAIN_STEMS = [
  "playbook",
  "reten",
  "churn",
  "cancel",
  "oauth",
  "auth",
  "billing",
  "invoice",
  "stripe",
  "whatsapp",
  "guardian",
  "migrat",
];

export function significantTokens(text: string): string[] {
  return [
    ...new Set(
      text
        .toLowerCase()
        .normalize("NFD")
        .replace(/\p{M}/gu, "")
        .split(/[^a-z0-9]+/)
        .filter((t) => t.length >= 4 && !STOP.has(t)),
    ),
  ];
}

function titleTokens(text: string): Set<string> {
  return new Set(significantTokens(text));
}

export function overlapScoreForDiscovery(
  a: string,
  b: string,
): { score: number; hits: number } {
  const ta = titleTokens(a);
  const tb = titleTokens(b);
  if (!ta.size || !tb.size) return { score: 0, hits: 0 };
  let hit = 0;
  for (const t of ta) if (tb.has(t)) hit += 1;
  return { score: hit / Math.max(ta.size, tb.size), hits: hit };
}

/** True if either side shares a domain stem (playbook/reten/…). */
export function sharesDomainToken(a: string, b: string): boolean {
  const aN = a
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "");
  const bN = b
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "");
  return DOMAIN_STEMS.some((stem) => aN.includes(stem) && bN.includes(stem));
}

export function isSoftSimilarPr(
  taskTitle: string,
  prTitle: string,
  greenfield: boolean,
): { ok: boolean; score: number; hits: number } {
  const { score, hits } = overlapScoreForDiscovery(taskTitle, prTitle);
  if (!greenfield) {
    return { ok: score >= 0.45 && hits >= 2, score, hits };
  }
  if (sharesDomainToken(taskTitle, prTitle)) {
    return { ok: true, score: Math.max(score, 0.3), hits: Math.max(hits, 1) };
  }
  return { ok: hits >= 1 && score >= 0.25, score, hits };
}
