import type { FastifyPluginAsync } from "fastify";
import type { SchemaSnapshot } from "@synapse/core";
import {
  assertSafeIdentifier,
  buildOpenApiSpec,
  findResource,
} from "@synapse/core";
import {
  ensureProjectSchema,
  getProjectRowById,
  insertProjectRow,
  listProjectRows,
} from "../edge/dataAccess.js";
import { EdgeOfflineError } from "../edge/gateway.js";

export const generatedRoutes: FastifyPluginAsync = async (app) => {
  app.get<{ Params: { projectId: string } }>(
    "/p/:projectId/openapi.json",
    async (req, reply) => {
      const record = app.store.get(req.params.projectId);
      if (!record) return reply.code(404).send({ error: "Projeto não encontrado" });
      try {
        const publicProject = app.store.toPublic(record);
        const snap = await ensureProjectSchema(app.store, app.edge, record);
        return buildOpenApiSpec(record.id, snap, publicProject.exposedResources);
      } catch (err) {
        if (err instanceof EdgeOfflineError) {
          return reply.code(503).send({ error: err.message });
        }
        const message = err instanceof Error ? err.message : "erro";
        return reply.code(502).send({ error: message });
      }
    },
  );

  app.get<{
    Params: { projectId: string; resource: string };
    Querystring: { limit?: string; offset?: string };
  }>("/p/:projectId/:resource", async (req, reply) => {
    const record = app.store.get(req.params.projectId);
    if (!record) return reply.code(404).send({ error: "Projeto não encontrado" });

    try {
      assertSafeIdentifier(req.params.resource);
    } catch {
      return reply.code(400).send({ error: "Nome de recurso inválido" });
    }

    const publicProject = app.store.toPublic(record);
    if (!publicProject.exposedResources.includes(req.params.resource)) {
      return reply.code(403).send({ error: "Recurso não exposto" });
    }

    try {
      const snap = await ensureProjectSchema(app.store, app.edge, record);
      const meta = findResource(snap, req.params.resource);
      if (!meta) return reply.code(404).send({ error: "Recurso não encontrado no schema" });

      const limit = Math.min(Number(req.query.limit ?? 20) || 20, 100);
      const offset = Math.max(Number(req.query.offset ?? 0) || 0, 0);

      return await listProjectRows(app.store, app.edge, record, meta, { limit, offset });
    } catch (err) {
      if (err instanceof EdgeOfflineError) {
        return reply.code(503).send({ error: err.message });
      }
      const message = err instanceof Error ? err.message : "erro";
      return reply.code(502).send({ error: message });
    }
  });

  app.get<{
    Params: { projectId: string; resource: string; id: string };
  }>("/p/:projectId/:resource/:id", async (req, reply) => {
    const record = app.store.get(req.params.projectId);
    if (!record) return reply.code(404).send({ error: "Projeto não encontrado" });

    const publicProject = app.store.toPublic(record);
    if (!publicProject.exposedResources.includes(req.params.resource)) {
      return reply.code(403).send({ error: "Recurso não exposto" });
    }

    try {
      const snap = await ensureProjectSchema(app.store, app.edge, record);
      const meta = findResource(snap, req.params.resource);
      if (!meta) return reply.code(404).send({ error: "Recurso não encontrado no schema" });

      const row = await getProjectRowById(
        app.store,
        app.edge,
        record,
        meta,
        req.params.id,
      );
      if (!row) return reply.code(404).send({ error: "Registro não encontrado" });
      return row;
    } catch (err) {
      if (err instanceof EdgeOfflineError) {
        return reply.code(503).send({ error: err.message });
      }
      const message = err instanceof Error ? err.message : "erro";
      return reply.code(502).send({ error: message });
    }
  });

  app.post<{
    Params: { projectId: string; resource: string };
  }>("/p/:projectId/:resource", async (req, reply) => {
    const record = app.store.get(req.params.projectId);
    if (!record) return reply.code(404).send({ error: "Projeto não encontrado" });

    const publicProject = app.store.toPublic(record);
    if (!publicProject.exposedResources.includes(req.params.resource)) {
      return reply.code(403).send({ error: "Recurso não exposto" });
    }
    if (publicProject.readOnly) {
      return reply.code(403).send({ error: "Projeto em modo somente leitura" });
    }

    if (!req.body || typeof req.body !== "object") {
      return reply.code(400).send({ error: "Body JSON obrigatório" });
    }

    try {
      const snap: SchemaSnapshot = await ensureProjectSchema(app.store, app.edge, record);
      const meta = findResource(snap, req.params.resource);
      if (!meta) return reply.code(404).send({ error: "Recurso não encontrado no schema" });

      const created = await insertProjectRow(
        app.store,
        app.edge,
        record,
        meta,
        req.body as Record<string, unknown>,
      );
      return reply.code(201).send(created);
    } catch (err) {
      if (err instanceof EdgeOfflineError) {
        return reply.code(503).send({ error: err.message });
      }
      const message = err instanceof Error ? err.message : "erro";
      return reply.code(502).send({ error: message });
    }
  });
};
