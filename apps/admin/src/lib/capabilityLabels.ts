/** Rótulos amigáveis para capabilities no Admin (PT-BR). */
const CAP_LABELS: Record<string, string> = {
  search_parties: "Buscar pessoas",
  party_summary: "Resumo da pessoa",
  party_360: "Visão 360",
  list_at_risk: "Análise de risco",
  recent_events: "Eventos recentes",
  overdue_ledger: "Inadimplência",
  survey_overview: "Pesquisas e NPS",
  risk_series: "Sinal de churn",
  location_summary: "Resumo da unidade",
  location_health: "Saúde da unidade",
  attention_queue: "Fila de atenção",
  find_open_orders: "Pedidos abertos",
  low_inventory: "Estoque baixo",
  top_products: "Produtos mais vendidos",
  explain_business_model: "Explicar modelo de negócio",
};

export function capabilityLabel(id: string): string {
  return CAP_LABELS[id] ?? id.replace(/_/g, " ");
}
