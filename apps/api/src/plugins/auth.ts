import type { FastifyPluginAsync } from "fastify";
import fp from "fastify-plugin";
import type { ProjectStore } from "@synapse/storage";
import { verifyJwt } from "../auth/jwt.js";
import type { AuthContext } from "../auth/access.js";

const PUBLIC_PATHS = new Set([
  "/health",
  "/auth/signup",
  "/auth/login",
  "/edge/ws",
  "/edge/version",
]);

const plugin: FastifyPluginAsync<{
  platformApiKey: string;
  jwtSecret: string;
  store: ProjectStore;
}> = async (app, opts) => {
  app.decorateRequest("auth", undefined);

  app.addHook("onRequest", async (req, reply) => {
    if (req.method === "OPTIONS") return;
    const path = req.url.split("?")[0] ?? "";
    if (PUBLIC_PATHS.has(path)) return;

    const bearer = req.headers.authorization;
    if (typeof bearer === "string" && bearer.startsWith("Bearer ")) {
      const token = bearer.slice(7).trim();
      const payload = verifyJwt(token, opts.jwtSecret);
      if (!payload) {
        return reply.code(401).send({ error: "Token JWT inválido ou expirado" });
      }
      const membership = opts.store.tenants.getMembership(
        payload.sub,
        payload.tenantId,
      );
      if (!membership) {
        return reply.code(401).send({ error: "Membership inválida" });
      }
      const auth: AuthContext = {
        type: "user",
        userId: payload.sub,
        tenantId: payload.tenantId,
        role: membership.role,
        email: payload.email,
      };
      req.auth = auth;
      return;
    }

    const keyHeader = req.headers["x-api-key"];
    const key = typeof keyHeader === "string" ? keyHeader : undefined;
    if (!key) {
      return reply
        .code(401)
        .send({ error: "API key ou Bearer token ausente" });
    }

    if (key === opts.platformApiKey) {
      req.auth = { type: "platform" };
      return;
    }

    if (key.startsWith("syn_tk_")) {
      const resolved = opts.store.tenants.resolveApiKey(key);
      if (!resolved) {
        return reply.code(401).send({ error: "API key inválida ou revogada" });
      }
      const tenant = opts.store.tenants.getTenant(resolved.tenantId);
      if (!tenant || tenant.status !== "active") {
        return reply.code(401).send({ error: "Tenant inativo" });
      }
      req.auth = {
        type: "tenant_key",
        tenantId: resolved.tenantId,
        keyId: resolved.keyId,
      };
      return;
    }

    if (key.startsWith("syn_mcp_")) {
      const resolved = opts.store.resolveMcpKey(key);
      if (!resolved) {
        return reply.code(401).send({ error: "API key inválida ou revogada" });
      }
      const tenant = opts.store.tenants.getTenant(resolved.tenantId);
      if (!tenant || tenant.status !== "active") {
        return reply.code(401).send({ error: "Tenant inativo" });
      }
      req.auth = {
        type: "mcp_key",
        tenantId: resolved.tenantId,
        projectId: resolved.projectId,
        keyId: resolved.keyId,
      };
      return;
    }

    return reply
      .code(401)
      .send({ error: "API key inválida ou ausente (header X-API-Key)" });
  });
};

/** Break encapsulation so the hook applies to sibling routes. */
export const authPlugin = fp(plugin, { name: "synapsee-auth" });

/** @deprecated use authPlugin */
export const apiKeyPlugin = authPlugin;
