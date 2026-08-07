import type {
  CanonicalEntity,
  CanonicalEntityType,
  CanonicalFact,
  ScopeMeta,
  SourceProjection,
} from "./types.js";
import { entityId } from "./types.js";

export interface GitHubProjectionOptions {
  token: string;
  /** owner/repo list; empty = discover from token */
  repos?: string[];
  /** Max PRs per repo (default 20) */
  prLimit?: number;
  /** Max commits listed per PR (default 10) */
  commitLimit?: number;
}

type GhRepo = {
  full_name: string;
  html_url: string;
  description: string | null;
  updated_at: string;
  language?: string | null;
  topics?: string[];
  default_branch?: string;
};
type GhPr = {
  number: number;
  title: string;
  body: string | null;
  html_url: string;
  updated_at: string;
  head: { ref: string };
  base: { repo: { full_name: string } };
};
type GhCommit = {
  sha: string;
  html_url: string;
  commit: { message: string; committer?: { date?: string } };
  files?: Array<{ filename: string }>;
};

async function gh<T>(
  token: string,
  path: string,
  query?: Record<string, string | number>,
): Promise<T> {
  const url = new URL(`https://api.github.com${path}`);
  if (query) {
    for (const [k, v] of Object.entries(query)) url.searchParams.set(k, String(v));
  }
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "User-Agent": "synapsee-edge",
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`GitHub ${res.status}: ${body.slice(0, 200)}`);
  }
  return (await res.json()) as T;
}

function moduleFromPath(filename: string): string | null {
  const parts = filename.replace(/\\/g, "/").split("/").filter(Boolean);
  if (parts.length < 2) return null;
  const skip = new Set([
    "src", "lib", "app", "apps", "packages", "test", "tests", "dist", "build",
    "node_modules", "docs", "doc", "scripts", "config", "configs", "public",
    "assets", "types", "utils", "helpers", "common", "shared", "migrations",
    "migration", "prisma", "workflows", ".github", "terraform", "db",
  ]);
  for (const p of parts.slice(0, -1)) {
    if (skip.has(p.toLowerCase())) continue;
    if (p.startsWith(".")) continue;
    return p
      .split(/[-_]/)
      .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
      .join("");
  }
  return null;
}

function repoPayload(r: {
  description?: string | null;
  language?: string | null;
  topics?: string[];
  default_branch?: string;
  full_name?: string;
}) {
  return {
    description: r.description ?? null,
    language: r.language ?? null,
    topics: Array.isArray(r.topics) ? r.topics : [],
    default_branch: r.default_branch ?? null,
    full_name: r.full_name ?? null,
  };
}

function repoText(fullName: string, r: {
  description?: string | null;
  language?: string | null;
  topics?: string[];
}): string {
  const topics = Array.isArray(r.topics) ? r.topics.join(", ") : "";
  return [fullName, r.description ?? "", r.language ?? "", topics]
    .filter(Boolean)
    .join("\n");
}

