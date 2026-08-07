import type { FastifyPluginAsync } from "fastify";
import { loadAccessibleProject } from "../auth/access.js";
import { z } from "zod";
import {
  buildDiscoveryContext,
  buildRefineContext,
  buildImpactContext,
  buildPlanContext,
  buildExecuteContext,
  createClickUpProjection,
  createConfluenceProjection,
  createGitHubProjection,
  KnowledgeBuilder,
  entityId,
  linkTasksToCode,
  watermarkFromFacts,
  type CanonicalEntity,
  type CanonicalFact,
  type LlmProvider,
  type ProjectionKind,
} from "@synapse/core";
import { EdgeOfflineError } from "../edge/gateway.js";
import { resolveProjectLlmProvider } from "../llmProvider.js";

const syncBody = z.object({
  kind: z.enum(["github", "clickup", "confluence"]),
  /** Dev/cloud fallback: run projection in API process using this token (never persisted). */
  token: z.string().min(1).optional(),
  /** Confluence Cloud: account email for Basic auth */
  email: z.string().email().optional(),
  /** Confluence: wiki base URL e.g. https://acme.atlassian.net/wiki */
  baseUrl: z.string().url().optional(),
  scopes: z.array(z.string()).optional(),
  maxFacts: z.number().int().positive().max(20_000).optional(),
  /** Force full rescan (clears watermark). Default: incremental from last cursor. */
  full: z.boolean().optional(),
});

const discoverBody = z.object({
  taskRef: z.string().min(1),
});

const sourcesBody = z.object({
  sources: z.array(
    z.object({
      kind: z.enum(["github", "clickup", "confluence"]),
      enabled: z.boolean(),
      scopes: z.array(z.string()).optional(),
    }),
  ),
});

const linkStatusBody = z.object({
  fromId: z.string().min(1),
  toId: z.string().min(1),
  rel: z.enum(["implements", "related_to"]).default("implements"),
});

const enrichBody = z.object({
  limit: z.number().int().positive().max(100).optional(),
});

const enrichmentStatusBody = z.object({
  id: z.string().min(1),
});

async function runEngineeringEnrich(
  knowledge: {
    bindForProject: (id: string) => {
      listByType: (type: string, limit?: number) => CanonicalEntity[];
      listAll: (limit?: number) => CanonicalEntity[];
      enrichments: import("@synapse/core").EnrichmentPort;
    };
  },
  projectId: string,
  limit = 40,
  provider?: LlmProvider,
) {
  const kl = knowledge.bindForProject(projectId);
  const repoLimit = Math.min(10, limit);
  const subjects = [
    ...kl.listByType("Repository", repoLimit),
    ...kl.listByType("Module", limit),
    ...kl.listByType("Service", Math.min(20, limit)),
    ...kl.listByType("API", Math.min(20, limit)),
  ];
  const builder = new KnowledgeBuilder(kl.enrichments, {
    limit: subjects.length,
    provider,
  });
  return builder.enrichEngineeringSubjects(subjects);
}

function promoteEntityRole(
  knowledge: {
    upsertFacts: (id: string, facts: CanonicalFact[]) => unknown;
    bindForProject: (id: string) => { get: (id: string) => CanonicalEntity | null };
  },
  projectId: string,
  enrichment: {
    subjectId: string;
    payload: Record<string, unknown>;
  },
) {
  const proposedType = enrichment.payload.proposedType;
  if (proposedType !== "Service" && proposedType !== "API") return null;
  const source = knowledge.bindForProject(projectId).get(enrichment.subjectId);
  if (!source) return null;
  const externalId = `${source.externalId}:${String(proposedType).toLowerCase()}`;
  const entity: CanonicalEntity = {
    id: entityId("inferred", proposedType, externalId),
    type: proposedType,
    source: "inferred",
    externalId,
    title: String(enrichment.payload.label ?? source.title),
    text: source.text,
    url: source.url,
    updatedAt: new Date().toISOString(),
    payload: {
      fromSubjectId: source.id,
      enrichmentPromoted: true,
    },
  };
  knowledge.upsertFacts(projectId, [{ kind: "entity", entity }]);
  return entity;
}

