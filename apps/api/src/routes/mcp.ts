import type { FastifyPluginAsync } from "fastify";
import { loadAccessibleProject } from "../auth/access.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import {
  buildMcpClientSnippets,
  buildMcpRemoteStdioSnippet,
  createProjectMcpServer,
  listCapabilityToolNames,
} from "@synapse/mcp";
import {
  ensureProjectSchema,
  getProjectRowById,
  insertProjectRow,
  listProjectRows,
} from "../edge/dataAccess.js";
import { EdgeOfflineError } from "../edge/gateway.js";

export const mcpRoutes: FastifyPluginAsync = async (app) => {
  app.all<{ Params: { projectId: string } }>(
    "/p/:projectId/mcp",
    async (req, reply) => {
      const record = loadAccessibleProject(
        app.store,
        req.auth,
        req.params.projectId,
        reply,
      );
      if (!record) return;

      const publicProject = app.store.toPublic(record);
      const isEngineering = publicProject.vertical === "engineering";

      if (!isEngineering && !publicProject.exposedResources.length) {
        return reply.code(400).send({
          error: "Nenhum recurso exposto. Use PUT /projects/:id/expose antes.",
        });
      }

      try {
        const snap = isEngineering
          ? {
              engine: "engineering",
              resources: [],
            }
          : await ensureProjectSchema(app.store, app.edge, record);

        const kl = app.store.knowledge.bindForProject(record.id);

        const mcpServer = createProjectMcpServer({
          projectId: record.id,
          projectName: record.name,
          engine: record.engine,
          readOnly: publicProject.readOnly,
          exposedResources: publicProject.exposedResources,
          activeCapabilities: publicProject.activeCapabilities,
          roleOverrides: publicProject.roleOverrides,
          schema: snap,
          vertical: publicProject.vertical,
          listMissions: async () => {
            const { listMissions } = await import("@synapse/core");
            return { missions: listMissions(publicProject.vertical) };
          },
          runMission: async (missionId, params) => {
            const {
              analyzeCapabilities,
              bindTemplate,
              buildExecuteContext,
              buildImpactContext,
              getTemplate,
              runMission,
            } = await import("@synapse/core");
            const result = await runMission(missionId, params, {
              kl,
              projectId: record.id,
              resourceHints: publicProject.exposedResources,
              runImplementStory: (taskRef) => buildExecuteContext(kl, taskRef),
              runImpact: (ref) => buildImpactContext(kl, ref),
              runCapability: async (capabilityId, args) => {
                const template = getTemplate(capabilityId);
                if (!template) {
                  throw new Error(`Capability desconhecida: ${capabilityId}`);
                }
                const analysis = await analyzeCapabilities(snap, {
                  useLlm: false,
                  roleOverrides: publicProject.roleOverrides,
                  exposedResources: publicProject.exposedResources,
                  vertical:
                    record.vertical === "engineering"
                      ? "engineering"
                      : "business",
                });
                const bindings = bindTemplate(
                  template,
                  snap,
                  analysis.profile.resourceRoles,
                );
                if (
                  !bindings &&
                  template.id !== "explain_business_model" &&
                  !template.id.startsWith("eng_")
                ) {
                  throw new Error(
                    template.id === "overdue_ledger"
                      ? 'Não foi possível mapear a tabela financeira (ledger). Exponha títulos/financeiro e marque o papel “ledger”.'
                      : `Capability ${capabilityId} sem vínculo no schema`,
                  );
                }
                const dataAccess =
                  record.connectionMode === "edge"
                    ? {
                        list: (
                          meta: Parameters<typeof listProjectRows>[3],
                          opts: Parameters<typeof listProjectRows>[4],
                        ) =>
                          listProjectRows(
                            app.store,
                            app.edge,
                            record,
                            meta,
                            opts,
                          ),
                        getById: (
                          meta: Parameters<typeof getProjectRowById>[3],
                          id: string | number,
                        ) =>
                          getProjectRowById(
                            app.store,
                            app.edge,
                            record,
                            meta,
                            String(id),
                          ),
                      }
                    : null;
                if (!dataAccess && record.connectionMode === "edge") {
                  throw new Error("Edge data access required");
                }
                // Cloud: template.run via listProjectRows still works (adapter path)
                return template.run(
                  {
                    schema: snap,
                    exposedResources: publicProject.exposedResources,
                    bindings: bindings ?? {},
                    list: (resource, opts) =>
                      listProjectRows(
                        app.store,
                        app.edge,
                        record,
                        resource,
                        opts,
                      ),
                    getById: (resource, id) =>
                      getProjectRowById(
                        app.store,
                        app.edge,
                        record,
                        resource,
                        String(id),
                      ),
                  },
                  args,
                );
              },
            });
            if ("error" in result) {
              throw new Error(result.error);
            }
            const saved = app.store.missions.save({
              projectId: record.id,
              missionId: result.missionId,
              params,
              package: result.package,
              capabilityTrace: result.capabilityTrace,
              ready: result.package.ready,
            });
            app.store.recordEvent(record.id, "mission_run", {
              missionId: result.missionId,
              runId: saved.id,
              ready: result.package.ready,
              via: "mcp",
            });
            return {
              runId: saved.id,
              missionId: result.missionId,
              capabilityTrace: result.capabilityTrace,
              package: result.package,
            };
          },
          ...(isEngineering
            ? {
                discoverStory: async (taskRef: string) => {
                  const { buildDiscoveryContext } = await import("@synapse/core");
                  const result = await buildDiscoveryContext(kl, taskRef);
                  if (result && typeof result === "object" && "error" in result) {
                    throw new Error(String((result as { error: string }).error));
                  }
                  return result;
                },
                refineStory: async (taskRef: string) => {
                  const { buildRefineContext } = await import("@synapse/core");
                  const result = await buildRefineContext(kl, taskRef);
                  if (result && typeof result === "object" && "error" in result) {
                    throw new Error(String((result as { error: string }).error));
                  }
                  return result;
                },
                impactStory: async (taskRef: string) => {
                  const { buildImpactContext } = await import("@synapse/core");
                  const result = await buildImpactContext(kl, taskRef);
                  if (result && typeof result === "object" && "error" in result) {
                    throw new Error(String((result as { error: string }).error));
                  }
                  return result;
                },
                planStory: async (taskRef: string) => {
                  const { buildPlanContext } = await import("@synapse/core");
                  const result = await buildPlanContext(kl, taskRef);
                  if (result && typeof result === "object" && "error" in result) {
                    throw new Error(String((result as { error: string }).error));
                  }
                  return result;
                },
                executeContext: async (taskRef: string) => {
                  const { buildExecuteContext } = await import("@synapse/core");
                  const result = await buildExecuteContext(kl, taskRef);
                  if (result && typeof result === "object" && "error" in result) {
                    throw new Error(String((result as { error: string }).error));
                  }
                  return result;
                },
              }
            : record.connectionMode === "edge"
              ? {
                  dataAccess: {
                    list: (meta, opts) =>
                      listProjectRows(app.store, app.edge, record, meta, opts),
                    getById: (meta, id) =>
                      getProjectRowById(
                        app.store,
                        app.edge,
                        record,
                        meta,
                        String(id),
                      ),
                    insert: (meta, data) =>
                      insertProjectRow(app.store, app.edge, record, meta, data),
                  },
                }
              : {
                  connection: app.store.toConnectionConfig(record),
                }),
          onCapabilityInvoke: (capabilityId, toolName) => {
            app.store.recordEvent(record.id, "cap_mcp_invoke", {
              capabilityId,
              toolName,
            });
          },
        });

        const transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: undefined,
          enableJsonResponse: true,
        });

        reply.hijack();

        reply.raw.on("close", () => {
          void transport.close();
          void mcpServer.close();
        });

        await mcpServer.connect(transport);
        await transport.handleRequest(req.raw, reply.raw, req.body);
      } catch (err) {
        if (err instanceof EdgeOfflineError) {
          return reply.code(503).send({ error: err.message });
        }
        const message = err instanceof Error ? err.message : "erro";
        return reply.code(502).send({ error: message });
      }
    },
  );

  app.get<{ Params: { projectId: string } }>(
    "/p/:projectId/mcp.json",
    async (req, reply) => {
      const record = loadAccessibleProject(app.store, req.auth, req.params.projectId, reply);
      if (!record) return;

      const publicProject = app.store.toPublic(record);
      const base =
        process.env.PUBLIC_API_URL?.replace(/\/$/, "") ??
        `${req.protocol}://${req.headers.host}`;

      const crudTools = [
        "list_exposed_resources",
        "describe_resource",
        "query_records",
        "get_record",
        "create_record",
      ];
      const capTools = listCapabilityToolNames(publicProject.activeCapabilities);
      const serverId = `synapsee-${record.id.slice(0, 8)}`;
      const url = `${base}/p/${record.id}/mcp`;
      const apiKey = "<TENANT_API_KEY>";
      const clients = buildMcpClientSnippets({ serverId, url, apiKey });
      const cursorSnippet = clients.find((c) => c.id === "cursor");

      return {
        name: `Synapsee — ${publicProject.name}`,
        description:
          "MCP gerado pelo Synapsee IA. Consulta o banco do cliente ao vivo (sem importar dados).",
        url,
        transport: "streamable-http",
        headers: {
          "X-API-Key": apiKey,
        },
        tools: [...crudTools, ...capTools],
        activeCapabilities: publicProject.activeCapabilities,
        connectionMode: publicProject.connectionMode,
        clients,
        /** @deprecated use clients[].config — kept for older admin builds */
        cursorMcpConfig: cursorSnippet?.config ?? {
          mcpServers: {
            [serverId]: { url, headers: { "X-API-Key": apiKey } },
          },
        },
        claudeDesktopStdio: buildMcpRemoteStdioSnippet({ serverId, url, apiKey }),
        exposedResources: publicProject.exposedResources,
        readOnly: publicProject.readOnly,
      };
    },
  );
};
