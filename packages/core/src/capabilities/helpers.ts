import type { ResourceMeta } from "../adapters/types.js";
import type {
  CapabilityHandlerContext,
  CapabilityTemplate,
  ResourceRole,
  ResourceRoleBinding,
} from "./types.js";

export function requireExposedResource(
  ctx: CapabilityHandlerContext,
  name: string,
): ResourceMeta {
  if (!ctx.exposedResources.includes(name)) {
    throw new Error(`Recurso não exposto: ${name}`);
  }
  const meta = ctx.schema.resources.find((r) => r.name === name);
  if (!meta) throw new Error(`Recurso não encontrado no schema: ${name}`);
  return meta;
}

/** Binding key used for a generic role (risk_snapshot → risk, etc.). */
export function bindingKeyForRole(role: ResourceRole): string {
  if (role === "risk_snapshot") return "risk";
  if (role === "catalog_item") return "catalog_item";
  return role;
}

/** Resolve the table/collection bound to a required role. */
export function resourceForRequiredRole(
  role: ResourceRole,
  bindings: Record<string, string>,
  roles: ResourceRoleBinding[],
): string | undefined {
  const key = bindingKeyForRole(role);
  const fromBinding = bindings[key] || bindings[role];
  if (fromBinding?.trim()) return fromBinding;
  if (role === "catalog_item") {
    const alt = bindings.catalog || bindings.product;
    if (alt?.trim()) return alt;
  }
  return roles.find((r) => r.role === role)?.resource;
}

/** Resources that must be exposed for this template (based on requiredRoles). */
export function requiredExposedResources(
  template: CapabilityTemplate,
  bindings: Record<string, string>,
  roles: ResourceRoleBinding[],
): string[] {
  const out: string[] = [];
  for (const role of template.requiredRoles) {
    const name = resourceForRequiredRole(role, bindings, roles);
    if (name && !out.includes(name)) out.push(name);
  }
  return out;
}
