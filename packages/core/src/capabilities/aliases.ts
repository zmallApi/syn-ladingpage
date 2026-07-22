import type { CapabilityTemplate } from "./types.js";

/**
 * Legacy capability ids → canonical Phase B ids.
 * Active projects may still store old ids; resolve on read/activate/MCP.
 */
export const CAPABILITY_ALIASES: Record<string, string> = {
  search_customers: "search_parties",
  search_members: "search_parties",
  customer_summary: "party_summary",
  member_risk_summary: "party_summary",
  find_at_risk_members: "list_at_risk",
  member_checkins: "recent_events",
  overdue_finance: "overdue_ledger",
  nps_overview: "survey_overview",
  churn_snapshot: "risk_series",
};

export function resolveCapabilityId(id: string): string {
  return CAPABILITY_ALIASES[id] ?? id;
}

export function normalizeCapabilityIds(ids: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of ids) {
    const id = resolveCapabilityId(raw);
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

/** Legacy ids that map to a canonical template (for dual MCP tool registration). */
export function legacyIdsForCanonical(canonicalId: string): string[] {
  return Object.entries(CAPABILITY_ALIASES)
    .filter(([, canon]) => canon === canonicalId)
    .map(([legacy]) => legacy);
}

export function isKnownCapabilityId(
  id: string,
  templates: CapabilityTemplate[],
): boolean {
  const resolved = resolveCapabilityId(id);
  return templates.some((t) => t.id === resolved);
}
