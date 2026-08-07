import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import {
  AdapterNotFoundError,
  EngineNotImplementedError,
  validateLlmCredentials,
} from "@synapse/core";
import { LEGACY_TENANT_ID } from "@synapse/storage";
import { clearCachedSchema, getCachedSchema, setCachedSchema } from "../schemaCache.js";
import {
  ensureProjectSchema,
  refreshCloudConnectionStatus,
  testProjectConnection,
} from "../edge/dataAccess.js";
import { EdgeOfflineError } from "../edge/gateway.js";
import {
  canManageTenant,
  loadAccessibleProject,
  requireAuth,
  resolveTenantIdForWrite,
} from "../auth/access.js";

const createBody = z.object({
  name: z.string().min(1),
  engine: z.string().min(1),
  host: z.string().min(1),
  port: z.coerce.number().int().positive(),
  database: z.string().min(1),
  username: z.string().min(1),
  password: z.string().min(1),
  readOnly: z.boolean().optional(),
  options: z.record(z.string(), z.unknown()).optional(),
  connectionMode: z.enum(["cloud", "edge"]).optional(),
});

const createEdgeBody = z.object({
  name: z.string().min(1),
  engine: z.string().min(1).optional(),
  readOnly: z.boolean().optional(),
  vertical: z.enum(["business", "engineering"]).optional(),
});

const exposeBody = z.object({
  resources: z.array(z.string().min(1)).min(1),
});

/** Defaults alinhados ao docker-compose.yml local (postgres demo). */
const DEMO_DB = {
  engine: "postgresql",
  host: "host.docker.internal",
  port: "5433",
  name: "erpclient",
  user: "synapsee",
  password: "synapsee",
} as const;

function businessEdgeDockerRun(token: string, cloudUrl: string): string {
  return [
    "docker run -d --name synapsee-edge \\",
    `  -e SYNAPSEE_TOKEN=${token} \\`,
    `  -e SYNAPSEE_CLOUD_URL=${cloudUrl} \\`,
    `  -e SYNAPSEE_DB_ENGINE=${DEMO_DB.engine} \\`,
    `  -e SYNAPSEE_DB_HOST=${DEMO_DB.host} \\`,
    `  -e SYNAPSEE_DB_PORT=${DEMO_DB.port} \\`,
    `  -e SYNAPSEE_DB_NAME=${DEMO_DB.name} \\`,
    `  -e SYNAPSEE_DB_USER=${DEMO_DB.user} \\`,
    `  -e SYNAPSEE_DB_PASSWORD=${DEMO_DB.password} \\`,
    "  synapsee/edge:latest",
  ].join("\n");
}

function businessEdgeCompose(token: string, cloudUrl: string): string {
  return `services:
  synapsee-edge:
    image: synapsee/edge:latest
    container_name: synapsee-edge
    restart: unless-stopped
    environment:
      SYNAPSEE_TOKEN: ${token}
      SYNAPSEE_CLOUD_URL: ${cloudUrl}
      SYNAPSEE_DB_ENGINE: ${DEMO_DB.engine}
      SYNAPSEE_DB_HOST: ${DEMO_DB.host}
      SYNAPSEE_DB_PORT: "${DEMO_DB.port}"
      SYNAPSEE_DB_NAME: ${DEMO_DB.name}
      SYNAPSEE_DB_USER: ${DEMO_DB.user}
      SYNAPSEE_DB_PASSWORD: ${DEMO_DB.password}
    extra_hosts:
      - "host.docker.internal:host-gateway"
`;
}

export { getCachedSchema, setCachedSchema, clearCachedSchema };

