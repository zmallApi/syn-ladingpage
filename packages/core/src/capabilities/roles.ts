import type { ResourceRole } from "./types.js";

/** Canonical roles (Phase A). Legacy names resolve here for compat. */
export const CANONICAL_ROLES = [
  "party",
  "event",
  "ledger",
  "catalog_item",
  "transaction",
  "line_item",
  "survey",
  "risk_snapshot",
  "location",
  "staff",
  "subscription",
  "lead",
  "contact",
  "unknown",
] as const;

/** Map legacy / synonym role ids → canonical. */
export const ROLE_ALIASES: Record<string, ResourceRole> = {
  customer: "party",
  member: "party",
  aluno: "party",
  client: "party",
  order: "transaction",
  pedido: "transaction",
  product: "catalog_item",
  produto: "catalog_item",
  checkin: "event",
  finance: "ledger",
  payment: "ledger",
  invoice: "ledger",
  unit: "location",
  churn: "risk_snapshot",
  nps: "survey",
  employee: "staff",
  user: "staff",
};

export function canonicalizeRole(role: string): ResourceRole {
  const r = role.trim().toLowerCase();
  if ((CANONICAL_ROLES as readonly string[]).includes(r)) {
    return r as ResourceRole;
  }
  return (ROLE_ALIASES[r] ?? "unknown") as ResourceRole;
}

export function rolesMatch(a: string, b: string): boolean {
  return canonicalizeRole(a) === canonicalizeRole(b);
}

export const ROLE_LABELS: Record<string, string> = {
  party: "Parte (cliente/aluno/contato)",
  event: "Evento (check-in/visita)",
  ledger: "Financeiro / cobrança",
  catalog_item: "Item de catálogo / produto",
  transaction: "Transação / pedido",
  line_item: "Item de linha",
  survey: "Pesquisa / NPS",
  risk_snapshot: "Série de risco / churn",
  location: "Unidade / local",
  staff: "Equipe / usuário interno",
  subscription: "Assinatura",
  lead: "Lead",
  contact: "Contato",
};
