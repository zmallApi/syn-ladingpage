import type { ResourceMeta, SchemaSnapshot } from "../adapters/types.js";

export type BusinessDomain =
  | "erp_commerce"
  | "saas_billing"
  | "crm"
  | "hr"
  | "membership_retention"
  | "generic";

/** Canonical roles + legacy aliases accepted in templates via canonicalizeRole. */
export type ResourceRole =
  | "party"
  | "event"
  | "ledger"
  | "catalog_item"
  | "transaction"
  | "line_item"
  | "survey"
  | "risk_snapshot"
  | "location"
  | "staff"
  | "subscription"
  | "lead"
  | "contact"
  // legacy (templates / older profiles) — resolved to canonical
  | "customer"
  | "member"
  | "order"
  | "product"
  | "checkin"
  | "unit"
  | "finance"
  | "payment"
  | "invoice"
  | "churn"
  | "nps"
  | "employee"
  | "unknown";

export interface ResourceRoleBinding {
  resource: string;
  role: ResourceRole;
  confidence: number;
  /** Heuristic only — false when set by user override */
  inferred?: boolean;
}

export type RoleOverrides = Record<string, ResourceRole>;

export interface BusinessSignal {
  kind: string;
  resource?: string;
  field?: string;
  detail: string;
}

export interface BusinessProfile {
  domain: BusinessDomain;
  confidence: number;
  resourceRoles: ResourceRoleBinding[];
  signals: BusinessSignal[];
  roleOverrides?: RoleOverrides;
}

export interface CapabilitySuggestion {
  id: string;
  title: string;
  description: string;
  domain: BusinessDomain | "any";
  kind?: "capability" | "playbook";
  requiredRoles: ResourceRole[];
  bindings: Record<string, string>;
  available: boolean;
  reason?: string;
}

export interface BoundCapability {
  id: string;
  title: string;
  description: string;
  toolName: string;
  bindings: Record<string, string>;
  inputSchema: CapabilityInputField[];
}

export interface CapabilityInputField {
  name: string;
  type: "string" | "number" | "boolean";
  required?: boolean;
  description?: string;
}

export interface AnalyzeResult {
  profile: BusinessProfile;
  suggestions: CapabilitySuggestion[];
  suggestedPack?: SuggestedPack | null;
  llmUsed: boolean;
  llmRationale?: string;
}

export interface SuggestedPack {
  id: string;
  title: string;
  description: string;
  capabilityIds: string[];
  reason: string;
}

export interface CapabilityHandlerContext {
  schema: SchemaSnapshot;
  exposedResources: string[];
  bindings: Record<string, string>;
  list: (
    resource: ResourceMeta,
    opts: { limit: number; offset: number; filter?: Record<string, unknown> },
  ) => Promise<unknown[]>;
  getById: (resource: ResourceMeta, id: string | number) => Promise<unknown | null>;
}

export type CapabilityHandler = (
  ctx: CapabilityHandlerContext,
  args: Record<string, unknown>,
) => Promise<unknown>;

export interface CapabilityTemplate {
  id: string;
  title: string;
  description: string;
  domain: BusinessDomain | "any";
  kind?: "capability" | "playbook";
  requiredRoles: ResourceRole[];
  inputSchema: CapabilityInputField[];
  bind: (
    schema: SchemaSnapshot,
    roles: ResourceRoleBinding[],
  ) => Record<string, string> | null;
  run: CapabilityHandler;
}
