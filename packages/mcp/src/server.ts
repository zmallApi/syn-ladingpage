import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  analyzeBusinessProfile,
  bindTemplate,
  findResource,
  getAdapterOrThrow,
  getTemplate,
  mcpToolNamesForCapability,
  type ConnectionConfig,
  type ResourceMeta,
  type SchemaSnapshot,
} from "@synapse/core";

export interface ProjectMcpDataAccess {
  list: (
    meta: ResourceMeta,
    opts: { limit: number; offset: number; filter?: Record<string, unknown> },
  ) => Promise<Record<string, unknown>[]>;
  getById: (
    meta: ResourceMeta,
    id: string | number,
  ) => Promise<Record<string, unknown> | null>;
  insert: (
    meta: ResourceMeta,
    data: Record<string, unknown>,
  ) => Promise<Record<string, unknown>>;
}

export interface ProjectMcpContext {
  projectId: string;
  projectName: string;
  engine: string;
  readOnly: boolean;
  exposedResources: string[];
  activeCapabilities: string[];
  roleOverrides?: Record<string, string>;
  /** Required when dataAccess is not provided (Cloud mode). */
  connection?: ConnectionConfig;
  /** When set, queries go through these callbacks (Edge proxy). */
  dataAccess?: ProjectMcpDataAccess;
  schema: SchemaSnapshot;
  /** Optional product analytics hook (e.g. first useful MCP question). */
  onCapabilityInvoke?: (capabilityId: string, toolName: string) => void;
  /** Engineering vertical: Discovery over Knowledge Layer */
  discoverStory?: (taskRef: string) => Promise<unknown>;
  /** Engineering vertical: Story OS Refine */
  refineStory?: (taskRef: string) => Promise<unknown>;
  /** Engineering vertical: Story OS Impact */
  impactStory?: (taskRef: string) => Promise<unknown>;
  /** Engineering vertical: Story OS Plan */
  planStory?: (taskRef: string) => Promise<unknown>;
  /** Engineering vertical: Story OS Execute (Mission Package) */
  executeContext?: (taskRef: string) => Promise<unknown>;
  /** Mission Engine — preferred agent entrypoint */
  runMission?: (
    missionId: string,
    params: Record<string, unknown>,
  ) => Promise<unknown>;
  listMissions?: () => Promise<unknown>;
  vertical?: "business" | "engineering";
}

function text(data: unknown) {
  return {
    content: [
      {
        type: "text" as const,
        text: typeof data === "string" ? data : JSON.stringify(data, null, 2),
      },
    ],
  };
}

function errorText(message: string) {
  return {
    isError: true as const,
    content: [{ type: "text" as const, text: message }],
  };
}

function requireExposed(
  ctx: ProjectMcpContext,
  resourceName: string,
): ResourceMeta | null {
  if (!ctx.exposedResources.includes(resourceName)) return null;
  return findResource(ctx.schema, resourceName) ?? null;
}

function zodFromFields(
  fields: Array<{
    name: string;
    type: "string" | "number" | "boolean";
    required?: boolean;
    description?: string;
  }>,
) {
  const shape: Record<string, z.ZodTypeAny> = {};
  for (const f of fields) {
    let schema: z.ZodTypeAny =
      f.type === "number"
        ? z.number()
        : f.type === "boolean"
          ? z.boolean()
          : z.string();
    if (f.description) schema = schema.describe(f.description);
    if (!f.required) schema = schema.optional();
    shape[f.name] = schema;
  }
  return shape;
}

