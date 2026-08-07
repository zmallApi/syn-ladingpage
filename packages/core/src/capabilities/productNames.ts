/**
 * Nomes de produto das capabilities (unidades de inteligência).
 * Capabilities recebem contexto e produzem conclusões — não executam workflows.
 */
export const CAPABILITY_PRODUCT_NAMES: Record<
  string,
  { productName: string; family: string }
> = {
  eng_understand_story: {
    productName: "Descoberta de conhecimento",
    family: "Discovery",
  },
  eng_refine_story: { productName: "Refinar escopo", family: "Discovery" },
  eng_impact_analysis: { productName: "Análise de impacto", family: "Impact" },
  eng_implementation_plan: {
    productName: "Plano de implementação",
    family: "Plan",
  },
  eng_execute_context: {
    productName: "Mission Package",
    family: "Execute",
  },
  list_at_risk: { productName: "Análise de risco", family: "Risco" },
  risk_series: { productName: "Sinal de churn", family: "Churn" },
  overdue_ledger: { productName: "Inadimplência", family: "Cobrança" },
  attention_queue: { productName: "Fila de atenção", family: "Risco" },
  find_open_orders: { productName: "Pedidos abertos", family: "CRM" },
  party_360: { productName: "Visão 360 da pessoa", family: "Playbook" },
  party_summary: { productName: "Resumo da pessoa", family: "Cadastro" },
  search_parties: {
    productName: "Buscar pessoas / organizações",
    family: "Cadastro",
  },
  location_health: { productName: "Saúde da unidade", family: "Playbook" },
};

export function productNameForCapability(id: string): string {
  return CAPABILITY_PRODUCT_NAMES[id]?.productName ?? id;
}
