import type { FastifyPluginAsync } from "fastify";
import { requireAuth, tenantIdOf } from "../auth/access.js";

export const metricsRoutes: FastifyPluginAsync = async (app) => {
  app.get("/metrics", async (req, reply) => {
    const auth = requireAuth(req, reply);
    if (!auth) return;
    // Platform: global metrics. Tenant: scoped to its projects only.
    if (auth.type === "platform") {
      return app.store.getMetrics();
    }
    const tenantId = tenantIdOf(auth)!;
    const projects = app.store.listForTenant(tenantId).map((r) => ({
      id: r.id,
      createdAt: r.createdAt,
      activeCapabilities: app.store.getActiveCapabilities(r),
    }));
    // Reuse store metrics helper via temporary filter — compute from list.
    const all = app.store.getMetrics();
    const projectIds = new Set(projects.map((p) => p.id));
    return {
      ...all,
      projectsTotal: projects.length,
      projectsWithActiveCapabilities: projects.filter(
        (p) => p.activeCapabilities.length > 0,
      ).length,
      // Keep event-derived fields but note they may include legacy noise;
      // full tenant-scoped events land when product_events gain tenant_id.
      note:
        projectIds.size === 0
          ? "Nenhum projeto neste tenant"
          : undefined,
    };
  });
};
