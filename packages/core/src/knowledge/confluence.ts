import type {
  CanonicalEntity,
  CanonicalFact,
  ScopeMeta,
  SourceProjection,
} from "./types.js";
import { entityId } from "./types.js";

/**
 * Confluence Cloud projection → Document facts in the Knowledge Layer.
 * Env/token: Confluence API token + email; baseUrl like https://acme.atlassian.net/wiki
 */
export interface ConfluenceProjectionOptions {
  /** Atlassian API token (or PAT). */
  token: string;
  /** Account email for Basic auth (Cloud). */
  email: string;
  /** Base wiki URL, e.g. https://acme.atlassian.net/wiki */
  baseUrl: string;
  /** Space keys to sync; empty = skip (must provide scopes). */
  spaceKeys?: string[];
  pageLimitPerSpace?: number;
}

type CfSpace = { id: string; key: string; name: string };
type CfPage = {
  id: string;
  title: string;
  type?: string;
  status?: string;
  _links?: { webui?: string; tinyui?: string };
  body?: { storage?: { value?: string } };
  version?: { when?: string };
  space?: { key?: string };
};

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

async function cf<T>(
  baseUrl: string,
  email: string,
  token: string,
  path: string,
): Promise<T> {
  const root = baseUrl.replace(/\/$/, "");
  const url = `${root}/rest/api${path}`;
  const auth = Buffer.from(`${email}:${token}`).toString("base64");
  const res = await fetch(url, {
    headers: {
      Authorization: `Basic ${auth}`,
      Accept: "application/json",
    },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Confluence ${res.status}: ${body.slice(0, 200)}`);
  }
  return (await res.json()) as T;
}

export function createConfluenceProjection(
  opts: ConfluenceProjectionOptions,
): SourceProjection {
  const token = opts.token.trim();
  const email = opts.email.trim();
  const baseUrl = opts.baseUrl.trim();
  const pageLimit = opts.pageLimitPerSpace ?? 50;
  const spaceKeys = (opts.spaceKeys ?? []).map((s) => s.trim()).filter(Boolean);

  return {
    kind: "confluence",

    async testConnection() {
      await cf<{ results?: CfSpace[] }>(
        baseUrl,
        email,
        token,
        "/space?limit=1",
      );
    },

    async listScopes(): Promise<ScopeMeta[]> {
      const data = await cf<{ results: CfSpace[] }>(
        baseUrl,
        email,
        token,
        "/space?limit=100&type=global",
      );
      return (data.results ?? []).map((s) => ({
        id: s.key,
        label: `${s.name} (${s.key})`,
        kind: "space",
        meta: { spaceId: s.id },
      }));
    },

    async *project(cursor?: string | null): AsyncGenerator<CanonicalFact> {
      if (!spaceKeys.length) return;

      for (const spaceKey of spaceKeys) {
        const cql = encodeURIComponent(
          `space="${spaceKey}" AND type=page ORDER BY lastmodified DESC`,
        );
        const expand = encodeURIComponent("body.storage,version,space");
        let start = 0;
        let fetched = 0;
        while (fetched < pageLimit) {
          const limit = Math.min(25, pageLimit - fetched);
          const data = await cf<{
            results: CfPage[];
            size?: number;
          }>(
            baseUrl,
            email,
            token,
            `/content/search?cql=${cql}&limit=${limit}&start=${start}&expand=${expand}`,
          );
          const pages = data.results ?? [];
          if (!pages.length) break;

          for (const page of pages) {
            const updatedAt = page.version?.when ?? undefined;
            if (cursor && updatedAt && updatedAt <= cursor) {
              continue;
            }
            const html = page.body?.storage?.value ?? "";
            const text = stripHtml(html).slice(0, 12_000);
            const webui = page._links?.webui ?? "";
            const url = webui
              ? `${baseUrl.replace(/\/$/, "")}${webui.startsWith("/") ? "" : "/"}${webui}`
              : undefined;

            const entity: CanonicalEntity = {
              id: entityId("confluence", "Document", page.id),
              type: "Document",
              source: "confluence",
              externalId: page.id,
              title: page.title,
              url,
              updatedAt,
              text,
              payload: {
                spaceKey: page.space?.key ?? spaceKey,
                status: page.status,
              },
            };
            yield { kind: "entity", entity };
            fetched += 1;
            if (fetched >= pageLimit) break;
          }

          start += pages.length;
          if (pages.length < limit) break;
        }
      }
    },
  };
}
