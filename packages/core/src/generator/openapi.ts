import type { SchemaSnapshot } from "../adapters/types.js";

export function buildOpenApiSpec(
  projectId: string,
  snap: SchemaSnapshot,
  exposed: string[],
) {
  const exposedSet = new Set(exposed);
  const resources = snap.resources.filter((r) => exposedSet.has(r.name));

  const paths: Record<string, unknown> = {};

  for (const resource of resources) {
    const base = `/p/${projectId}/${resource.name}`;
    const props: Record<string, { type: string; nullable?: boolean }> = {};
    for (const f of resource.fields) {
      props[f.name] = {
        type: mapType(f.dataType),
        ...(f.nullable ? { nullable: true } : {}),
      };
    }

    const schema = {
      type: "object",
      properties: props,
    };

    paths[base] = {
      get: {
        summary: `List ${resource.name}`,
        parameters: [
          {
            name: "limit",
            in: "query",
            schema: { type: "integer", default: 20 },
          },
          {
            name: "offset",
            in: "query",
            schema: { type: "integer", default: 0 },
          },
        ],
        responses: {
          "200": {
            description: "OK",
            content: {
              "application/json": {
                schema: { type: "array", items: schema },
              },
            },
          },
        },
      },
      post: {
        summary: `Create ${resource.name}`,
        requestBody: {
          required: true,
          content: { "application/json": { schema } },
        },
        responses: {
          "201": {
            description: "Created",
            content: { "application/json": { schema } },
          },
        },
      },
    };

    paths[`${base}/{id}`] = {
      get: {
        summary: `Get ${resource.name} by id`,
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "string" } },
        ],
        responses: {
          "200": {
            description: "OK",
            content: { "application/json": { schema } },
          },
          "404": { description: "Not found" },
        },
      },
    };
  }

  return {
    openapi: "3.0.3",
    info: {
      title: `Synapsee project ${projectId}`,
      version: "1.0.0",
      description: `Generated API for engine ${snap.engine}. Data stays on the client database.`,
    },
    paths,
  };
}

function mapType(dataType: string): string {
  const t = dataType.toLowerCase();
  if (
    t.includes("int") ||
    t.includes("numeric") ||
    t.includes("decimal") ||
    t.includes("double") ||
    t.includes("real") ||
    t.includes("float") ||
    t.includes("serial")
  ) {
    return "number";
  }
  if (t.includes("bool")) return "boolean";
  if (t.includes("json") || t.includes("array")) return "object";
  return "string";
}