async function collectLocal(
  kind: ProjectionKind,
  token: string,
  scopes: string[] | undefined,
  maxFacts: number,
  cursor: string | null,
  extra?: { email?: string; baseUrl?: string },
): Promise<CanonicalFact[]> {
  const projection =
    kind === "github"
      ? createGitHubProjection({ token, repos: scopes })
      : kind === "clickup"
        ? createClickUpProjection({ token, spaceIds: scopes })
        : createConfluenceProjection({
            token,
            email:
              extra?.email ??
              process.env.SYNAPSEE_CONFLUENCE_EMAIL ??
              "",
            baseUrl:
              extra?.baseUrl ??
              process.env.SYNAPSEE_CONFLUENCE_BASE_URL ??
              "",
            spaceKeys: scopes,
          });
  const facts: CanonicalFact[] = [];
  for await (const fact of projection.project(cursor)) {
    facts.push(fact);
    if (facts.length >= maxFacts) break;
  }
  return facts;
}

function relinkProject(
  knowledge: {
    bindForProject: (id: string) => { listAll: (n: number) => unknown[] };
    listRejectedKeys: (id: string) => Set<string>;
    deleteEdgesByRel: (id: string, rels: string[]) => number;
    upsertEdges: (id: string, edges: ReturnType<typeof linkTasksToCode>) => void;
  },
  id: string,
) {
  const entities = knowledge.bindForProject(id).listAll(10_000) as Parameters<
    typeof linkTasksToCode
  >[0];
  const rejectKeys = knowledge.listRejectedKeys(id);
  const links = linkTasksToCode(entities, { rejectKeys });
  const cleared = knowledge.deleteEdgesByRel(id, ["implements", "related_to"]);
  knowledge.upsertEdges(id, links);
  return { linked: links.length, cleared };
}

