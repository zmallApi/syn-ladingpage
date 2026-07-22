import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import {
  AdapterNotFoundError,
  EngineNotImplementedError,
} from "@synapse/core";
import { clearCachedSchema, getCachedSchema, setCachedSchema } from "../schemaCache.js";
import { ensureProjectSchema, testProjectConnection } from "../edge/dataAccess.js";
import { EdgeOfflineError } from "../edge/gateway.js";

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
});

const exposeBody = z.object({
  resources: z.array(z.string().min(1)).min(1),
});

export { getCachedSchema, setCachedSchema, clearCachedSchema };

export const projectsRoutes: FastifyPluginAsync = async (app) => {
  app.post("/projects", async (req, reply) => {
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

    const record = app.store.create({ ...data, connectionMode: "cloud" });
    return reply.code(201).send(app.store.toPublic(record));
  });

  app.post("/projects/edge", async (req, reply) => {
    const parsed = createEdgeBody.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.flatten() });
    }
    const record = app.store.createEdgeProject(parsed.data);
    const token = app.store.createEdgeToken(record.id);
    const cloudUrl =
      process.env.PUBLIC_API_URL ??
      `${req.protocol}://${req.hostname}${req.hostname.includes("localhost") ? `:${(req.socket as { localPort?: number }).localPort ?? 3000}` : ""}`;

    const dockerSnippet = [
      "docker run -d --name synapsee-edge \\",
      `  -e SYNAPSEE_TOKEN=${token!.token} \\`,
      `  -e SYNAPSEE_CLOUD_URL=${cloudUrl.replace(/\/$/, "")} \\`,
      "  -e SYNAPSEE_DB_ENGINE=postgresql \\",
      "  -e SYNAPSEE_DB_HOST=host.docker.internal \\",
      "  -e SYNAPSEE_DB_PORT=5432 \\",
      "  -e SYNAPSEE_DB_NAME=mydb \\",
      "  -e SYNAPSEE_DB_USER=myuser \\",
      "  -e SYNAPSEE_DB_PASSWORD=secret \\",
      "  synapsee/edge:latest",
    ].join("\n");

    const composeYaml = `services:
  synapsee-edge:
    image: synapsee/edge:latest
    container_name: synapsee-edge
    restart: unless-stopped
    environment:
      SYNAPSEE_TOKEN: ${token!.token}
      SYNAPSEE_CLOUD_URL: ${cloudUrl.replace(/\/$/, "")}
      SYNAPSEE_DB_ENGINE: postgresql
      SYNAPSEE_DB_HOST: host.docker.internal
      SYNAPSEE_DB_PORT: "5432"
      SYNAPSEE_DB_NAME: mydb
      SYNAPSEE_DB_USER: myuser
      SYNAPSEE_DB_PASSWORD: secret
    extra_hosts:
      - "host.docker.internal:host-gateway"
`;

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
        cloudUrl: cloudUrl.replace(/\/$/, ""),
        dockerRun: dockerSnippet,
        dockerCompose: composeYaml,
      },
    });
  });

  app.get("/projects", async () => {
    return app.store.list().map((r) => app.store.toPublic(r));
  });

  app.get<{ Params: { id: string } }>("/projects/:id", async (req, reply) => {
    const record = app.store.get(req.params.id);
    if (!record) return reply.code(404).send({ error: "Projeto não encontrado" });
    return app.store.toPublic(record);
  });

  app.delete<{ Params: { id: string } }>("/projects/:id", async (req, reply) => {
    const ok = app.store.delete(req.params.id);
    if (!ok) return reply.code(404).send({ error: "Projeto não encontrado" });
    clearCachedSchema(req.params.id);
    return reply.code(204).send();
  });

  app.get<{ Params: { id: string } }>("/projects/:id/test", async (req, reply) => {
    const record = app.store.get(req.params.id);
    if (!record) return reply.code(404).send({ error: "Projeto não encontrado" });
    try {
      return await testProjectConnection(app.store, app.edge, record);
    } catch (err) {
      if (err instanceof EdgeOfflineError) {
        return reply.code(503).send({ ok: false, error: err.message });
      }
      const message = err instanceof Error ? err.message : "erro";
      return reply.code(502).send({ ok: false, error: message });
    }
  });

  app.get<{ Params: { id: string } }>("/projects/:id/schema", async (req, reply) => {
    const record = app.store.get(req.params.id);
    if (!record) return reply.code(404).send({ error: "Projeto não encontrado" });
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
    const record = app.store.get(req.params.id);
    if (!record) return reply.code(404).send({ error: "Projeto não encontrado" });
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
    const record = app.store.get(req.params.id);
    if (!record) return reply.code(404).send({ error: "Projeto não encontrado" });

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

  app.post<{ Params: { id: string } }>("/projects/:id/edge-tokens", async (req, reply) => {
    const record = app.store.get(req.params.id);
    if (!record) return reply.code(404).send({ error: "Projeto não encontrado" });
    if (record.connectionMode !== "edge") {
      return reply.code(400).send({ error: "Projeto não está em modo Edge" });
    }
    const token = app.store.createEdgeToken(record.id);
    if (!token) return reply.code(500).send({ error: "Falha ao gerar token" });

    const cloudUrl =
      process.env.PUBLIC_API_URL ?? `http://localhost:${process.env.PORT ?? 3000}`;

    return reply.code(201).send({
      id: token.id,
      token: token.token,
      tokenPrefix: token.tokenPrefix,
      createdAt: token.createdAt,
      warning: "Guarde este token agora — ele não será mostrado novamente.",
      install: {
        dockerRun: [
          "docker run -d --name synapsee-edge \\",
          `  -e SYNAPSEE_TOKEN=${token.token} \\`,
          `  -e SYNAPSEE_CLOUD_URL=${cloudUrl.replace(/\/$/, "")} \\`,
          "  -e SYNAPSEE_DB_ENGINE=postgresql \\",
          "  -e SYNAPSEE_DB_HOST=host.docker.internal \\",
          "  -e SYNAPSEE_DB_PORT=5432 \\",
          "  -e SYNAPSEE_DB_NAME=mydb \\",
          "  -e SYNAPSEE_DB_USER=myuser \\",
          "  -e SYNAPSEE_DB_PASSWORD=secret \\",
          "  synapsee/edge:latest",
        ].join("\n"),
        dockerCompose: `services:
  synapsee-edge:
    image: synapsee/edge:latest
    container_name: synapsee-edge
    restart: unless-stopped
    environment:
      SYNAPSEE_TOKEN: ${token.token}
      SYNAPSEE_CLOUD_URL: ${cloudUrl.replace(/\/$/, "")}
      SYNAPSEE_DB_ENGINE: postgresql
      SYNAPSEE_DB_HOST: host.docker.internal
      SYNAPSEE_DB_PORT: "5432"
      SYNAPSEE_DB_NAME: mydb
      SYNAPSEE_DB_USER: myuser
      SYNAPSEE_DB_PASSWORD: secret
    extra_hosts:
      - "host.docker.internal:host-gateway"
`,
      },
    });
  });

  app.get<{ Params: { id: string } }>("/projects/:id/edge-tokens", async (req, reply) => {
    const record = app.store.get(req.params.id);
    if (!record) return reply.code(404).send({ error: "Projeto não encontrado" });
    return {
      tokens: app.store.listEdgeTokens(record.id),
      edgeOnline: app.edge.isOnline(record.id),
      edgeStatus: record.edgeStatus,
      edgeLastSeen: record.edgeLastSeen,
      edgeVersion: record.edgeVersion,
    };
  });

  app.get<{ Params: { id: string } }>("/projects/:id/edge/install", async (req, reply) => {
    const record = app.store.get(req.params.id);
    if (!record) return reply.code(404).send({ error: "Projeto não encontrado" });
    if (record.connectionMode !== "edge") {
      return reply.code(400).send({ error: "Projeto não está em modo Edge" });
    }
    const cloudUrl =
      process.env.PUBLIC_API_URL ?? `http://localhost:${process.env.PORT ?? 3000}`;
    return {
      cloudUrl: cloudUrl.replace(/\/$/, ""),
      note: "Gere um Project Token para obter o comando com SYNAPSEE_TOKEN preenchido.",
      dockerRunTemplate: [
        "docker run -d --name synapsee-edge \\",
        "  -e SYNAPSEE_TOKEN=<PROJECT_TOKEN> \\",
        `  -e SYNAPSEE_CLOUD_URL=${cloudUrl.replace(/\/$/, "")} \\`,
        "  -e SYNAPSEE_DB_ENGINE=postgresql \\",
        "  -e SYNAPSEE_DB_HOST=host.docker.internal \\",
        "  -e SYNAPSEE_DB_PORT=5432 \\",
        "  -e SYNAPSEE_DB_NAME=mydb \\",
        "  -e SYNAPSEE_DB_USER=myuser \\",
        "  -e SYNAPSEE_DB_PASSWORD=secret \\",
        "  synapsee/edge:latest",
      ].join("\n"),
      dockerComposeTemplate: `services:
  synapsee-edge:
    image: synapsee/edge:latest
    container_name: synapsee-edge
    restart: unless-stopped
    environment:
      SYNAPSEE_TOKEN: <PROJECT_TOKEN>
      SYNAPSEE_CLOUD_URL: ${cloudUrl.replace(/\/$/, "")}
      SYNAPSEE_DB_ENGINE: postgresql
      SYNAPSEE_DB_HOST: host.docker.internal
      SYNAPSEE_DB_PORT: "5432"
      SYNAPSEE_DB_NAME: mydb
      SYNAPSEE_DB_USER: myuser
      SYNAPSEE_DB_PASSWORD: secret
    extra_hosts:
      - "host.docker.internal:host-gateway"
`,
      status: {
        edgeStatus: record.edgeStatus,
        edgeLastSeen: record.edgeLastSeen,
        edgeVersion: record.edgeVersion,
        online: app.edge.isOnline(record.id),
      },
    };
  });

  app.delete<{ Params: { id: string; tokenId: string } }>(
    "/projects/:id/edge-tokens/:tokenId",
    async (req, reply) => {
      const record = app.store.get(req.params.id);
      if (!record) return reply.code(404).send({ error: "Projeto não encontrado" });
      const ok = app.store.revokeEdgeToken(record.id, req.params.tokenId);
      if (!ok) return reply.code(404).send({ error: "Token não encontrado ou já revogado" });
      return { ok: true };
    },
  );
};
