import type { FastifyPluginAsync } from "fastify";
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
      const record = app.store.get(req.params.projectId);
      if (!record) {
        return reply.code(404).send({ error: "Projeto não encontrado" });
      }

      const publicProject = app.store.toPublic(record);
      if (!publicProject.exposedResources.length) {
        return reply.code(400).send({
          error: "Nenhum recurso exposto. Use PUT /projects/:id/expose antes.",
        });
      }

      try {
        const snap = await ensureProjectSchema(app.store, app.edge, record);
        const mcpServer = createProjectMcpServer({
          projectId: record.id,
          projectName: record.name,
          engine: record.engine,
          readOnly: publicProject.readOnly,
          exposedResources: publicProject.exposedResources,
          activeCapabilities: publicProject.activeCapabilities,
          roleOverrides: publicProject.roleOverrides,
          schema: snap,
          ...(record.connectionMode === "edge"
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
      const record = app.store.get(req.params.projectId);
      if (!record) return reply.code(404).send({ error: "Projeto não encontrado" });

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
      const apiKey = "<PLATFORM_API_KEY>";
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