export const knowledgeRoutes: FastifyPluginAsync = async (app) => {
  app.get("/projects/:id/knowledge/stats", async (req, reply) => {
    const { id } = req.params as { id: string };
    const project = loadAccessibleProject(app.store, req.auth, id, reply);
    if (!project) return;
    const stats = app.store.knowledge.stats(id);
    const sync = app.store.knowledge.listSyncStates(id);
    return {
      vertical: project.vertical,
      knowledgeSources: app.store.getKnowledgeSources(project),
      ...stats,
      sync,
    };
  });

  app.put("/projects/:id/knowledge/sources", async (req, reply) => {
    const { id } = req.params as { id: string };
    const project = loadAccessibleProject(app.store, req.auth, id, reply);
    if (!project) return;
    const parsed = sourcesBody.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.flatten() });
    }
    const updated = app.store.setKnowledgeSources(id, parsed.data.sources);
    return app.store.toPublic(updated!);
  });

  app.post("/projects/:id/knowledge/sync", async (req, reply) => {
    const { id } = req.params as { id: string };
    const project = loadAccessibleProject(app.store, req.auth, id, reply);
    if (!project) return;
    if (project.vertical !== "engineering") {
      return reply
        .code(400)
        .send({ error: "Knowledge sync is for engineering vertical projects" });
    }

    const parsed = syncBody.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.flatten() });
    }

    const { kind, token, maxFacts = 5000, full = false, email, baseUrl } =
      parsed.data;
    const sources = app.store.getKnowledgeSources(project);
    const sourceCfg = sources.find((s) => s.kind === kind);
    const scopes = parsed.data.scopes ?? sourceCfg?.scopes;
    const prev = app.store.knowledge.getSyncState(id, kind);
    const cursor = full ? null : prev?.cursor ?? null;

    let facts: CanonicalFact[] = [];
    try {
      if (token) {
        facts = await collectLocal(kind, token, scopes, maxFacts, cursor, {
          email,
          baseUrl,
        });
      } else if (project.connectionMode === "edge") {
        if (!app.edge.isOnline(id)) {
          throw new EdgeOfflineError(id);
        }
        const result = (await app.edge.dispatch(
          id,
          "projection.syncPage",
          { kind, maxFacts, cursor },
          300_000,
        )) as { facts: CanonicalFact[]; count: number; nextCursor?: string | null };
        facts = result.facts ?? [];
      } else {
        return reply.code(400).send({
          error:
            "Provide token for cloud sync, or use Edge with SYNAPSEE_GITHUB_TOKEN / SYNAPSEE_CLICKUP_TOKEN",
        });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      app.store.knowledge.setSyncState(id, kind, {
        lastError: message,
        lastSyncAt: new Date().toISOString(),
      });
      if (err instanceof EdgeOfflineError) {
        return reply.code(503).send({ error: message });
      }
      return reply.code(502).send({ error: message });
    }

    const upserted = app.store.knowledge.upsertFacts(id, facts);
    const { linked } = relinkProject(app.store.knowledge, id);

    const watermark = watermarkFromFacts(facts);
    const nextCursor =
      watermark && (!cursor || Date.parse(watermark) > Date.parse(cursor))
        ? watermark
        : cursor;

    let enrich: Awaited<ReturnType<typeof runEngineeringEnrich>> | null = null;
    try {
      const provider = resolveProjectLlmProvider(app.store, project);
      enrich = await runEngineeringEnrich(
        app.store.knowledge,
        id,
        25,
        provider,
      );
    } catch {
      enrich = null;
    }

    const stats = app.store.knowledge.stats(id);
    app.store.knowledge.setSyncState(id, kind, {
      lastSyncAt: new Date().toISOString(),
      entityCount: stats.entities,
      edgeCount: stats.edges,
      lastError: null,
      cursor: nextCursor,
    });

    return {
      kind,
      upserted,
      linked,
      enrich,
      incremental: Boolean(cursor),
      cursor: nextCursor,
      stats,
    };
  });

  app.post("/projects/:id/knowledge/link", async (req, reply) => {
    const { id } = req.params as { id: string };
    const project = loadAccessibleProject(app.store, req.auth, id, reply);
    if (!project) return;
    const result = relinkProject(app.store.knowledge, id);
    return {
      ...result,
      stats: app.store.knowledge.stats(id),
    };
  });

  app.get("/projects/:id/knowledge/links", async (req, reply) => {
    const { id } = req.params as { id: string };
    const project = loadAccessibleProject(app.store, req.auth, id, reply);
    if (!project) return;
    const q = req.query as { status?: string; rel?: string; limit?: string };
    const status =
      q.status === "inferred" ||
      q.status === "confirmed" ||
      q.status === "rejected"
        ? q.status
        : undefined;
    const links = app.store.knowledge.listLinks(id, {
      status,
      rel: q.rel,
      limit: Number(q.limit ?? 50) || 50,
    });
    return { links };
  });

  app.post("/projects/:id/knowledge/links/confirm", async (req, reply) => {
    const { id } = req.params as { id: string };
    const project = loadAccessibleProject(app.store, req.auth, id, reply);
    if (!project) return;
    const parsed = linkStatusBody.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.flatten() });
    }
    const link = app.store.knowledge.setLinkStatus(
      id,
      parsed.data.fromId,
      parsed.data.toId,
      parsed.data.rel,
      "confirmed",
      { score: 1, evidence: { via: "human_confirm" } },
    );
    return { link };
  });

  app.post("/projects/:id/knowledge/links/reject", async (req, reply) => {
    const { id } = req.params as { id: string };
    const project = loadAccessibleProject(app.store, req.auth, id, reply);
    if (!project) return;
    const parsed = linkStatusBody.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.flatten() });
    }
    const link = app.store.knowledge.setLinkStatus(
      id,
      parsed.data.fromId,
      parsed.data.toId,
      parsed.data.rel,
      "rejected",
      { evidence: { via: "human_reject" } },
    );
    return { link };
  });

  app.post("/projects/:id/knowledge/enrich", async (req, reply) => {
    const { id } = req.params as { id: string };
    const project = loadAccessibleProject(app.store, req.auth, id, reply);
    if (!project) return;
    const parsed = enrichBody.safeParse(req.body ?? {});
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.flatten() });
    }
    const provider = resolveProjectLlmProvider(app.store, project);

    let result: Awaited<ReturnType<typeof runEngineeringEnrich>>;
    if (project.vertical === "engineering") {
      result = await runEngineeringEnrich(
        app.store.knowledge,
        id,
        parsed.data.limit ?? 40,
        provider,
      );
    } else {
      const profileJson = project.businessProfileJson;
      let profile: import("@synapse/core").BusinessProfile | null = null;
      if (profileJson) {
        try {
          const parsedProfile = JSON.parse(profileJson) as {
            profile?: import("@synapse/core").BusinessProfile;
          };
          profile = parsedProfile.profile ?? null;
        } catch {
          profile = null;
        }
      }
      if (!profile) {
        return reply.code(400).send({
          error:
            "Rode Analisar negócio antes de enriquecer a Knowledge Layer business",
        });
      }
      const { ensureProjectSchema } = await import("../edge/dataAccess.js");
      const snap = await ensureProjectSchema(app.store, app.edge, project);
      const builder = new KnowledgeBuilder(
        app.store.knowledge.bindEnrichments(id),
        { provider },
      );
      result = builder.enrichBusinessProfile(id, profile, snap, {
        provider: provider.name,
        model: provider.model,
      });
    }

    app.store.recordEvent(id, "cap_preview", {
      capabilityId: "knowledge_builder",
      stage: "enrich",
      llmCalls: result.llmCalls,
      created: result.created,
      skipped: result.skipped,
      llmAvailable: provider.isAvailable(),
      llmProvider: provider.name,
      llmModel: provider.model,
    });

    const llmUsed = result.llmCalls > 0;
    let llmNote: string;
    if (llmUsed) {
      llmNote = `API da LLM usada (${result.llmCalls} chamada${result.llmCalls === 1 ? "" : "s"} · ${provider.name}/${provider.model}).`;
    } else if (!provider.isAvailable()) {
      llmNote =
        "LLM não disponível: sem API key no projeto nem no .env — enrichments vieram de heurística.";
    } else if (result.created === 0 && result.skipped > 0) {
      llmNote =
        "LLM não chamada: já existem enrichments frescos (mesmo fingerprint). Nada novo a gerar.";
    } else {
      llmNote =
        "Provider configurado, mas a LLM não retornou JSON válido — caiu em heurística. Confira key/modelo/logs.";
    }

    return {
      ...result,
      llm: {
        used: llmUsed,
        calls: result.llmCalls,
        available: provider.isAvailable(),
        provider: provider.name,
        model: provider.model,
        note: llmNote,
      },
      stats: app.store.knowledge.stats(id),
    };
  });

  app.get("/projects/:id/knowledge/enrichments", async (req, reply) => {
    const { id } = req.params as { id: string };
    const project = loadAccessibleProject(app.store, req.auth, id, reply);
    if (!project) return;
    const q = req.query as { status?: string; kind?: string; limit?: string };
    const status =
      q.status === "proposed" ||
      q.status === "confirmed" ||
      q.status === "rejected"
        ? q.status
        : undefined;
    const enrichments = app.store.knowledge.listEnrichments(id, {
      status,
      kind: q.kind as
        | "entity_role"
        | "relationship"
        | "domain_tag"
        | "semantic_summary"
        | "risk_signal"
        | "module_map"
        | undefined,
      limit: Number(q.limit ?? 50) || 50,
    });
    return { enrichments };
  });

  app.post("/projects/:id/knowledge/enrichments/confirm", async (req, reply) => {
    const { id } = req.params as { id: string };
    const project = loadAccessibleProject(app.store, req.auth, id, reply);
    if (!project) return;
    const parsed = enrichmentStatusBody.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.flatten() });
    }
    const enrichment = app.store.knowledge.setEnrichmentStatus(
      id,
      parsed.data.id,
      "confirmed",
    );
    if (!enrichment) {
      return reply.code(404).send({ error: "Enrichment not found" });
    }
    let promoted: CanonicalEntity | null = null;
    if (enrichment.kind === "entity_role") {
      promoted = promoteEntityRole(app.store.knowledge, id, enrichment);
    }
    return { enrichment, promoted };
  });

  app.post("/projects/:id/knowledge/enrichments/reject", async (req, reply) => {
    const { id } = req.params as { id: string };
    const project = loadAccessibleProject(app.store, req.auth, id, reply);
    if (!project) return;
    const parsed = enrichmentStatusBody.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.flatten() });
    }
    const enrichment = app.store.knowledge.setEnrichmentStatus(
      id,
      parsed.data.id,
      "rejected",
    );
    if (!enrichment) {
      return reply.code(404).send({ error: "Enrichment not found" });
    }
    return { enrichment };
  });

  app.post("/projects/:id/knowledge/discover", async (req, reply) => {
    const { id } = req.params as { id: string };
    const project = loadAccessibleProject(app.store, req.auth, id, reply);
    if (!project) return;
    const parsed = discoverBody.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.flatten() });
    }

    const caps = app.store.getActiveCapabilities(project);
    if (
      project.vertical === "engineering" &&
      caps.length > 0 &&
      !caps.includes("eng_understand_story") &&
      !caps.includes("discover_story")
    ) {
      return reply.code(403).send({
        error:
          "Capability eng_understand_story (Understand) not active on this project",
      });
    }

    const kl = app.store.knowledge.bindForProject(id);
    const llmProvider = resolveProjectLlmProvider(app.store, project);
    const result = await buildDiscoveryContext(kl, parsed.data.taskRef, {
      llmProvider,
    });
    if ("error" in result) {
      return reply.code(404).send(result);
    }
    app.store.recordEvent(id, "cap_preview", {
      capabilityId: "eng_understand_story",
      stage: "understand",
      llmUsed: result.llmUsed,
      enrichmentsHit: result.enrichmentsHit ?? 0,
      llmCallsSaved: result.llmCallsSaved ?? false,
    });
    return result;
  });

  app.post("/projects/:id/knowledge/understand", async (req, reply) => {
    // Alias of /discover — Story OS Understand
    const { id } = req.params as { id: string };
    const project = loadAccessibleProject(app.store, req.auth, id, reply);
    if (!project) return;
    const parsed = discoverBody.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.flatten() });
    }
    const caps = app.store.getActiveCapabilities(project);
    if (
      project.vertical === "engineering" &&
      caps.length > 0 &&
      !caps.includes("eng_understand_story") &&
      !caps.includes("discover_story")
    ) {
      return reply.code(403).send({
        error:
          "Capability eng_understand_story (Understand) not active on this project",
      });
    }
    const kl = app.store.knowledge.bindForProject(id);
    const llmProvider = resolveProjectLlmProvider(app.store, project);
    const result = await buildDiscoveryContext(kl, parsed.data.taskRef, {
      llmProvider,
    });
    if ("error" in result) {
      return reply.code(404).send(result);
    }
    app.store.recordEvent(id, "cap_preview", {
      capabilityId: "eng_understand_story",
      stage: "understand",
      llmUsed: result.llmUsed,
      enrichmentsHit: result.enrichmentsHit ?? 0,
      llmCallsSaved: result.llmCallsSaved ?? false,
    });
    return result;
  });

  app.post("/projects/:id/knowledge/refine", async (req, reply) => {
    const { id } = req.params as { id: string };
    const project = loadAccessibleProject(app.store, req.auth, id, reply);
    if (!project) return;
    const parsed = discoverBody.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.flatten() });
    }
    const caps = app.store.getActiveCapabilities(project);
    if (
      project.vertical === "engineering" &&
      caps.length > 0 &&
      !caps.includes("eng_refine_story") &&
      !caps.includes("eng_understand_story") &&
      !caps.includes("discover_story")
    ) {
      return reply.code(403).send({
        error: "Capability eng_refine_story (Refine) not active on this project",
      });
    }
    const kl = app.store.knowledge.bindForProject(id);
    const result = await buildRefineContext(kl, parsed.data.taskRef);
    if ("error" in result) {
      return reply.code(404).send(result);
    }
    app.store.recordEvent(id, "cap_preview", {
      capabilityId: "eng_refine_story",
      stage: "refine",
      readyForImpact: result.readyForImpact,
      llmUsed: result.llmUsed,
    });
    return result;
  });

  app.post("/projects/:id/knowledge/impact", async (req, reply) => {
    const { id } = req.params as { id: string };
    const project = loadAccessibleProject(app.store, req.auth, id, reply);
    if (!project) return;
    const parsed = discoverBody.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.flatten() });
    }
    const caps = app.store.getActiveCapabilities(project);
    if (
      project.vertical === "engineering" &&
      caps.length > 0 &&
      !caps.includes("eng_impact_analysis") &&
      !caps.includes("eng_refine_story") &&
      !caps.includes("eng_understand_story") &&
      !caps.includes("discover_story")
    ) {
      return reply.code(403).send({
        error:
          "Capability eng_impact_analysis (Impact) not active on this project",
      });
    }
    const kl = app.store.knowledge.bindForProject(id);
    const result = await buildImpactContext(kl, parsed.data.taskRef);
    if ("error" in result) {
      return reply.code(404).send(result);
    }
    app.store.recordEvent(id, "cap_preview", {
      capabilityId: "eng_impact_analysis",
      stage: "impact",
      readyForPlan: result.readyForPlan,
      llmUsed: result.llmUsed,
    });
    return result;
  });

  app.post("/projects/:id/knowledge/plan", async (req, reply) => {
    const { id } = req.params as { id: string };
    const project = loadAccessibleProject(app.store, req.auth, id, reply);
    if (!project) return;
    const parsed = discoverBody.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.flatten() });
    }
    const caps = app.store.getActiveCapabilities(project);
    if (
      project.vertical === "engineering" &&
      caps.length > 0 &&
      !caps.includes("eng_implementation_plan") &&
      !caps.includes("eng_impact_analysis") &&
      !caps.includes("eng_refine_story") &&
      !caps.includes("eng_understand_story") &&
      !caps.includes("discover_story")
    ) {
      return reply.code(403).send({
        error:
          "Capability eng_implementation_plan (Plan) not active on this project",
      });
    }
    const kl = app.store.knowledge.bindForProject(id);
    const result = await buildPlanContext(kl, parsed.data.taskRef);
    if ("error" in result) {
      return reply.code(404).send(result);
    }
    app.store.recordEvent(id, "cap_preview", {
      capabilityId: "eng_implementation_plan",
      stage: "plan",
      readyForExecute: result.readyForExecute,
      workItemCount: result.workItems.length,
      llmUsed: result.llmUsed,
    });
    return result;
  });

  app.post("/projects/:id/knowledge/execute", async (req, reply) => {
    const { id } = req.params as { id: string };
    const project = loadAccessibleProject(app.store, req.auth, id, reply);
    if (!project) return;
    const parsed = discoverBody.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.flatten() });
    }
    const caps = app.store.getActiveCapabilities(project);
    if (
      project.vertical === "engineering" &&
      caps.length > 0 &&
      !caps.includes("eng_execute_context") &&
      !caps.includes("eng_implementation_plan") &&
      !caps.includes("eng_impact_analysis") &&
      !caps.includes("eng_refine_story") &&
      !caps.includes("eng_understand_story") &&
      !caps.includes("discover_story")
    ) {
      return reply.code(403).send({
        error:
          "Capability eng_execute_context (Execute) not active on this project",
      });
    }
    const kl = app.store.knowledge.bindForProject(id);
    const result = await buildExecuteContext(kl, parsed.data.taskRef);
    if ("error" in result) {
      return reply.code(404).send(result);
    }
    app.store.recordEvent(id, "cap_preview", {
      capabilityId: "eng_execute_context",
      stage: "execute",
      readyToImplement: result.readyToImplement,
      workItemCount: result.context.workItems.length,
      llmUsed: result.llmUsed,
    });
    return result;
  });

  app.get("/projects/:id/knowledge/facts", async (req, reply) => {
    const { id } = req.params as { id: string };
    const project = loadAccessibleProject(app.store, req.auth, id, reply);
    if (!project) return;
    const q = req.query as { type?: string; q?: string; limit?: string };
    const kl = app.store.knowledge.bindForProject(id);
    const limit = Number(q.limit ?? 50) || 50;
    if (q.q) return { facts: kl.searchFacts(q.q, limit) };
    if (q.type) return { facts: kl.listByType(q.type, limit) };
    return { facts: kl.listAll(limit), stats: app.store.knowledge.stats(id) };
  });
};
