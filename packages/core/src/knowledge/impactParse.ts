/**
 * Parse ClickUp table-embed blobs and GitHub repo hints for Story OS Impact.
 */

export type ParsedApiRow = {
  method?: string;
  path: string;
  permission?: string;
  description?: string;
};

const GITHUB_REPO_RE =
  /github\.com[/:](?<owner>[A-Za-z0-9_.-]+)\/(?<repo>[A-Za-z0-9_.-]+?)(?:\.git)?(?:\/|$)/i;

const API_PATH_RE = /\/api\/v\d+\/[A-Za-z0-9_.:{}/-]+/g;

const HTTP_METHODS = new Set([
  "GET",
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
  "HEAD",
  "OPTIONS",
]);

/** Extract owner/repo from a GitHub URL, canonical id, or "owner/repo" string. */
export function extractGithubRepo(
  input: string | undefined | null,
): string | null {
  if (!input) return null;
  const trimmed = input.trim();
  const m = GITHUB_REPO_RE.exec(trimmed);
  if (m?.groups?.owner && m.groups.repo) {
    return `${m.groups.owner}/${m.groups.repo.replace(/\.git$/i, "")}`;
  }
  // github:PullRequest:owner/repo#12 | github:Repository:owner/repo
  const canon =
    /github:(?:PullRequest|Repository|Branch):([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+)/i.exec(
      trimmed,
    );
  if (canon?.[1]) return canon[1];
  // owner/repo#123 (GitHub PR externalId)
  const prExt = /^([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+)#\d+$/.exec(trimmed);
  if (prExt?.[1]) return prExt[1];
  if (/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(trimmed)) {
    return trimmed;
  }
  return null;
}

/** Expand ClickUp `[table-embed:r:c value| …]` into a sparse grid. */
export function parseClickUpTableEmbed(
  text: string,
): { headers: string[]; rows: string[][] } | null {
  const embed = /\[table-embed:([^\]]+)\]/i.exec(text);
  if (!embed) return null;
  const body = embed[1]!;
  const cells = new Map<string, string>();
  let maxRow = 0;
  let maxCol = 0;

  for (const part of body.split("|")) {
    const m = /^\s*(\d+):(\d+)\s+([\s\S]*)$/.exec(part);
    if (!m) continue;
    const row = Number(m[1]);
    const col = Number(m[2]);
    const value = m[3]!.trim();
    cells.set(`${row}:${col}`, value);
    if (row > maxRow) maxRow = row;
    if (col > maxCol) maxCol = col;
  }

  if (maxRow < 1 || maxCol < 1) return null;

  const headers: string[] = [];
  for (let c = 1; c <= maxCol; c++) {
    headers.push(cells.get(`1:${c}`) ?? `col${c}`);
  }

  const rows: string[][] = [];
  for (let r = 2; r <= maxRow; r++) {
    const row: string[] = [];
    let any = false;
    for (let c = 1; c <= maxCol; c++) {
      const v = cells.get(`${r}:${c}`) ?? "";
      if (v) any = true;
      row.push(v);
    }
    if (any) rows.push(row);
  }

  return { headers, rows };
}

function headerIndex(headers: string[], ...names: RegExp[]): number {
  return headers.findIndex((h) => names.some((re) => re.test(h)));
}

/** Parse API endpoints from story API section (plain lines or table-embed). */
export function parseApiEndpoints(text: string | undefined): ParsedApiRow[] {
  if (!text?.trim()) return [];
  const out: ParsedApiRow[] = [];
  const seen = new Set<string>();

  const push = (row: ParsedApiRow) => {
    const path = row.path.replace(/\s+/g, "").replace(/\/$/, "") || row.path;
    if (!path.startsWith("/")) return;
    const key = `${(row.method ?? "").toUpperCase()} ${path}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push({
      ...row,
      path,
      method: row.method?.toUpperCase(),
    });
  };

  const embed = parseClickUpTableEmbed(text);
  if (embed) {
    const iMethod = headerIndex(embed.headers, /^m[eé]todo|method$/i);
    const iPath = headerIndex(embed.headers, /^path|rota|endpoint$/i);
    const iPerm = headerIndex(embed.headers, /^permiss|permission|rbac$/i);
    const iDesc = headerIndex(embed.headers, /^desc/i);

    for (const row of embed.rows) {
      const method =
        iMethod >= 0 ? row[iMethod]?.trim() : undefined;
      const path =
        (iPath >= 0 ? row[iPath]?.trim() : undefined) ||
        row.find((c) => c.trim().startsWith("/api/"))?.trim();
      if (!path) continue;
      push({
        method: method && HTTP_METHODS.has(method.toUpperCase()) ? method : undefined,
        path,
        permission: iPerm >= 0 ? row[iPerm]?.trim() || undefined : undefined,
        description: iDesc >= 0 ? row[iDesc]?.trim() || undefined : undefined,
      });
    }
  }

  // Plain lines: "GET /api/v1/playbooks — lista"
  for (const line of text.split(/\n/)) {
    const cleaned = line.replace(/^[-*•]\s*/, "").trim();
    if (!cleaned || /table-embed/i.test(cleaned)) continue;
    const m = /^(GET|POST|PUT|PATCH|DELETE)\s+(\/api\/[^\s|]+)/i.exec(cleaned);
    if (m) {
      push({ method: m[1], path: m[2]! });
      continue;
    }
  }

  // Fallback: any /api/vN/... tokens in the blob
  for (const path of text.match(API_PATH_RE) ?? []) {
    push({ path: path.replace(/\s+/g, "") });
  }

  return out;
}

/** Table names from data-model section; drop embed blobs. */
export function parseDataModelNames(text: string | undefined): string[] {
  if (!text?.trim()) return [];
  const names: string[] = [];
  const withoutEmbed = text.replace(/\[table-embed:[^\]]+\]/gi, "\n");
  for (const line of withoutEmbed.split(/\n/)) {
    const t = line.replace(/^[-*•]\s*/, "").trim();
    if (!t || t.length > 80) continue;
    if (/^modelo:/i.test(t)) {
      names.push(t.replace(/^modelo:\s*/i, "").trim());
      continue;
    }
    // single identifier / snake_case table
    if (/^[a-z][a-z0-9_]{2,}$/i.test(t)) names.push(t);
  }
  return [...new Set(names)];
}

export function serviceKindFromRepo(repo: string): "api" | "web" | "worker" | "unknown" {
  const name = repo.split("/")[1] ?? repo;
  if (/api|backend|server|saas-api|service/i.test(name)) return "api";
  if (/web|front|admin|app(?!-saas-api)|ui|portal/i.test(name)) return "web";
  if (/worker|job|queue|consumer/i.test(name)) return "worker";
  return "unknown";
}

export function shortServiceName(repo: string): string {
  return repo.split("/")[1] ?? repo;
}

/** Collect owner/repo from a KL entity (url, payload, canonical id). */
export function repoFromEntity(ent: {
  id: string;
  type?: string;
  title?: string;
  url?: string;
  externalId?: string;
  payload?: Record<string, unknown>;
}): string | null {
  const fromUrl = extractGithubRepo(ent.url);
  if (fromUrl) return fromUrl;
  const payloadRepo = ent.payload?.repository;
  if (typeof payloadRepo === "string") {
    return extractGithubRepo(payloadRepo) ?? extractGithubRepo(payloadRepo.trim());
  }
  const fromId = extractGithubRepo(ent.id);
  if (fromId) return fromId;
  if (ent.externalId) {
    const fromExt = extractGithubRepo(ent.externalId);
    if (fromExt) return fromExt;
  }
  if (ent.type === "Repository") {
    return (
      extractGithubRepo(ent.externalId) ??
      extractGithubRepo(ent.title) ??
      (ent.externalId?.includes("/") ? ent.externalId : null)
    );
  }
  return null;
}
