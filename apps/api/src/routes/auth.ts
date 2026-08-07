import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { LEGACY_TENANT_ID, verifyPassword } from "@synapse/storage";
import { signJwt } from "../auth/jwt.js";
import {
  canManageTenant,
  requireAuth,
  tenantIdOf,
} from "../auth/access.js";

const signupBody = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  companyName: z.string().min(1).max(120),
  name: z.string().min(1).max(120).optional(),
});

const loginBody = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const createKeyBody = z.object({
  name: z.string().min(1).max(80).optional(),
});

export const authRoutes: FastifyPluginAsync<{ jwtSecret: string }> = async (
  app,
  opts,
) => {
  app.post("/auth/signup", async (req, reply) => {
    const parsed = signupBody.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.flatten() });
    }
    try {
      const created = app.store.tenants.createTenantWithOwner({
        email: parsed.data.email,
        password: parsed.data.password,
        companyName: parsed.data.companyName,
        userName: parsed.data.name,
      });
      const token = signJwt(
        {
          sub: created.user.id,
          email: created.user.email,
          tenantId: created.tenant.id,
          role: created.membership.role,
        },
        opts.jwtSecret,
      );
      return reply.code(201).send({
        token,
        user: {
          id: created.user.id,
          email: created.user.email,
          name: created.user.name,
        },
        tenant: {
          id: created.tenant.id,
          name: created.tenant.name,
          slug: created.tenant.slug,
          plan: created.tenant.plan,
        },
        membership: { role: created.membership.role },
        apiKey: {
          id: created.apiKey.id,
          token: created.apiKey.token,
          prefix: created.apiKey.prefix,
          name: created.apiKey.name,
          warning: "Guarde esta API key agora — ela não será mostrada novamente.",
        },
        usage: app.store.tenants.getUsage(created.tenant.id),
      });
    } catch (err) {
      if (err instanceof Error && err.message === "EMAIL_TAKEN") {
        return reply.code(409).send({ error: "E-mail já cadastrado" });
      }
      throw err;
    }
  });

  app.post("/auth/login", async (req, reply) => {
    const parsed = loginBody.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.flatten() });
    }
    const user = app.store.tenants.getUserByEmail(parsed.data.email);
    if (!user || !verifyPassword(parsed.data.password, user.passwordHash)) {
      return reply.code(401).send({ error: "E-mail ou senha inválidos" });
    }
    const membership = app.store.tenants.getPrimaryMembership(user.id);
    if (!membership) {
      return reply.code(403).send({ error: "Usuário sem tenant" });
    }
    const tenant = app.store.tenants.getTenant(membership.tenantId);
    if (!tenant || tenant.status !== "active") {
      return reply.code(403).send({ error: "Tenant inativo" });
    }
    const token = signJwt(
      {
        sub: user.id,
        email: user.email,
        tenantId: membership.tenantId,
        role: membership.role,
      },
      opts.jwtSecret,
    );
    return {
      token,
      user: { id: user.id, email: user.email, name: user.name },
      tenant: {
        id: tenant.id,
        name: tenant.name,
        slug: tenant.slug,
        plan: tenant.plan,
      },
      membership: { role: membership.role },
      usage: app.store.tenants.getUsage(tenant.id),
    };
  });

  app.get("/auth/me", async (req, reply) => {
    const auth = requireAuth(req, reply);
    if (!auth) return;

    if (auth.type === "platform") {
      return {
        authType: "platform",
        tenant: {
          id: LEGACY_TENANT_ID,
          name: "Platform / Ops",
          slug: "platform",
          plan: "enterprise",
        },
        usage: app.store.tenants.getUsage(LEGACY_TENANT_ID),
      };
    }

    const tenantId = auth.tenantId;
    const tenant = app.store.tenants.getTenant(tenantId);
    if (!tenant) return reply.code(404).send({ error: "Tenant não encontrado" });

    const user =
      auth.type === "user"
        ? app.store.tenants.getUserById(auth.userId)
        : null;

    return {
      authType: auth.type,
      user: user
        ? { id: user.id, email: user.email, name: user.name }
        : null,
      tenant: {
        id: tenant.id,
        name: tenant.name,
        slug: tenant.slug,
        plan: tenant.plan,
      },
      membership:
        auth.type === "user" ? { role: auth.role } : { role: "admin" as const },
      usage: app.store.tenants.getUsage(tenantId),
    };
  });

  app.get("/tenants/current", async (req, reply) => {
    const auth = requireAuth(req, reply);
    if (!auth) return;
    const tenantId =
      auth.type === "platform" ? LEGACY_TENANT_ID : auth.tenantId;
    const tenant = app.store.tenants.getTenant(tenantId);
    if (!tenant) return reply.code(404).send({ error: "Tenant não encontrado" });
    return {
      tenant: {
        id: tenant.id,
        name: tenant.name,
        slug: tenant.slug,
        plan: tenant.plan,
        status: tenant.status,
      },
      usage: app.store.tenants.getUsage(tenantId),
    };
  });

  app.get("/tenants/:id/api-keys", async (req, reply) => {
    const auth = requireAuth(req, reply);
    if (!auth) return;
    const { id } = req.params as { id: string };
    if (auth.type !== "platform" && tenantIdOf(auth) !== id) {
      return reply.code(404).send({ error: "Tenant não encontrado" });
    }
    if (!canManageTenant(auth) && auth.type !== "platform") {
      return reply.code(403).send({ error: "Sem permissão" });
    }
    return { keys: app.store.tenants.listApiKeys(id) };
  });

  app.post("/tenants/:id/api-keys", async (req, reply) => {
    const auth = requireAuth(req, reply);
    if (!auth) return;
    const { id } = req.params as { id: string };
    if (auth.type !== "platform" && tenantIdOf(auth) !== id) {
      return reply.code(404).send({ error: "Tenant não encontrado" });
    }
    if (!canManageTenant(auth)) {
      return reply.code(403).send({ error: "Sem permissão" });
    }
    const parsed = createKeyBody.safeParse(req.body ?? {});
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.flatten() });
    }
    try {
      const key = app.store.tenants.createApiKey(
        id,
        parsed.data.name ?? "API key",
      );
      return reply.code(201).send({
        id: key.id,
        name: key.name,
        prefix: key.prefix,
        token: key.token,
        createdAt: key.createdAt,
        warning: "Guarde esta API key agora — ela não será mostrada novamente.",
      });
    } catch {
      return reply.code(404).send({ error: "Tenant não encontrado" });
    }
  });

  app.delete("/tenants/:id/api-keys/:keyId", async (req, reply) => {
    const auth = requireAuth(req, reply);
    if (!auth) return;
    const { id, keyId } = req.params as { id: string; keyId: string };
    if (auth.type !== "platform" && tenantIdOf(auth) !== id) {
      return reply.code(404).send({ error: "Tenant não encontrado" });
    }
    if (!canManageTenant(auth)) {
      return reply.code(403).send({ error: "Sem permissão" });
    }
    const ok = app.store.tenants.revokeApiKey(id, keyId);
    if (!ok) return reply.code(404).send({ error: "API key não encontrada" });
    return reply.code(204).send();
  });
};
