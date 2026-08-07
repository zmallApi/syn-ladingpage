/** Canonical section keys used by Discovery mapping. */
export type StorySectionKey =
  | "userStory"
  | "asIs"
  | "toBe"
  | "dataModel"
  | "api"
  | "seed"
  | "rules"
  | "acceptance"
  | "outOfScope"
  | "tests";

export interface ParsedStoryBody {
  sections: Partial<Record<StorySectionKey, string>>;
  bullets: Partial<Record<StorySectionKey, string[]>>;
  /** File paths and identifiers cited in AS-IS / TO-BE. */
  codeSymbols: string[];
  hasStructuredBody: boolean;
}

const HEADING_MAP: Array<{ key: StorySectionKey; pattern: RegExp }> = [
  {
    key: "userStory",
    pattern: /^(user\s*story|hist[oó]ria\s*de\s*usu[aá]rio)\b/i,
  },
  { key: "asIs", pattern: /^(as[-\s]?is|estado\s*atual)\b/i },
  { key: "toBe", pattern: /^(to[-\s]?be|estado\s*desejado|proposta)\b/i },
  {
    key: "dataModel",
    pattern: /^(modelo\s*de\s*dados|data\s*model|schema)\b/i,
  },
  { key: "api", pattern: /^(api|endpoints?|rest)\b/i },
  { key: "seed", pattern: /^(seed|semente|dados\s*iniciais)\b/i },
  { key: "rules", pattern: /^(regras|rules|regras\s*de\s*neg[oó]cio)\b/i },
  {
    key: "acceptance",
    pattern:
      /^(crit[eé]rios?\s*de\s*aceite|acceptance(\s*criteria)?|aceite)\b/i,
  },
  {
    key: "outOfScope",
    pattern: /^(fora\s*de\s*escopo|out\s*of\s*scope|n[aã]o\s*escopo)\b/i,
  },
  { key: "tests", pattern: /^(testes?|tests?|qa)\b/i },
];

function normalizeHeadingLine(line: string): string {
  return line
    .replace(/^#+\s*/, "")
    .replace(/^\*\*(.+)\*\*$/, "$1")
    .replace(/^[-*_=\s]+|[-*_=\s]+$/g, "")
    .trim();
}

function matchHeading(line: string): StorySectionKey | null {
  const normalized = normalizeHeadingLine(line);
  if (!normalized || normalized.length > 80) return null;
  for (const { key, pattern } of HEADING_MAP) {
    if (pattern.test(normalized)) return key;
  }
  return null;
}

function extractBullets(body: string): string[] {
  const lines = body.split(/\r?\n/);
  const bullets: string[] = [];
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    const m = line.match(/^[-*•]\s+(.+)$/) || line.match(/^\d+[.)]\s+(.+)$/);
    if (m?.[1]) {
      bullets.push(m[1].trim());
      continue;
    }
    // Short non-heading prose lines also count as bullets when section is sparse
    if (line.length >= 12 && line.length <= 220 && !matchHeading(line)) {
      bullets.push(line);
    }
  }
  // Prefer real bullets; if we scooped too much prose, keep first 12
  return [...new Set(bullets)].slice(0, 12);
}

/**
 * Extract code-like symbols: paths (foo/bar.js) and camel/snake identifiers.
 */
export function extractCodeSymbols(text: string): string[] {
  const found = new Set<string>();

  for (const m of text.matchAll(
    /\b[\w.-]+\.(?:js|ts|tsx|jsx|mjs|cjs|py|go|java|sql)\b/gi,
  )) {
    found.add(m[0]);
  }
  for (const m of text.matchAll(
    /\b(?:src|apps|packages|lib)\/[\w./-]+\.\w+\b/gi,
  )) {
    found.add(m[0]);
  }
  for (const m of text.matchAll(/\b[a-z][a-zA-Z0-9]*(?:[A-Z][a-zA-Z0-9]+)+\b/g)) {
    // camelCase / Pascal-ish starting lower — actionTemplatesFor
    if (m[0].length >= 8) found.add(m[0]);
  }
  for (const m of text.matchAll(/\b[a-z][a-z0-9]*(?:_[a-z0-9]+)+\b/g)) {
    // snake_case tables — playbook_actions
    if (m[0].length >= 6) found.add(m[0]);
  }

  const skip = new Set([
    "user_story",
    "out_of",
    "data_model",
    "sort_order",
  ]);
  return [...found].filter((s) => !skip.has(s.toLowerCase())).slice(0, 16);
}

/**
 * Parse a ClickUp/task description into structured sections for Discovery.
 */
export function parseStoryBody(text: string): ParsedStoryBody {
  const lines = text.split(/\r?\n/);
  const sections: Partial<Record<StorySectionKey, string>> = {};
  const order: StorySectionKey[] = [];

  let current: StorySectionKey | null = null;
  const buffers: Partial<Record<StorySectionKey, string[]>> = {};

  // Also treat a leading "Como … Quero … Para …" block as userStory
  const comoBlock: string[] = [];
  let sawHeading = false;

  for (const line of lines) {
    const heading = matchHeading(line);
    if (heading) {
      sawHeading = true;
      current = heading;
      if (!buffers[heading]) {
        buffers[heading] = [];
        order.push(heading);
      }
      continue;
    }
    if (!sawHeading) {
      const t = line.trim();
      if (/^como\b/i.test(t) || /^quero\b/i.test(t) || /^para\b/i.test(t)) {
        comoBlock.push(t);
      }
    }
    if (current) {
      buffers[current]!.push(line);
    }
  }

  if (comoBlock.length && !buffers.userStory) {
    buffers.userStory = comoBlock;
    order.unshift("userStory");
  }

  const bullets: Partial<Record<StorySectionKey, string[]>> = {};
  for (const key of order) {
    const body = (buffers[key] ?? []).join("\n").trim();
    if (!body) continue;
    sections[key] = body;
    bullets[key] = extractBullets(body);
  }

  const asIsToBe = [sections.asIs, sections.toBe].filter(Boolean).join("\n");
  const codeSymbols = extractCodeSymbols(asIsToBe || text);

  return {
    sections,
    bullets,
    codeSymbols,
    hasStructuredBody: order.length >= 2 || Boolean(sections.acceptance),
  };
}

/** Truncate section map for LLM payload. */
export function summarizeSectionsForLlm(
  parsed: ParsedStoryBody,
  maxChars = 400,
): Partial<Record<StorySectionKey, string>> {
  const out: Partial<Record<StorySectionKey, string>> = {};
  for (const [key, value] of Object.entries(parsed.sections) as Array<
    [StorySectionKey, string]
  >) {
    out[key] =
      value.length > maxChars ? `${value.slice(0, maxChars).trim()}…` : value;
  }
  return out;
}