export function createGitHubProjection(
  opts: GitHubProjectionOptions,
): SourceProjection {
  const token = opts.token.trim();
  const prLimit = opts.prLimit ?? 20;
  const commitLimit = opts.commitLimit ?? 10;

  return {
    kind: "github",

    async testConnection() {
      await gh<{ login: string }>(token, "/user");
    },

    async introspectScopes() {
      if (opts.repos?.length) {
        const out: ScopeMeta[] = [];
        for (const r of opts.repos) {
          const [owner, repo] = r.split("/");
          if (!owner || !repo) {
            out.push({ id: r, label: r, kind: "repository" });
            continue;
          }
          try {
            const meta = await gh<GhRepo>(token, `/repos/${owner}/${repo}`);
            out.push({
              id: meta.full_name,
              label: meta.full_name,
              kind: "repository",
              meta: {
                url: meta.html_url,
                updated_at: meta.updated_at,
                description: meta.description,
                language: meta.language,
                topics: meta.topics ?? [],
                default_branch: meta.default_branch,
              },
            });
          } catch {
            out.push({ id: r, label: r, kind: "repository" });
          }
        }
        return out;
      }
      const repos = await gh<GhRepo[]>(token, "/user/repos", {
        per_page: 10,
        sort: "updated",
      });
      return repos.map((r) => ({
        id: r.full_name,
        label: r.full_name,
        kind: "repository",
        meta: {
          url: r.html_url,
          updated_at: r.updated_at,
          description: r.description,
          language: r.language,
          topics: r.topics ?? [],
          default_branch: r.default_branch,
        },
      }));
    },

    async *project(cursor?: string | null) {
      const since = cursor ? Date.parse(cursor) : NaN;
      const sinceOk = !Number.isNaN(since);
      const scopes = await this.introspectScopes();

      for (const scope of scopes) {
        const fullName = scope.id;
        const [owner, repo] = fullName.split("/");
        if (!owner || !repo) continue;

        let language =
          typeof scope.meta?.language === "string" ? scope.meta.language : null;
        let topics = Array.isArray(scope.meta?.topics)
          ? (scope.meta.topics as string[])
          : [];
        let defaultBranch =
          typeof scope.meta?.default_branch === "string"
            ? scope.meta.default_branch
            : null;
        let metaUpdated =
          typeof scope.meta?.updated_at === "string"
            ? scope.meta.updated_at
            : undefined;
        let metaDesc =
          typeof scope.meta?.description === "string"
            ? scope.meta.description
            : null;
        let htmlUrl =
          typeof scope.meta?.url === "string" ? scope.meta.url : undefined;

        if (!metaUpdated || language == null) {
          try {
            const repoMeta = await gh<GhRepo>(token, `/repos/${owner}/${repo}`);
            metaUpdated = metaUpdated ?? repoMeta.updated_at;
            metaDesc = metaDesc ?? repoMeta.description;
            htmlUrl = htmlUrl ?? repoMeta.html_url;
            language = language ?? repoMeta.language ?? null;
            if (!topics.length && repoMeta.topics?.length) {
              topics = repoMeta.topics;
            }
            defaultBranch = defaultBranch ?? repoMeta.default_branch ?? null;
          } catch {
            if (!metaUpdated) continue;
          }
        }

        const repoEntity: CanonicalEntity = {
          id: entityId("github", "Repository", fullName),
          type: "Repository",
          source: "github",
          externalId: fullName,
          title: fullName,
          url: htmlUrl,
          updatedAt: metaUpdated,
          text: repoText(fullName, {
            description: metaDesc,
            language,
            topics,
          }),
          payload: repoPayload({
            description: metaDesc,
            language,
            topics,
            default_branch: defaultBranch ?? undefined,
            full_name: fullName,
          }),
        };
        yield { kind: "entity", entity: repoEntity } satisfies CanonicalFact;

        let prs: GhPr[] = [];
        try {
          prs = await gh<GhPr[]>(token, `/repos/${owner}/${repo}/pulls`, {
            state: "all",
            per_page: prLimit,
            sort: "updated",
            direction: "desc",
          });
        } catch {
          continue;
        }

        for (const pr of prs) {
          const prUpdated = Date.parse(pr.updated_at);
          // Incremental: PRs are sorted by updated desc — stop once older than watermark
          if (sinceOk && !Number.isNaN(prUpdated) && prUpdated <= since) {
            break;
          }

          const prExt = `${fullName}#${pr.number}`;
          const prEntity: CanonicalEntity = {
            id: entityId("github", "PullRequest", prExt),
            type: "PullRequest",
            source: "github",
            externalId: prExt,
            title: pr.title,
            url: pr.html_url,
            updatedAt: pr.updated_at,
            text: [pr.title, pr.body ?? "", pr.head?.ref ?? ""].join("\n"),
            payload: {
              number: pr.number,
              repository: fullName,
              branch: pr.head?.ref,
            },
          };
          yield { kind: "entity", entity: prEntity };
          yield {
            kind: "edge",
            edge: {
              fromId: prEntity.id,
              toId: repoEntity.id,
              rel: "part_of",
              evidence: { via: "repository_scope" },
            },
          };

          if (pr.head?.ref) {
            const branchId = `${fullName}@${pr.head.ref}`;
            yield {
              kind: "entity",
              entity: {
                id: entityId("github", "Branch", branchId),
                type: "Branch",
                source: "github",
                externalId: branchId,
                title: pr.head.ref,
                text: pr.head.ref,
                payload: { repository: fullName },
              },
            };
          }

          let commits: GhCommit[] = [];
          try {
            commits = await gh<GhCommit[]>(
              token,
              `/repos/${owner}/${repo}/pulls/${pr.number}/commits`,
              { per_page: commitLimit },
            );
          } catch {
            commits = [];
          }

          // One files call per PR (avoids N+1 commit detail fetches that timeout Edge)
          let prFiles: string[] = [];
          try {
            const files = await gh<Array<{ filename: string }>>(
              token,
              `/repos/${owner}/${repo}/pulls/${pr.number}/files`,
              { per_page: 100 },
            );
            prFiles = files.map((f) => f.filename);
          } catch {
            prFiles = [];
          }

          const modules = new Set<string>();
          for (const file of prFiles) {
            const mod = moduleFromPath(file);
            if (mod) modules.add(mod);
          }

          for (const c of commits) {
            const commitEntity: CanonicalEntity = {
              id: entityId("github", "Commit", c.sha),
              type: "Commit",
              source: "github",
              externalId: c.sha,
              title: (c.commit.message || c.sha).split("\n")[0]!,
              url: c.html_url,
              updatedAt: c.commit.committer?.date,
              text: c.commit.message || c.sha,
              payload: { sha: c.sha, files: [], repository: fullName },
            };
            yield { kind: "entity", entity: commitEntity };
            yield {
              kind: "edge",
              edge: {
                fromId: prEntity.id,
                toId: commitEntity.id,
                rel: "contains",
                evidence: { via: "pull_request_commits" },
              },
            };
            yield {
              kind: "edge",
              edge: {
                fromId: commitEntity.id,
                toId: repoEntity.id,
                rel: "part_of",
                evidence: { via: "repository_scope" },
              },
            };
          }

          for (const mod of modules) {
            // Namespaced (new) + legacy inferred id for enrich backward-compat
            const nsEntity: CanonicalEntity = {
              id: entityId("github", "Module", `${fullName}:${mod}`),
              type: "Module",
              source: "github",
              externalId: `${fullName}:${mod}`,
              title: mod,
              text: `${mod} (${fullName})`,
              payload: { repository: fullName },
            };
            const legacyEntity: CanonicalEntity = {
              id: entityId("inferred", "Module", mod),
              type: "Module",
              source: "inferred",
              externalId: mod,
              title: mod,
              text: mod,
              payload: { repository: fullName },
            };
            yield { kind: "entity", entity: nsEntity };
            yield { kind: "entity", entity: legacyEntity };
            for (const modEntity of [nsEntity, legacyEntity]) {
              yield {
                kind: "edge",
                edge: {
                  fromId: prEntity.id,
                  toId: modEntity.id,
                  rel: "touches",
                  evidence: { via: "path_heuristic", from: "pull_request_files" },
                },
              };
              yield {
                kind: "edge",
                edge: {
                  fromId: modEntity.id,
                  toId: repoEntity.id,
                  rel: "part_of",
                  evidence: { via: "repository_scope" },
                },
              };
            }
          }
        }
      }
    },

    async getByExternalId(type: CanonicalEntityType, externalId: string) {
      if (type === "Repository") {
        const [owner, repo] = externalId.split("/");
        if (!owner || !repo) return null;
        const r = await gh<GhRepo>(token, `/repos/${owner}/${repo}`);
        return {
          id: entityId("github", "Repository", externalId),
          type: "Repository",
          source: "github",
          externalId,
          title: r.full_name,
          url: r.html_url,
          updatedAt: r.updated_at,
          text: repoText(r.full_name, r),
          payload: repoPayload(r),
        };
      }
      if (type === "PullRequest") {
        const m = externalId.match(/^(.+)#(\d+)$/);
        if (!m) return null;
        const [, fullName, num] = m;
        const [owner, repo] = fullName!.split("/");
        const pr = await gh<GhPr>(
          token,
          `/repos/${owner}/${repo}/pulls/${num}`,
        );
        return {
          id: entityId("github", "PullRequest", externalId),
          type: "PullRequest",
          source: "github",
          externalId,
          title: pr.title,
          url: pr.html_url,
          updatedAt: pr.updated_at,
          text: [pr.title, pr.body ?? ""].join("\n"),
          payload: { number: pr.number, repository: fullName },
        };
      }
      return null;
    },
  };
}
