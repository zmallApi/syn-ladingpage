import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import {
  analyzeCapabilities,
  bindTemplate,
  canonicalizeRole,
  getTemplate,
  normalizeCapabilityIds,
  requiredExposedResources,
  resolveCapabilityId,
  type RoleOverrides,
} from "@synapse/core";
import {
  ensureProjectSchema,
  getProjectRowById,
  listProjectRows,
} from "../edge/dataAccess.js";
import { EdgeOfflineError } from "../edge/gateway.js";

const putCapabilitiesBody = z.object({
  capabilityIds: z.array(z.string().min(1)),
});

const putOverridesBody = z.object({
  overrides: z.record(z.string().min(1)),
});

const previewBody = z.object({
  args: z.record(z.unknown()).optional(),
});

export const capabilitiesRoutes: FastifyPluginAsync = async (app) => {
  function overridesOf(record: NonNullable<ReturnType<typeof app.store.get>>): RoleOverrides {
    return app.store.getRoleOverrides(record) as RoleOverrides;
  }

  async function withSchema(record: NonNullable<ReturnType<typeof app.store.get>>) {
    return ensureProjectSchema(app.store, app.edge, record);
  }

  app.get<{ Params: { id: string } }>(
    "/projects/:id/capabilities/analyze",
    async (req, reply) => {
      const record = app.store.get(req.params.id);
      if (!record) return reply.code(404).send({ error: "Projeto não encontrado" });

      try {
        const snap = await withSchema(record);
        const roleOverrides = overridesOf(record);
        const publicProject = app.store.toPublic(record);
        const result = await analyzeCapabilities(snap, {
          roleOverrides,
          exposedResources: publicProject.exposedResources,
        });
        app.store.setBusinessProfile(record.id, {
          profile: result.profile,
          analyzedAt: new Date().toISOString(),
          llmUsed: result.llmUsed,
        });

        return {
          ...result,
          activeCapabilities: publicProject.activeCapabilities,
          exposedResources: publicProject.exposedResources,
          roleOverrides: publicProject.roleOverrides,
        };
      } catch (err) {
        if (err instanceof EdgeOfflineError) {
          return reply.code(503).send({ error: err.message });
        }
        const message = err instanceof Error ? err.message : "Falha na análise";
        return reply.code(502).send({ error: message });
      }
    },
  );

  app.get<{ Params: { id: string } }>(
    "/projects/:id/capabilities",
    async (req, reply) => {
      const record = app.store.get(req.params.id);
      if (!record) return reply.code(404).send({ error: "Projeto não encontrado" });

      try {
        const snap = await withSchema(record);
        const roleOverrides = overridesOf(record);
        const publicProject = app.store.toPublic(record);
        const analysis = await analyzeCapabilities(snap, {
          useLlm: false,
          roleOverrides,
          exposedResources: publicProject.exposedResources,
        });

        return {
          activeCapabilities: publicProject.activeCapabilities,
          roleOverrides: publicProject.roleOverrides,
          suggestions: analysis.suggestions,
          profile: analysis.profile,
        };
      } catch (err) {
        if (err instanceof EdgeOfflineError) {
          return reply.code(503).send({ error: err.message });
        }
        const message = err instanceof Error ? err.message : "erro";
        return reply.code(502).send({ error: message });
      }
    },
  );

  app.get<{ Params: { id: string } }>(
    "/projects/:id/role-overrides",
    async (req, reply) => {
      const record = app.store.get(req.params.id);
      if (!record) return reply.code(404).send({ error: "Projeto não encontrado" });
      return { overrides: app.store.toPublic(record).roleOverrides };
    },
  );

  app.put<{ Params: { id: string } }>(
    "/projects/:id/role-overrides",
    async (req, reply) => {
      const record = app.store.get(req.params.id);
      if (!record) return reply.code(404).send({ error: "Projeto não encontrado" });

      const parsed = putOverridesBody.safeParse(req.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: parsed.error.flatten() });
      }

      try {
        const snap = await withSchema(record);
        const resourceNames = new Set(snap.resources.map((r) => r.name));

        const cleaned: Record<string, string> = {};
        for (const [resource, roleRaw] of Object.entries(parsed.data.overrides)) {
          if (!resourceNames.has(resource)) {
            return reply.code(400).send({
              error: `Recurso desconhecido no schema: ${resource}`,
            });
          }
          const role = canonicalizeRole(roleRaw);
          if (role === "unknown" && roleRaw !== "unknown") {
            return reply.code(400).send({ error: `Papel inválido: ${roleRaw}` });
          }
          cleaned[resource] = role;
        }

        const previous = app.store.getRoleOverrides(record);
        const updated = app.store.setRoleOverrides(record.id, cleaned);
        const publicProject = app.store.toPublic(updated!);
        const analysis = await analyzeCapabilities(snap, {
          useLlm: false,
          roleOverrides: cleaned as RoleOverrides,
          exposedResources: publicProject.exposedResources,
        });
        app.store.setBusinessProfile(record.id, {
          profile: analysis.profile,
          analyzedAt: new Date().toISOString(),
          llmUsed: false,
        });

        const changedKeys = Object.keys(cleaned).filter(
          (k) => previous[k] !== cleaned[k],
        );
        const removedKeys = Object.keys(previous).filter((k) => !(k in cleaned));
        if (changedKeys.length || removedKeys.length) {
          app.store.recordEvent(record.id, "role_override", {
            changed: changedKeys.length + removedKeys.length,
            resources: [...changedKeys, ...removedKeys],
          });
        }

        return {
          project: publicProject,
          profile: analysis.profile,
          suggestions: analysis.suggestions,
        };
      } catch (err) {
        if (err instanceof EdgeOfflineError) {
          return reply.code(503).send({ error: err.message });
        }
        const message = err instanceof Error ? err.message : "erro";
        return reply.code(502).send({ error: message });
      }
    },
  );

  app.put<{ Params: { id: string } }>(
    "/projects/:id/capabilities",
    async (req, reply) => {
      const record = app.store.get(req.params.id);
      if (!record) return reply.code(404).send({ error: "Projeto não encontrado" });

      const parsed = putCapabilitiesBody.safeParse(req.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: parsed.error.flatten() });
      }

      const publicProject = app.store.toPublic(record);
      if (!publicProject.exposedResources.length) {
        return reply.code(400).send({
          error: "Exponha ao menos um recurso antes de ativar capacidades",
        });
      }

      try {
        const snap = await withSchema(record);
        const roleOverrides = overridesOf(record);
        const analysis = await analyzeCapabilities(snap, {
          useLlm: false,
          roleOverrides,
          exposedResources: publicProject.exposedResources,
        });
        const available = new Map(
          analysis.suggestions.filter((s) => s.available).map((s) => [s.id, s]),
        );

        const invalid: string[] = [];
        const missingByCap: string[] = [];
        const valid: string[] = [];
        for (const rawId of normalizeCapabilityIds(parsed.data.capabilityIds)) {
          const id = resolveCapabilityId(rawId);
          const tpl = getTemplate(id);
          const suggestion = available.get(id);
          if (!tpl || !suggestion) {
            const anySug = analysis.suggestions.find((s) => s.id === id);
            if (anySug && !anySug.available && anySug.reason) {
              missingByCap.push(`${id}: ${anySug.reason}`);
            } else {
              invalid.push(rawId);
            }
            continue;
          }
          const bindings = bindTemplate(tpl, snap, analysis.profile.resourceRoles);
          if (!bindings) {
            invalid.push(rawId);
            continue;
          }
          if (tpl.id !== "explain_business_model") {
            const needed = requiredExposedResources(
              tpl,
              bindings,
              analysis.profile.resourceRoles,
            );
            const missingExposed = needed.filter(
              (r) => !publicProject.exposedResources.includes(r),
            );
            if (missingExposed.length) {
              missingByCap.push(`${id}: exponha ${missingExposed.join(", ")}`);
              continue;
            }
          }
          valid.push(id);
        }

        if (invalid.length || missingByCap.length) {
          const parts = [
            ...missingByCap,
            ...(invalid.length
              ? [`inválidas: ${invalid.join(", ")}`]
              : []),
          ];
          return reply.code(400).send({
            error: `Não foi possível ativar — ${parts.join("; ")}`,
          });
        }

        const previous = app.store.getActiveCapabilities(record);
        const nextIds = normalizeCapabilityIds(valid);
        const updated = app.store.setActiveCapabilities(record.id, nextIds);
        const added = nextIds.filter((id) => !previous.includes(id));
        if (added.length || (previous.length === 0 && nextIds.length > 0)) {
          app.store.recordEvent(record.id, "capability_activated", {
            capabilityIds: nextIds,
            added,
          });
        }
        return app.store.toPublic(updated!);
      } catch (err) {
        if (err instanceof EdgeOfflineError) {
          return reply.code(503).send({ error: err.message });
        }
        const message = err instanceof Error ? err.message : "erro";
        return reply.code(502).send({ error: message });
      }
    },
  );

  app.post<{ Params: { id: string; capId: string } }>(
    "/projects/:id/capabilities/:capId/preview",
    async (req, reply) => {
      const record = app.store.get(req.params.id);
      if (!record) return reply.code(404).send({ error: "Projeto não encontrado" });

      const parsed = previewBody.safeParse(req.body ?? {});
      if (!parsed.success) {
        return reply.code(400).send({ error: parsed.error.flatten() });
      }

      const publicProject = app.store.toPublic(record);
      if (!publicProject.exposedResources.length) {
        return reply.code(400).send({
          error: "Exponha recursos antes de pré-visualizar",
        });
      }

      const capId = resolveCapabilityId(req.params.capId);
      const tpl = getTemplate(capId);
      if (!tpl) return reply.code(404).send({ error: `Capacidade desconhecida: ${capId}` });

      try {
        const snap = await withSchema(record);
        const roleOverrides = overridesOf(record);
        const analysis = await analyzeCapabilities(snap, {
          useLlm: false,
          roleOverrides,
          exposedResources: publicProject.exposedResources,
        });
        const bindings = bindTemplate(tpl, snap, analysis.profile.resourceRoles);
        if (!bindings && tpl.id !== "explain_business_model") {
          return reply.code(400).send({
            error: "Capacidade não disponível para este schema",
          });
        }

        const args = { ...(parsed.data.args ?? {}) };
        if (tpl.id === "search_parties" && args.query == null) args.query = "a";
        if (tpl.id === "list_at_risk" && args.limit == null) args.limit = 5;
        if (tpl.id === "attention_queue" && args.limit == null) args.limit = 5;
        if (tpl.id === "location_health" && args.limit == null) args.limit = 5;
        if (tpl.id === "overdue_ledger" && args.limit == null) args.limit = 5;
        if (tpl.id === "survey_overview" && args.limit == null) args.limit = 5;
        if (tpl.id === "risk_series" && args.limit == null) args.limit = 5;
        if (tpl.id === "find_open_orders" && args.limit == null) args.limit = 5;
        if (tpl.id === "recent_events" && args.limit == null) args.limit = 5;
        if (
          (tpl.id === "party_summary" ||
            tpl.id === "party_360" ||
            tpl.id === "recent_events" ||
            tpl.id === "location_summary") &&
          args.partyId == null &&
          args.locationId == null
        ) {
          const resourceName =
            bindings?.party || bindings?.location || bindings?.member;
          if (resourceName && publicProject.exposedResources.includes(resourceName)) {
            const meta = snap.resources.find((r) => r.name === resourceName);
            if (meta) {
              const sample = await listProjectRows(app.store, app.edge, record, meta, {
                limit: 1,
                offset: 0,
              });
              const first = sample[0] as Record<string, unknown> | undefined;
              const pk = meta.primaryKey?.[0] ?? "id";
              if (first && first[pk] != null) {
                if (tpl.id === "location_summary") args.locationId = String(first[pk]);
                else args.partyId = String(first[pk]);
              }
            }
          }
        }

        const result = await tpl.run(
          {
            schema: snap,
            exposedResources: publicProject.exposedResources,
            bindings: bindings ?? {},
            list: (resource, opts) =>
              listProjectRows(app.store, app.edge, record, resource, opts),
            getById: (resource, id) =>
              getProjectRowById(app.store, app.edge, record, resource, String(id)),
          },
          args,
        );

        app.store.recordEvent(record.id, "cap_preview", {
          capabilityId: tpl.id,
        });

        return {
          capabilityId: tpl.id,
          args,
          result,
          truncated: true,
        };
      } catch (err) {
        if (err instanceof EdgeOfflineError) {
          return reply.code(503).send({ error: err.message });
        }
        const message = err instanceof Error ? err.message : "Falha no preview";
        return reply.code(502).send({ error: message });
      }
    },
  );
};
