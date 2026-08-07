import type {
  CanonicalEntity,
  CanonicalEntityType,
  CanonicalFact,
  ScopeMeta,
  SourceProjection,
} from "./types.js";
import { entityId } from "./types.js";

export interface ClickUpProjectionOptions {
  token: string;
  /** Space ids; empty = all accessible spaces */
  spaceIds?: string[];
  taskLimitPerList?: number;
}

type CuTeam = { id: string; name: string };
type CuSpace = { id: string; name: string };
type CuList = { id: string; name: string };
type CuTask = {
  id: string;
  name: string;
  description?: string;
  status?: { status?: string };
  url?: string;
  date_updated?: string;
  parent?: string | null;
  custom_fields?: Array<{ name: string; value?: unknown }>;
  list?: { id: string; name: string };
};
type CuComment = {
  id: string;
  comment_text?: string;
  comment?: Array<{ text?: string }>;
};

async function fetchTaskComments(
  token: string,
  taskId: string,
  limit = 5,
): Promise<string> {
  try {
    const { comments } = await cu<{ comments: CuComment[] }>(
      token,
      `/task/${taskId}/comment`,
    );
    return (comments ?? [])
      .slice(0, limit)
      .map((c) => {
        if (c.comment_text?.trim()) return c.comment_text.trim();
        if (Array.isArray(c.comment)) {
          return c.comment
            .map((p) => p.text ?? "")
            .join("")
            .trim();
        }
        return "";
      })
      .filter(Boolean)
      .join("\n---\n");
  } catch {
    return "";
  }
}

async function cu<T>(token: string, path: string): Promise<T> {
  const res = await fetch(`https://api.clickup.com/api/v2${path}`, {
    headers: {
      Authorization: token,
      "Content-Type": "application/json",
    },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`ClickUp ${res.status}: ${body.slice(0, 200)}`);
  }
  return (await res.json()) as T;
}

function taskType(task: CuTask): "Epic" | "Story" | "Task" {
  const status = (task.status?.status ?? "").toLowerCase();
  const name = task.name.toLowerCase();
  if (name.includes("epic") || status.includes("epic")) return "Epic";
  if (task.parent) return "Task";
  if (name.includes("story") || name.startsWith("us ")) return "Story";
  return "Task";
}

export function createClickUpProjection(
  opts: ClickUpProjectionOptions,
): SourceProjection {
  const token = opts.token.trim();
  const taskLimit = opts.taskLimitPerList ?? 50;

  return {
    kind: "clickup",

    async testConnection() {
      await cu<{ teams: CuTeam[] }>(token, "/team");
    },

    async introspectScopes() {
      const { teams } = await cu<{ teams: CuTeam[] }>(token, "/team");
      const scopes: ScopeMeta[] = [];
      for (const team of teams) {
        const { spaces } = await cu<{ spaces: CuSpace[] }>(
          token,
          `/team/${team.id}/space?archived=false`,
        );
        for (const space of spaces) {
          if (opts.spaceIds?.length && !opts.spaceIds.includes(space.id)) {
            continue;
          }
          scopes.push({
            id: space.id,
            label: `${team.name} / ${space.name}`,
            kind: "space",
            meta: { teamId: team.id },
          });
        }
      }
      return scopes;
    },

    async *project(cursor?: string | null) {
      const since = cursor ? Date.parse(cursor) : NaN;
      const sinceOk = !Number.isNaN(since);
      const dateUpdatedGt = sinceOk ? String(since) : null;
      const spaces = await this.introspectScopes();

      for (const space of spaces) {
        const foldered = await cu<{
          folders: Array<{ id: string; name: string; lists: CuList[] }>;
        }>(token, `/space/${space.id}/folder?archived=false`);

        const folderLists = foldered.folders.flatMap((f) =>
          f.lists.map((l) => ({ ...l, folder: f.name })),
        );

        const { lists: rootLists } = await cu<{ lists: CuList[] }>(
          token,
          `/space/${space.id}/list?archived=false`,
        );

        const allLists = [
          ...folderLists,
          ...rootLists.map((l) => ({ ...l, folder: "" })),
        ];

        for (const list of allLists) {
          const qs = new URLSearchParams({
            archived: "false",
            include_closed: "true",
            subtasks: "true",
          });
          if (dateUpdatedGt) qs.set("date_updated_gt", dateUpdatedGt);

          const { tasks } = await cu<{ tasks: CuTask[] }>(
            token,
            `/list/${list.id}/task?${qs.toString()}`,
          );

          let count = 0;
          for (const task of tasks) {
            if (count >= taskLimit) break;

            const updatedMs = task.date_updated
              ? Number(task.date_updated)
              : NaN;
            if (sinceOk && !Number.isNaN(updatedMs) && updatedMs <= since) {
              continue;
            }

            count += 1;

            const type = taskType(task);
            const commentsText = await fetchTaskComments(token, task.id, 5);
            const custom = (task.custom_fields ?? [])
              .map((f) => `${f.name}=${JSON.stringify(f.value ?? "")}`)
              .join("; ");

            const entity: CanonicalEntity = {
              id: entityId("clickup", type, task.id),
              type,
              source: "clickup",
              externalId: task.id,
              title: task.name,
              url: task.url,
              updatedAt: task.date_updated
                ? new Date(Number(task.date_updated)).toISOString()
                : undefined,
              text: [
                task.name,
                task.description ?? "",
                custom,
                commentsText ? `comments:\n${commentsText}` : "",
                `list:${list.name}`,
                `space:${space.label}`,
              ].join("\n"),
              payload: {
                listId: list.id,
                listName: list.name,
                spaceId: space.id,
                status: task.status?.status,
                parent: task.parent ?? null,
                customFields: task.custom_fields ?? [],
                hasComments: Boolean(commentsText),
              },
            };
            yield { kind: "entity", entity } satisfies CanonicalFact;

            if (task.parent) {
              // Parent may be Story/Epic/Task — link as child to generic Task id; linker/discovery resolve
              yield {
                kind: "edge",
                edge: {
                  fromId: entityId("clickup", "Story", task.parent),
                  toId: entity.id,
                  rel: "child",
                  evidence: { via: "clickup_parent" },
                },
              };
              yield {
                kind: "edge",
                edge: {
                  fromId: entityId("clickup", "Task", task.parent),
                  toId: entity.id,
                  rel: "child",
                  evidence: { via: "clickup_parent" },
                },
              };
              yield {
                kind: "edge",
                edge: {
                  fromId: entityId("clickup", "Epic", task.parent),
                  toId: entity.id,
                  rel: "child",
                  evidence: { via: "clickup_parent" },
                },
              };
            }
          }
        }
      }
    },

    async getByExternalId(type: CanonicalEntityType, externalId: string) {
      if (type !== "Task" && type !== "Story" && type !== "Epic") return null;
      const { task } = await cu<{ task: CuTask }>(token, `/task/${externalId}`);
      const resolved = taskType(task);
      return {
        id: entityId("clickup", resolved, task.id),
        type: resolved,
        source: "clickup",
        externalId: task.id,
        title: task.name,
        url: task.url,
        text: [task.name, task.description ?? ""].join("\n"),
        payload: { status: task.status?.status },
      };
    },
  };
}