/** Builds a per-project MCP server whose tools query the client DB live (no data import). */
export function createProjectMcpServer(ctx: ProjectMcpContext): McpServer {
  const server = new McpServer({
    name: `synapsee-${ctx.projectId.slice(0, 8)}`,
    version: "0.1.0",
  });

  const adapter = ctx.dataAccess ? null : getAdapterOrThrow(ctx.engine);
  if (!ctx.dataAccess && !ctx.connection) {
    throw new Error("MCP context requires connection or dataAccess");
  }

  const listRows = (
    meta: ResourceMeta,
    opts: { limit: number; offset: number; filter?: Record<string, unknown> },
  ) =>
    ctx.dataAccess
      ? ctx.dataAccess.list(meta, opts)
      : adapter!.list(ctx.connection!, meta, opts);

  const getRow = (meta: ResourceMeta, id: string | number) =>
    ctx.dataAccess
      ? ctx.dataAccess.getById(meta, id)
      : adapter!.getById(ctx.connection!, meta, id);

  const insertRow = (meta: ResourceMeta, data: Record<string, unknown>) =>
    ctx.dataAccess
      ? ctx.dataAccess.insert(meta, data)
      : adapter!.insert(ctx.connection!, meta, data);

  server.tool(
    "list_exposed_resources",
    "Lista os recursos (tabelas/coleções) expostos deste sistema Synapsee.",
    {},
    async () => {
      const items = ctx.exposedResources.map((name) => {
        const meta = findResource(ctx.schema, name);
        return {
          name,
          kind: meta?.kind ?? "unknown",
          schema: meta?.schema,
          primaryKey: meta?.primaryKey ?? [],
          fieldCount: meta?.fields.length ?? 0,
        };
      });
      return text({
        projectId: ctx.projectId,
        projectName: ctx.projectName,
        engine: ctx.engine,
        readOnly: ctx.readOnly,
        resources: items,
        activeCapabilities: ctx.activeCapabilities,
      });
    },
  );

  server.tool(
    "describe_resource",
    "Descreve campos e chave primária de um recurso exposto.",
    {
      resource: z.string().describe("Nome do recurso (ex.: clientes)"),
    },
    async ({ resource }) => {
      const meta = requireExposed(ctx, resource);
      if (!meta) return errorText(`Recurso não exposto: ${resource}`);
      return text({
        name: meta.name,
        kind: meta.kind,
        schema: meta.schema,
        primaryKey: meta.primaryKey ?? [],
        fields: meta.fields,
      });
    },
  );

  server.tool(
    "query_records",
    "Lista registros de um recurso no banco do cliente (query ao vivo, paginada).",
    {
      resource: z.string().describe("Nome do recurso"),
      limit: z.number().int().min(1).max(100).optional().describe("Máx. 100 (default 20)"),
      offset: z.number().int().min(0).optional().describe("Offset (default 0)"),
    },
    async ({ resource, limit, offset }) => {
      const meta = requireExposed(ctx, resource);
      if (!meta) return errorText(`Recurso não exposto: ${resource}`);
      try {
        const rows = await listRows(meta, {
          limit: limit ?? 20,
          offset: offset ?? 0,
        });
        return text({ resource, count: rows.length, rows });
      } catch (err) {
        return errorText(err instanceof Error ? err.message : "Falha na consulta");
      }
    },
  );

  server.tool(
    "get_record",
    "Busca um registro pela chave primária.",
    {
      resource: z.string().describe("Nome do recurso"),
      id: z.union([z.string(), z.number()]).describe("Valor da PK"),
    },
    async ({ resource, id }) => {
      const meta = requireExposed(ctx, resource);
      if (!meta) return errorText(`Recurso não exposto: ${resource}`);
      try {
        const row = await getRow(meta, id);
        if (!row) return errorText(`Registro não encontrado: ${resource}/${id}`);
        return text(row);
      } catch (err) {
        return errorText(err instanceof Error ? err.message : "Falha na busca");
      }
    },
  );

  server.tool(
    "create_record",
    "Insere um registro (bloqueado se o sistema estiver em modo somente leitura).",
    {
      resource: z.string().describe("Nome do recurso"),
      data: z.record(z.unknown()).describe("Campos do registro"),
    },
    async ({ resource, data }) => {
      if (ctx.readOnly) {
        return errorText("Sistema em modo somente leitura");
      }
      const meta = requireExposed(ctx, resource);
      if (!meta) return errorText(`Recurso não exposto: ${resource}`);
      try {
        const created = await insertRow(meta, data as Record<string, unknown>);
        return text(created);
      } catch (err) {
        return errorText(err instanceof Error ? err.message : "Falha no insert");
      }
    },
  );

  // Business capability tools (confirmed by user)
  const profile = analyzeBusinessProfile(
    ctx.schema,
    (ctx.roleOverrides ?? null) as import("@synapse/core").RoleOverrides | null,
  );
  const registeredTools = new Set<string>();

  if (
    ctx.discoverStory &&
    (ctx.activeCapabilities.includes("eng_understand_story") ||
      ctx.activeCapabilities.includes("discover_story") ||
      ctx.vertical === "engineering")
  ) {
    const runUnderstand = async (taskRef: string, capabilityId: string, toolName: string) => {
      try {
        const result = await ctx.discoverStory!(taskRef);
        try {
          ctx.onCapabilityInvoke?.(capabilityId, toolName);
        } catch {
          /* ignore */
        }
        return text(result);
      } catch (err) {
        return errorText(
          err instanceof Error ? err.message : "Falha no Understand",
        );
      }
    };

    registeredTools.add("cap_eng_understand_story");
    server.tool(
      "cap_eng_understand_story",
      "Understand (Story OS): analisa Task/Story com fatos da Knowledge Layer e devolve briefing estruturado.",
      {
        taskRef: z
          .string()
          .describe("Id ClickUp, id canônico ou trecho do título da Task/Story"),
      },
      async ({ taskRef }) =>
        runUnderstand(taskRef, "eng_understand_story", "cap_eng_understand_story"),
    );

    registeredTools.add("cap_discover_story");
    server.tool(
      "cap_discover_story",
      "Alias legado de Understand (eng_understand_story).",
      {
        taskRef: z
          .string()
          .describe("Id ClickUp, id canônico ou trecho do título da Task/Story"),
      },
      async ({ taskRef }) =>
        runUnderstand(taskRef, "eng_understand_story", "cap_discover_story"),
    );
  }

  if (
    ctx.refineStory &&
    (ctx.activeCapabilities.includes("eng_refine_story") ||
      ctx.vertical === "engineering")
  ) {
    registeredTools.add("cap_eng_refine_story");
    server.tool(
      "cap_eng_refine_story",
      "Refine (Story OS): fecha gaps de aceite/escopo/MVP; checklist ready for Impact.",
      {
        taskRef: z
          .string()
          .describe("Id ClickUp, id canônico ou trecho do título da Task/Story"),
      },
      async ({ taskRef }) => {
        try {
          const result = await ctx.refineStory!(taskRef);
          try {
            ctx.onCapabilityInvoke?.(
              "eng_refine_story",
              "cap_eng_refine_story",
            );
          } catch {
            /* ignore */
          }
          return text(result);
        } catch (err) {
          return errorText(
            err instanceof Error ? err.message : "Falha no Refine",
          );
        }
      },
    );
  }

  if (
    ctx.impactStory &&
    (ctx.activeCapabilities.includes("eng_impact_analysis") ||
      ctx.vertical === "engineering")
  ) {
    registeredTools.add("cap_eng_impact_analysis");
    server.tool(
      "cap_eng_impact_analysis",
      "Impact (Story OS): lista microserviços/repos afetados + blast radius (APIs limpas, AS-IS, drift).",
      {
        taskRef: z
          .string()
          .describe("Id ClickUp, id canônico ou trecho do título da Task/Story"),
      },
      async ({ taskRef }) => {
        try {
          const result = await ctx.impactStory!(taskRef);
          try {
            ctx.onCapabilityInvoke?.(
              "eng_impact_analysis",
              "cap_eng_impact_analysis",
            );
          } catch {
            /* ignore */
          }
          return text(result);
        } catch (err) {
          return errorText(
            err instanceof Error ? err.message : "Falha no Impact",
          );
        }
      },
    );
  }

  if (
    ctx.planStory &&
    (ctx.activeCapabilities.includes("eng_implementation_plan") ||
      ctx.vertical === "engineering")
  ) {
    registeredTools.add("cap_eng_implementation_plan");
    server.tool(
      "cap_eng_implementation_plan",
      "Plan (Story OS): work items ordenados (migration → seed → API → tests).",
      {
        taskRef: z
          .string()
          .describe("Id ClickUp, id canônico ou trecho do título da Task/Story"),
      },
      async ({ taskRef }) => {
        try {
          const result = await ctx.planStory!(taskRef);
          try {
            ctx.onCapabilityInvoke?.(
              "eng_implementation_plan",
              "cap_eng_implementation_plan",
            );
          } catch {
            /* ignore */
          }
          return text(result);
        } catch (err) {
          return errorText(
            err instanceof Error ? err.message : "Falha no Plan",
          );
        }
      },
    );
  }

  if (
    ctx.executeContext &&
    (ctx.activeCapabilities.includes("eng_execute_context") ||
      ctx.vertical === "engineering")
  ) {
    registeredTools.add("cap_eng_execute_context");
    server.tool(
      "cap_eng_execute_context",
      "Execute (Story OS): Mission Package para o agente implementar. Synapsee não gera código. Prefira run_mission(implement_story).",
      {
        taskRef: z
          .string()
          .describe("Id ClickUp, id canônico ou trecho do título da Task/Story"),
      },
      async ({ taskRef }) => {
        try {
          const result = await ctx.executeContext!(taskRef);
          try {
            ctx.onCapabilityInvoke?.(
              "eng_execute_context",
              "cap_eng_execute_context",
            );
          } catch {
            /* ignore */
          }
          return text(result);
        } catch (err) {
          return errorText(
            err instanceof Error ? err.message : "Falha no Execute",
          );
        }
      },
    );
  }

  if (ctx.listMissions) {
    registeredTools.add("list_missions");
    server.tool(
      "list_missions",
      "Lista missões disponíveis (Mission Engine). O usuário chama missões, não capabilities isoladas.",
      {},
      async () => {
        try {
          return text(await ctx.listMissions!());
        } catch (err) {
          return errorText(
            err instanceof Error ? err.message : "Falha ao listar missões",
          );
        }
      },
    );
  }

  if (ctx.runMission) {
    registeredTools.add("run_mission");
    server.tool(
      "run_mission",
      "Mission Engine: executa uma missão e devolve Mission Package. Preferir este entrypoint. Missões: implement_story, collect_overdue, analyze_incident.",
      {
        missionId: z
          .string()
          .describe(
            "implement_story | collect_overdue | analyze_incident",
          ),
        taskRef: z
          .string()
          .optional()
          .describe("Para implement_story"),
        incidentRef: z
          .string()
          .optional()
          .describe("Para analyze_incident"),
        limit: z.number().optional().describe("Para collect_overdue"),
        minDelayDays: z.number().optional().describe("Para collect_overdue"),
      },
      async (args) => {
        try {
          const { missionId, ...rest } = args;
          const params: Record<string, unknown> = {};
          for (const [k, v] of Object.entries(rest)) {
            if (v !== undefined) params[k] = v;
          }
          const result = await ctx.runMission!(missionId, params);
          try {
            ctx.onCapabilityInvoke?.(missionId, "run_mission");
          } catch {
            /* ignore */
          }
          return text(result);
        } catch (err) {
          return errorText(
            err instanceof Error ? err.message : "Falha na missão",
          );
        }
      },
    );
  }

  for (const capId of ctx.activeCapabilities) {
    if (
      capId === "discover_story" ||
      capId === "eng_understand_story" ||
      capId === "eng_refine_story" ||
      capId === "eng_impact_analysis" ||
      capId === "eng_implementation_plan" ||
      capId === "eng_execute_context"
    ) {
      continue;
    }
    const template = getTemplate(capId);
    if (!template) continue;
    const bindings = bindTemplate(template, ctx.schema, profile.resourceRoles);
    if (
      !bindings &&
      template.id !== "explain_business_model" &&
      !template.id.startsWith("eng_")
    ) {
      continue;
    }

    const shape = zodFromFields(template.inputSchema);
    const toolNames = mcpToolNamesForCapability(capId);

    for (const toolName of toolNames) {
      if (registeredTools.has(toolName)) continue;
      registeredTools.add(toolName);

      server.tool(
        toolName,
        template.description,
        shape,
        async (args) => {
          try {
            const result = await template.run(
              {
                schema: ctx.schema,
                exposedResources: ctx.exposedResources,
                bindings: bindings ?? {},
                list: (resource, opts) => listRows(resource, opts),
                getById: (resource, id) => getRow(resource, id),
              },
              args as Record<string, unknown>,
            );
            try {
              ctx.onCapabilityInvoke?.(template.id, toolName);
            } catch {
              /* analytics must not break tools */
            }
            return text(result);
          } catch (err) {
            return errorText(err instanceof Error ? err.message : "Falha na capacidade");
          }
        },
      );
    }
  }

  return server;
}

export function listCapabilityToolNames(activeCapabilities: string[]): string[] {
  const names = new Set<string>(["list_missions", "run_mission"]);
  for (const id of activeCapabilities) {
    if (id === "discover_story" || id === "eng_understand_story") {
      names.add("cap_eng_understand_story");
      names.add("cap_discover_story");
      continue;
    }
    if (id === "eng_refine_story") {
      names.add("cap_eng_refine_story");
      continue;
    }
    if (id === "eng_impact_analysis") {
      names.add("cap_eng_impact_analysis");
      continue;
    }
    if (id === "eng_implementation_plan") {
      names.add("cap_eng_implementation_plan");
      continue;
    }
    if (id === "eng_execute_context") {
      names.add("cap_eng_execute_context");
      continue;
    }
    if (!getTemplate(id)) continue;
    for (const n of mcpToolNamesForCapability(id)) names.add(n);
  }
  return [...names];
}
