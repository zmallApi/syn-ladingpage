import type { FastifyPluginAsync } from "fastify";
import { loadAccessibleProject } from "../auth/access.js";
import { z } from "zod";
import {
  analyzeCapabilities,
  bindTemplate,
  buildExecuteContext,
  buildImpactContext,
  getTemplate,
  listMissions,
  runMission,
} from "@synapse/core";
import {
  ensureProjectSchema,
  getProjectRowById,
  listProjectRows,
} from "../edge/dataAccess.js";
import { EdgeOfflineError } from "../edge/gateway.js";

const runBody = z.object({
  missionId: z.string().min(1),
  params: z.record(z.unknown()).optional(),
});

export const missionsRoutes: FastifyPluginAsync = async (app) => {
  app.get("/projects/:id/missions", async (req, reply) => {
    const { id } = req.params as { id: string };
    const project = loadAccessibleProject(app.store, req.auth, id, reply);
    if (!project) return;
    const publicProject = app.store.toPublic(project);
    return {
      missions: listMissions(publicProject.vertical),
      vertical: publicProject.vertical,
    };
  });

  app.get("/projects/:id/missions/runs", async (req, reply) => {
    const { id } = req.params as { id: string };
    const project = loadAccessibleProject(app.store, req.auth, id, reply);
    if (!project) return;
    const q = req.query as { limit?: string };
    const limit = Number(q.limit ?? 20) || 20;
    const runs = app.store.missions.list(id, limit).map((r) => ({
      id: r.id,
      missionId: r.missionId,
      ready: r.ready,
      createdAt: r.createdAt,
      capabilityTrace: JSON.parse(r.capabilityTraceJson) as string[],
      package: JSON.parse(r.packageJson) as unknown,
      params: JSON.parse(r.paramsJson) as unknown,
    }));
    return { runs };
  });

  app.get("/projects/:id/missions/runs/:runId", async (req, reply) => {
    const { id, runId } = req.params as { id: string; runId: string };
    const project = loadAccessibleProject(app.store, req.auth, id, reply);
    if (!project) return;
    const r = app.store.missions.get(id, runId);
    if (!r) return reply.code(404).send({ error: "Mission run not found" });
    return {
      id: r.id,
      missionId: r.missionId,
      ready: r.ready,
      createdAt: r.createdAt,
      capabilityTrace: JSON.parse(r.capabilityTraceJson) as string[],
      package: JSON.parse(r.packageJson) as unknown,
      params: JSON.parse(r.paramsJson) as unknown,
    };
  });

  app.delete("/projects/:id/missions/runs/:runId", async (req, reply) => {
    const { id, runId } = req.params as { id: string; runId: string };
    const project = loadAccessibleProject(app.store, req.auth, id, reply);
    if (!project) return;
    const ok = app.store.missions.delete(id, runId);
    if (!ok) return reply.code(404).send({ error: "Mission run not found" });
    return reply.code(204).send();
  });

  app.post("/projects/:id/missions/run", async (req, reply) => {
    const { id } = req.params as { id: string };
    const project = loadAccessibleProject(app.store, req.auth, id, reply);
    if (!project) return;
    try {
      app.store.tenants.assertCanRunMission(project.tenantId);
    } catch (err) {
      if (err instanceof Error && err.message === "QUOTA_MISSIONS") {
        return reply.code(402).send({
          error: "Limite de missões do mês atingido",
        });
      }
      throw err;
    }
    const parsed = runBody.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.flatten() });
    }

    const publicProject = app.store.toPublic(project);
    const params = (parsed.data.params ?? {}) as Record<string, unknown>;
    const kl = app.store.knowledge.bindForProject(id);

    try {
      const result = await runMission(parsed.data.missionId, params, {
        kl,
        projectId: id,
        resourceHints: publicProject.exposedResources,
        runImplementStory: async (taskRef) => {
          const r = await buildExecuteContext(kl, taskRef);
          return r;
        },
        runImpact: async (incidentRef) => {
          const r = await buildImpactContext(kl, incidentRef);
          return r;
        },
        runCapability: async (capabilityId, args) => {
          if (publicProject.vertical === "engineering") {
            throw new Error(
              `Capability ${capabilityId} requer projeto Business`,
            );
          }
          const snap = await ensureProjectSchema(app.store, app.edge, project);
          const template = getTemplate(capabilityId);
          if (!template) {
            throw new Error(`Capability desconhecida: ${capabilityId}`);
          }
          const roleOverrides = app.store.getRoleOverrides(project);
          const analysis = await analyzeCapabilities(snap, {
            useLlm: false,
            roleOverrides,
            exposedResources: publicProject.exposedResources,
            vertical:
              project.vertical === "engineering" ? "engineering" : "business",
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
            const human =
              template.id === "overdue_ledger"
                ? 'Não foi possível mapear a tabela financeira (ledger) no schema. Exponha títulos/financeiro e, em Capabilities → Corrigir papéis, marque como “ledger”.'
                : template.id === "attention_queue"
                  ? "Não foi possível montar a fila de atenção: falta mapear pessoas (party) com sinais de risco/atraso."
                  : `Capability ${capabilityId} sem vínculo no schema (papéis/campos insuficientes).`;
            throw new Error(human);
          }
          return template.run(
            {
              schema: snap,
              exposedResources: publicProject.exposedResources,
              bindings: bindings ?? {},
              list: (resource, opts) =>
                listProjectRows(app.store, app.edge, project, resource, opts),
              getById: (resource, rowId) =>
                getProjectRowById(
                  app.store,
                  app.edge,
                  project,
                  resource,
                  String(rowId),
                ),
            },
            args,
          );
        },
      });

      if ("error" in result) {
        return reply.code(400).send(result);
      }

      const saved = app.store.missions.save({
        projectId: id,
        missionId: result.missionId,
        params,
        package: result.package,
        capabilityTrace: result.capabilityTrace,
        ready: result.package.ready,
      });

      app.store.recordEvent(id, "mission_run", {
        missionId: result.missionId,
        runId: saved.id,
        ready: result.package.ready,
      });

      return {
        runId: saved.id,
        missionId: result.missionId,
        capabilityTrace: result.capabilityTrace,
        package: result.package,
        createdAt: saved.createdAt,
      };
    } catch (err) {
      if (err instanceof EdgeOfflineError) {
        return reply.code(503).send({ error: err.message });
      }
      const message = err instanceof Error ? err.message : "Falha na missão";
      return reply.code(502).send({ error: message });
    }
  });
};
