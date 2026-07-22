import { hasRole } from "./heuristics.js";
import type {
  BusinessProfile,
  CapabilitySuggestion,
  ResourceRole,
  SuggestedPack,
} from "./types.js";

export type { SuggestedPack };

type PackDef = {
  id: string;
  title: string;
  description: string;
  /** Roles that strengthen this pack */
  roles: ResourceRole[];
  /** Preferred capability ids (canonical) */
  capabilities: string[];
  minRoles: number;
};

const PACKS: PackDef[] = [
  {
    id: "commerce_ops",
    title: "Operação comercial",
    description: "Busca, resumo, pedidos/estoque e playbook 360 quando couber.",
    roles: ["party", "transaction", "catalog_item"],
    capabilities: [
      "search_parties",
      "party_summary",
      "party_360",
      "find_open_orders",
      "low_inventory",
      "top_products",
      "explain_business_model",
    ],
    minRoles: 2,
  },
  {
    id: "engagement_retention",
    title: "Engajamento e retenção",
    description: "Partes, eventos, risco, ledger, pesquisas e playbooks.",
    roles: ["party", "event", "ledger", "survey", "risk_snapshot", "location"],
    capabilities: [
      "search_parties",
      "party_summary",
      "list_at_risk",
      "recent_events",
      "overdue_ledger",
      "survey_overview",
      "risk_series",
      "location_summary",
      "party_360",
      "attention_queue",
      "location_health",
      "explain_business_model",
    ],
    minRoles: 2,
  },
  {
    id: "crm_pipeline",
    title: "CRM / pipeline",
    description: "Partes + eventos de atividade e fila de atenção.",
    roles: ["party", "event", "lead"],
    capabilities: [
      "search_parties",
      "party_summary",
      "party_360",
      "recent_events",
      "attention_queue",
      "explain_business_model",
    ],
    minRoles: 2,
  },
  {
    id: "party_core",
    title: "Núcleo de partes",
    description: "Busca, ficha e 360 mínimo.",
    roles: ["party"],
    capabilities: [
      "search_parties",
      "party_summary",
      "party_360",
      "explain_business_model",
    ],
    minRoles: 1,
  },
];

/**
 * Suggest a capability pack from detected roles + available suggestions.
 * Domain labels only help ranking — packs are role-based (generic).
 */
export function suggestCapabilityPack(
  profile: BusinessProfile,
  suggestions: CapabilitySuggestion[],
): SuggestedPack | null {
  const available = new Set(
    suggestions.filter((s) => s.available).map((s) => s.id),
  );

  let best: SuggestedPack | null = null;
  let bestScore = 0;

  for (const pack of PACKS) {
    const matchedRoles = pack.roles.filter((role) => hasRole(profile.resourceRoles, role));
    if (matchedRoles.length < pack.minRoles) continue;

    const capabilityIds = pack.capabilities.filter((id) => available.has(id));
    if (capabilityIds.length < 2) continue;

    let score = matchedRoles.length * 2 + capabilityIds.length;
    if (
      profile.domain === "erp_commerce" &&
      pack.id === "commerce_ops"
    ) {
      score += 3;
    }
    if (
      profile.domain === "membership_retention" &&
      pack.id === "engagement_retention"
    ) {
      score += 3;
    }
    if (profile.domain === "crm" && pack.id === "crm_pipeline") {
      score += 3;
    }

    if (score > bestScore) {
      bestScore = score;
      best = {
        id: pack.id,
        title: pack.title,
        description: pack.description,
        capabilityIds,
        reason: `Papéis detectados: ${matchedRoles.join(", ")}`,
      };
    }
  }

  return best;
}