export const projectsRoutes: FastifyPluginAsync = async (app) => {
  app.post("/projects", async (req, reply) => {
    const auth = requireAuth(req, reply);
    if (!auth) return;
    if (!canManageTenant(auth)) {
      return reply.code(403).send({ error: "Sem permissão para criar projetos" });
    }
    const parsed = createBody.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.flatten() });
    }
    const data = parsed.data;
    if (data.connectionMode === "edge") {
      return reply.code(400).send({
        error: "Use POST /projects/edge para criar projeto em modo Edge",
      });
    }

    const tenantId =
      resolveTenantIdForWrite(auth) ?? LEGACY_TENANT_ID;
    try {
      app.store.tenants.assertCanCreateProject(tenantId);
    } catch (err) {
      if (err instanceof Error && err.message === "QUOTA_PROJECTS") {
        return reply.code(402).send({
          error: "Limite de projetos do plano atingido",
        });
      }
      throw err;
    }

    try {
      const { getAdapterOrThrow } = await import("@synapse/core");
      const adapter = getAdapterOrThrow(data.engine);
      await adapter.testConnection({
        engine: data.engine,
        host: data.host,
        port: data.port,
        database: data.database,
        username: data.username,
        password: data.password,
        options: data.options,
        readOnly: data.readOnly,
      });
    } catch (err) {
      if (err instanceof EngineNotImplementedError || err instanceof AdapterNotFoundError) {
        return reply.code(400).send({ error: err.message });
      }
      const message = err instanceof Error ? err.message : "Falha na conexão";
      return reply.code(502).send({ error: `Não foi possível conectar: ${message}` });
    }

    const record = app.store.create({
      ...data,
      tenantId,
      connectionMode: "cloud",
    });
    return reply.code(201).send(app.store.toPublic(record));
  });

  app.post("/projects/edge", async (req, reply) => {
    const auth = requireAuth(req, reply);
    if (!auth) return;
    if (!canManageTenant(auth)) {
      return reply.code(403).send({ error: "Sem permissão para criar projetos" });
    }
    const parsed = createEdgeBody.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.flatten() });
    }
    const tenantId =
      resolveTenantIdForWrite(auth) ?? LEGACY_TENANT_ID;
    try {
      app.store.tenants.assertCanCreateProject(tenantId);
    } catch (err) {
      if (err instanceof Error && err.message === "QUOTA_PROJECTS") {
        return reply.code(402).send({
          error: "Limite de projetos do plano atingido",
        });
      }
      throw err;
    }
    const record = app.store.createEdgeProject({ ...parsed.data, tenantId });
    const token = app.store.createEdgeToken(record.id);
    const cloudUrl =
      process.env.PUBLIC_API_URL ??
      `${req.protocol}://${req.hostname}${req.hostname.includes("localhost") ? `:${(req.socket as { localPort?: number }).localPort ?? 3000}` : ""}`;
    const baseUrl = cloudUrl.replace(/\/$/, "");
    const isEng = record.vertical === "engineering";

    const dockerSnippet = isEng
      ? [
          "docker run -d --name synapsee-edge \\",
          `  -e SYNAPSEE_TOKEN=${token!.token} \\`,
          `  -e SYNAPSEE_CLOUD_URL=${baseUrl} \\`,
          "  -e SYNAPSEE_GITHUB_TOKEN=ghp_xxx \\",
          "  -e SYNAPSEE_CLICKUP_TOKEN=pk_xxx \\",
          "  # optional: -e SYNAPSEE_GITHUB_REPOS=org/repo1,org/repo2 \\",
          "  synapsee/edge:latest",
        ].join("\n")
      : businessEdgeDockerRun(token!.token, baseUrl);

    const composeYaml = isEng
      ? `services:
  synapsee-edge:
    image: synapsee/edge:latest
    container_name: synapsee-edge
    restart: unless-stopped
    environment:
      SYNAPSEE_TOKEN: ${token!.token}
      SYNAPSEE_CLOUD_URL: ${baseUrl}
      SYNAPSEE_GITHUB_TOKEN: ghp_xxx
      SYNAPSEE_CLICKUP_TOKEN: pk_xxx
    extra_hosts:
      - "host.docker.internal:host-gateway"
`
      : businessEdgeCompose(token!.token, baseUrl);

    return reply.code(201).send({
      project: app.store.toPublic(record),
      edgeToken: {
        id: token!.id,
        token: token!.token,
        tokenPrefix: token!.tokenPrefix,
        createdAt: token!.createdAt,
        warning: "Guarde este token agora — ele não será mostrado novamente.",
      },
      install: {
        cloudUrl: baseUrl,
        dockerRun: dockerSnippet,
        dockerCompose: composeYaml,
      },
    });
  });

  app.get("/projects", async (req, reply) => {
    const auth = requireAuth(req, reply);
    if (!auth) return;
    const records =
      auth.type === "platform"
        ? app.store.list()
        : app.store.listForTenant(auth.tenantId);
    // Revalida Cloud em paralelo — não confiar em "connected" antigo.
    const fresh = await Promise.all(
      records.map((r) =>
        r.connectionMode === "cloud"
          ? refreshCloudConnectionStatus(app.store, app.edge, r)
          : Promise.resolve(r),
      ),
    );
    return fresh.map((r) => app.store.toPublic(r));
  });

  app.get<{ Params: { id: string } }>("/projects/:id", async (req, reply) => {
    const record = loadAccessibleProject(
      app.store,
      req.auth,
      req.params.id,
      reply,
    );
    if (!record) return;
    // Cloud: revalida o banco — status "connected" antigo não basta.
    const fresh = await refreshCloudConnectionStatus(
      app.store,
      app.edge,
      record,
    );
    return app.store.toPublic(fresh);
  });

  app.delete<{ Params: { id: string } }>("/projects/:id", async (req, reply) => {
    const auth = requireAuth(req, reply);
    if (!auth) return;
    if (!canManageTenant(auth)) {
      return reply.code(403).send({ error: "Sem permissão" });
    }
    const record = loadAccessibleProject(
      app.store,
      req.auth,
      req.params.id,
      reply,
    );
    if (!record) return;
    const ok = app.store.delete(record.id);
    if (!ok) return reply.code(404).send({ error: "Projeto não encontrado" });
    clearCachedSchema(req.params.id);
    return reply.code(204).send();
  });

  app.get<{ Params: { id: string } }>("/projects/:id/test", async (req, reply) => {
    const record = loadAccessibleProject(
      app.store,
      req.auth,
      req.params.id,
      reply,
    );
    if (!record) return;
    try {
      const result = await testProjectConnection(app.store, app.edge, record);
      if (!result.ok) {
        return reply.code(502).send({
          ok: false,
          error: result.error ?? "Banco indisponível",
          project: app.store.toPublic(app.store.get(record.id) ?? record),
        });
      }
      return {
        ok: true,
        project: app.store.toPublic(app.store.get(record.id) ?? record),
      };
    } catch (err) {
      if (err instanceof EdgeOfflineError) {
        return reply.code(503).send({ ok: false, error: err.message });
      }
      const message = err instanceof Error ? err.message : "erro";
      if (record.connectionMode === "cloud") {
        app.store.setCloudStatus(record.id, "error", message);
      }
      return reply.code(502).send({ ok: false, error: message });
    }
  });

  app.get<{ Params: { id: string } }>("/projects/:id/schema", async (req, reply) => {
    const record = loadAccessibleProject(app.store, req.auth, req.params.id, reply);
    if (!record) return;
    try {
      const snap = await ensureProjectSchema(app.store, app.edge, record);
      return snap;
    } catch (err) {
      if (err instanceof EdgeOfflineError) {
        return reply.code(503).send({ error: err.message });
      }
      if (err instanceof EngineNotImplementedError) {
        return reply.code(400).send({ error: err.message });
      }
      const message = err instanceof Error ? err.message : "erro";
      return reply.code(502).send({ error: message });
    }
  });

  app.get<{ Params: { id: string } }>("/projects/:id/schema/summary", async (req, reply) => {
    const record = loadAccessibleProject(app.store, req.auth, req.params.id, reply);
    if (!record) return;
    try {
      const snap = await ensureProjectSchema(app.store, app.edge, record);
      return {
        engine: snap.engine,
        resourceCount: snap.resources.length,
        resources: snap.resources.map((r) => ({
          name: r.name,
          kind: r.kind,
          fieldCount: r.fields.length,
          primaryKey: r.primaryKey,
        })),
      };
    } catch (err) {
      if (err instanceof EdgeOfflineError) {
        return reply.code(503).send({ error: err.message });
      }
      const message = err instanceof Error ? err.message : "erro";
      return reply.code(502).send({ error: message });
    }
  });

  app.put<{ Params: { id: string } }>("/projects/:id/expose", async (req, reply) => {
    const record = loadAccessibleProject(app.store, req.auth, req.params.id, reply);
    if (!record) return;

    const parsed = exposeBody.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.flatten() });
    }

    try {
      const snap = await ensureProjectSchema(app.store, app.edge, record);
      const known = new Set(snap.resources.map((r) => r.name));
      const invalid = parsed.data.resources.filter((r) => !known.has(r));
      if (invalid.length) {
        return reply.code(400).send({ error: `Recursos inválidos: ${invalid.join(", ")}` });
      }

      const updated = app.store.setExposed(record.id, parsed.data.resources);
      return app.store.toPublic(updated!);
    } catch (err) {
      if (err instanceof EdgeOfflineError) {
        return reply.code(503).send({ error: err.message });
      }
      const message = err instanceof Error ? err.message : "erro";
      return reply.code(502).send({ error: message });
    }
  });

  const mcpKeyBody = z.object({
    name: z.string().min(1).max(120),
  });

  app.get<{ Params: { id: string } }>("/projects/:id/mcp-keys", async (req, reply) => {
    const auth = requireAuth(req, reply);
    if (!auth) return;
    if (auth.type === "mcp_key") {
      return reply.code(403).send({ error: "Chave MCP não pode listar chaves" });
    }
    const record = loadAccessibleProject(app.store, auth, req.params.id, reply);
    if (!record) return;
    return { keys: app.store.listMcpKeys(record.id) };
  });

  app.post<{ Params: { id: string } }>("/projects/:id/mcp-keys", async (req, reply) => {
    const auth = requireAuth(req, reply);
    if (!auth) return;
    if (auth.type === "mcp_key") {
      return reply.code(403).send({ error: "Chave MCP não pode criar chaves" });
    }
    const record = loadAccessibleProject(app.store, auth, req.params.id, reply);
    if (!record) return;
    const parsed = mcpKeyBody.safeParse(req.body ?? {});
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.flatten() });
    }
    const createdBy = auth.type === "user" ? auth.userId : null;
    const key = app.store.createMcpKey(record.id, parsed.data.name, createdBy);
    if (!key) return reply.code(500).send({ error: "Falha ao gerar chave MCP" });

    const cloudUrl =
      process.env.PUBLIC_API_URL ?? `http://localhost:${process.env.PORT ?? 3000}`;
    const base = cloudUrl.replace(/\/$/, "");
    const serverId = `synapsee-${record.id.slice(0, 8)}`;
    const url = `${base}/p/${record.id}/mcp`;
    const cursorConfig = {
      mcpServers: {
        [serverId]: {
          url,
          headers: { "X-API-Key": key.token },
        },
      },
    };

    return {
      id: key.id,
      name: key.name,
      token: key.token,
      tokenPrefix: key.tokenPrefix,
      createdAt: key.createdAt,
      warning: "Copie agora — o plaintext não será mostrado de novo. Envie com segurança ao desenvolvedor.",
      mcpUrl: url,
      cursorConfig,
    };
  });

  app.delete<{ Params: { id: string; keyId: string } }>(
    "/projects/:id/mcp-keys/:keyId",
    async (req, reply) => {
      const auth = requireAuth(req, reply);
      if (!auth) return;
      if (auth.type === "mcp_key") {
        return reply.code(403).send({ error: "Chave MCP não pode revogar chaves" });
      }
      const record = loadAccessibleProject(app.store, auth, req.params.id, reply);
      if (!record) return;
      const ok = app.store.revokeMcpKey(record.id, req.params.keyId);
      if (!ok) {
        return reply.code(404).send({ error: "Chave não encontrada ou já revogada" });
      }
      return { ok: true };
    },
  );

  app.post<{ Params: { id: string } }>("/projects/:id/edge-tokens", async (req, reply) => {
    const record = loadAccessibleProject(app.store, req.auth, req.params.id, reply);
    if (!record) return;
    if (record.connectionMode !== "edge") {
      return reply.code(400).send({ error: "Projeto não está em modo Edge" });
    }
    const token = app.store.createEdgeToken(record.id);
    if (!token) return reply.code(500).send({ error: "Falha ao gerar token" });

    const cloudUrl =
      process.env.PUBLIC_API_URL ?? `http://localhost:${process.env.PORT ?? 3000}`;
    const base = cloudUrl.replace(/\/$/, "");
    const eng = record.vertical === "engineering";

    const dockerRun = eng
      ? [
          "docker run -d --name synapsee-edge \\",
          `  -e SYNAPSEE_TOKEN=${token.token} \\`,
          `  -e SYNAPSEE_CLOUD_URL=${base} \\`,
          "  -e SYNAPSEE_GITHUB_TOKEN=ghp_xxx \\",
          "  -e SYNAPSEE_CLICKUP_TOKEN=pk_xxx \\",
          "  # optional: -e SYNAPSEE_GITHUB_REPOS=org/repo1,org/repo2 \\",
          "  synapsee/edge:latest",
        ].join("\n")
      : businessEdgeDockerRun(token.token, base);

    const dockerCompose = eng
      ? `services:
  synapsee-edge:
    image: synapsee/edge:latest
    container_name: synapsee-edge
    restart: unless-stopped
    environment:
      SYNAPSEE_TOKEN: ${token.token}
      SYNAPSEE_CLOUD_URL: ${base}
      SYNAPSEE_GITHUB_TOKEN: ghp_xxx
      SYNAPSEE_CLICKUP_TOKEN: pk_xxx
    extra_hosts:
      - "host.docker.internal:host-gateway"
`
      : businessEdgeCompose(token.token, base);

    return reply.code(201).send({
      id: token.id,
      token: token.token,
      tokenPrefix: token.tokenPrefix,
      createdAt: token.createdAt,
      warning: "Guarde este token agora — ele não será mostrado novamente.",
      install: {
        dockerRun,
        dockerCompose,
      },
    });
  });

  app.get<{ Params: { id: string } }>("/projects/:id/edge-tokens", async (req, reply) => {
    const record = loadAccessibleProject(app.store, req.auth, req.params.id, reply);
    if (!record) return;
    return {
      tokens: app.store.listEdgeTokens(record.id),
      edgeOnline: app.edge.isOnline(record.id),
      edgeStatus: record.edgeStatus,
      edgeLastSeen: record.edgeLastSeen,
      edgeVersion: record.edgeVersion,
    };
  });

  app.get<{ Params: { id: string } }>("/projects/:id/edge/install", async (req, reply) => {
    const record = loadAccessibleProject(app.store, req.auth, req.params.id, reply);
    if (!record) return;
    if (record.connectionMode !== "edge") {
      return reply.code(400).send({ error: "Projeto não está em modo Edge" });
    }
    const cloudUrl =
      process.env.PUBLIC_API_URL ?? `http://localhost:${process.env.PORT ?? 3000}`;
    const base = cloudUrl.replace(/\/$/, "");
    const eng = record.vertical === "engineering";
    return {
      cloudUrl: base,
      note: "Gere um Project Token para obter o comando com SYNAPSEE_TOKEN preenchido.",
      dockerRunTemplate: eng
        ? [
            "docker run -d --name synapsee-edge \\",
            "  -e SYNAPSEE_TOKEN=<PROJECT_TOKEN> \\",
            `  -e SYNAPSEE_CLOUD_URL=${base} \\`,
            "  -e SYNAPSEE_GITHUB_TOKEN=ghp_xxx \\",
            "  -e SYNAPSEE_CLICKUP_TOKEN=pk_xxx \\",
            "  synapsee/edge:latest",
          ].join("\n")
        : businessEdgeDockerRun("<PROJECT_TOKEN>", base),
      dockerComposeTemplate: eng
        ? `services:
  synapsee-edge:
    image: synapsee/edge:latest
    environment:
      SYNAPSEE_TOKEN: <PROJECT_TOKEN>
      SYNAPSEE_CLOUD_URL: ${base}
      SYNAPSEE_GITHUB_TOKEN: ghp_xxx
      SYNAPSEE_CLICKUP_TOKEN: pk_xxx
`
        : businessEdgeCompose("<PROJECT_TOKEN>", base),
      status: {
        edgeStatus: record.edgeStatus,
        edgeLastSeen: record.edgeLastSeen,
        edgeVersion: record.edgeVersion,
        online: record.edgeStatus === "online",
        edgeLastError: record.edgeLastError,
      },
    };
  });

  app.delete<{ Params: { id: string; tokenId: string } }>(
    "/projects/:id/edge-tokens/:tokenId",
    async (req, reply) => {
      const record = loadAccessibleProject(app.store, req.auth, req.params.id, reply);
      if (!record) return;
      const ok = app.store.revokeEdgeToken(record.id, req.params.tokenId);
      if (!ok) return reply.code(404).send({ error: "Token não encontrado ou já revogado" });
      return { ok: true };
    },
  );

  const llmConfigBody = z.object({
    provider: z
      .enum(["openai", "anthropic", "gemini", "openai_compatible", "none"])
      .optional(),
    model: z.string().min(1).nullable().optional(),
    baseUrl: z.union([z.string().url(), z.literal("")]).nullable().optional(),
    apiKey: z.string().min(1).nullable().optional(),
    clearApiKey: z.boolean().optional(),
    enabled: z.boolean().optional(),
  });

  app.get<{ Params: { id: string } }>(
    "/projects/:id/llm-config",
    async (req, reply) => {
      const record = loadAccessibleProject(app.store, req.auth, req.params.id, reply);
      if (!record) return;
      return { llmConfig: app.store.toPublic(record).llmConfig };
    },
  );

  app.put<{ Params: { id: string } }>(
    "/projects/:id/llm-config",
    async (req, reply) => {
      const record = loadAccessibleProject(app.store, req.auth, req.params.id, reply);
      if (!record) return;
      const parsed = llmConfigBody.safeParse(req.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: parsed.error.flatten() });
      }
      const data = parsed.data;
      const disconnect =
        data.enabled === false ||
        data.provider === "none" ||
        (data.clearApiKey === true && !data.apiKey);
      if (!disconnect && data.enabled !== false) {
        const prev = app.store.getLlmConfig(record);
        const apiKey =
          (data.apiKey && data.apiKey.trim()) ||
          (data.clearApiKey !== true ? prev.apiKey : undefined);
        if (!apiKey) {
          return reply.code(400).send({
            error:
              "Informe uma API key para conectar o LLM neste projeto. Salvar vazio não liga o provider.",
          });
        }
        const provider =
          data.provider ?? prev.provider ?? "openai";
        if (
          provider === "openai_compatible" &&
          !(data.baseUrl?.trim() || prev.baseUrl)
        ) {
          return reply.code(400).send({
            error:
              "Base URL é obrigatória para OpenAI-compatible (ex.: http://localhost:11434/v1)",
          });
        }
        const check = await validateLlmCredentials({
          provider,
          apiKey,
          model:
            data.model === null
              ? undefined
              : (data.model ?? prev.model) || undefined,
          baseUrl:
            data.baseUrl === null
              ? undefined
              : (data.baseUrl ?? prev.baseUrl) || undefined,
          enabled: true,
        });
        if (!check.ok) {
          return reply.code(400).send({ error: check.error });
        }
      }
      const updated = app.store.setLlmConfig(record.id, data);
      return { llmConfig: app.store.toPublic(updated!).llmConfig };
    },
  );
};
