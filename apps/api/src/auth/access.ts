import type { FastifyReply, FastifyRequest } from "fastify";
import type { MembershipRole, ProjectRecord, ProjectStore } from "@synapse/storage";

export type AuthContext =
  | { type: "platform" }
  | {
      type: "user";
      userId: string;
      tenantId: string;
      role: MembershipRole;
      email: string;
    }
  | { type: "tenant_key"; tenantId: string; keyId: string };

declare module "fastify" {
  interface FastifyRequest {
    auth?: AuthContext;
  }
}

export function tenantIdOf(auth: AuthContext): string | null {
  if (auth.type === "platform") return null;
  return auth.tenantId;
}

export function canManageTenant(auth: AuthContext): boolean {
  if (auth.type === "platform") return true;
  if (auth.type === "tenant_key") return true;
  return auth.role === "owner" || auth.role === "admin";
}

export function resolveTenantIdForWrite(
  auth: AuthContext,
  explicit?: string,
): string | null {
  if (auth.type === "platform") {
    return explicit?.trim() || null;
  }
  return auth.tenantId;
}

/** Load project visible to auth; sends 404 on miss (no cross-tenant leak). */
export function loadAccessibleProject(
  store: ProjectStore,
  auth: AuthContext | undefined,
  projectId: string,
  reply: FastifyReply,
): ProjectRecord | null {
  if (!auth) {
    reply.code(401).send({ error: "Não autenticado" });
    return null;
  }
  if (auth.type === "platform") {
    const project = store.get(projectId);
    if (!project) {
      reply.code(404).send({ error: "Projeto não encontrado" });
      return null;
    }
    return project;
  }
  const project = store.getInTenant(projectId, auth.tenantId);
  if (!project) {
    reply.code(404).send({ error: "Projeto não encontrado" });
    return null;
  }
  return project;
}

export function requireAuth(
  req: FastifyRequest,
  reply: FastifyReply,
): AuthContext | null {
  if (!req.auth) {
    reply.code(401).send({ error: "Não autenticado" });
    return null;
  }
  return req.auth;
}
