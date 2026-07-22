import type { ResourceMeta, SchemaSnapshot } from "../adapters/types.js";
import { canonicalizeRole, rolesMatch } from "./roles.js";
import type {
  BusinessDomain,
  BusinessProfile,
  BusinessSignal,
  ResourceRole,
  ResourceRoleBinding,
  RoleOverrides,
} from "./types.js";

function norm(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9_]/g, "");
}

const ROLE_PATTERNS: Array<{ role: ResourceRole; patterns: string[] }> = [
  {
    role: "party",
    patterns: [
      "aluno",
      "alunos",
      "membro",
      "membros",
      "member",
      "members",
      "student",
      "students",
      "paciente",
      "pacientes",
      "cliente",
      "clientes",
      "customer",
      "customers",
      "associado",
      "associados",
    ],
  },
  {
    role: "event",
    patterns: [
      "checkin",
      "checkins",
      "check_in",
      "check_ins",
      "acesso",
      "acessos",
      "visita",
      "visitas",
      "atendimento",
      "atendimentos",
      "atividade",
      "atividades",
      "activity",
      "activities",
      "ticket",
      "tickets",
    ],
  },
  {
    role: "ledger",
    patterns: [
      "financeiro",
      "financeiros",
      "finance",
      "pagamento",
      "pagamentos",
      "payment",
      "payments",
      "cobranca",
      "cobrancas",
      "mensalidade",
      "mensalidades",
      "fatura",
      "faturas",
      "invoice",
      "invoices",
    ],
  },
  {
    role: "catalog_item",
    patterns: ["produto", "produtos", "product", "products", "sku", "plano", "planos"],
  },
  {
    role: "transaction",
    patterns: ["pedido", "pedidos", "order", "orders", "venda", "vendas", "sale", "sales"],
  },
  {
    role: "line_item",
    patterns: [
      "item_pedido",
      "itens_pedido",
      "pedido_item",
      "pedido_itens",
      "order_item",
      "order_items",
      "line_item",
      "line_items",
    ],
  },
  {
    role: "survey",
    patterns: [
      "nps",
      "nps_respostas",
      "nps_resposta",
      "avaliacao",
      "avaliacoes",
      "feedback",
      "review",
      "reviews",
    ],
  },
  {
    role: "risk_snapshot",
    patterns: ["churn", "churn_historico", "cancelamento", "risk_score", "risk_scores"],
  },
  {
    role: "location",
    patterns: [
      "unidade",
      "unidades",
      "unit",
      "units",
      "branch",
      "branches",
      "filial",
      "filiais",
      "loja",
      "lojas",
      "academia",
      "academias",
    ],
  },
  {
    role: "staff",
    patterns: [
      "user",
      "users",
      "usuario",
      "usuarios",
      "funcionario",
      "funcionarios",
      "colaborador",
      "colaboradores",
      "employee",
      "employees",
      "gerente",
      "gerentes",
      "staff",
    ],
  },
  {
    role: "subscription",
    patterns: ["assinatura", "assinaturas", "subscription", "subscriptions"],
  },
  {
    role: "lead",
    patterns: ["lead", "leads", "oportunidade", "oportunidades", "deal", "deals"],
  },
  {
    role: "contact",
    patterns: ["contato", "contatos", "contact", "contacts"],
  },
];

const DOMAIN_KEYWORDS: Record<Exclude<BusinessDomain, "generic">, string[]> = {
  membership_retention: [
    "aluno",
    "alunos",
    "checkin",
    "checkins",
    "churn",
    "nps",
    "mensalidade",
    "reten",
    "academia",
    "unidade",
    "freq_30",
    "status_contrato",
    "matricula",
    "ultimo_checkin",
  ],
  erp_commerce: [
    "cliente",
    "pedido",
    "produto",
    "estoque",
    "sku",
    "total",
    "customer",
    "order",
    "product",
    "inventory",
  ],
  saas_billing: [
    "subscription",
    "invoice",
    "plan",
    "tenant",
    "seat",
    "assinatura",
    "fatura",
    "plano",
  ],
  crm: ["lead", "deal", "pipeline", "oportunidade", "contato", "contact", "crm"],
  hr: ["funcionario", "employee", "folha", "cargo", "departamento", "department", "hr"],
};

const SATELLITE_NAMES = new Set([
  "users",
  "user",
  "user_roles",
  "roles",
  "permissions",
  "role_permissions",
  "audit_log",
  "sessions",
  "tokens",
  "webhook_events",
  "import_runs",
  "import_errors",
  "integration_mappings",
]);

function patternMatchConfidence(resourceNorm: string, patternNorm: string): number {
  if (!patternNorm) return 0;
  if (resourceNorm === patternNorm) return 1;

  const plural =
    resourceNorm === `${patternNorm}s` ||
    resourceNorm === `${patternNorm}es` ||
    patternNorm === `${resourceNorm}s` ||
    patternNorm === `${resourceNorm}es`;
  if (plural) return 0.98;

  const tokens = resourceNorm.split("_").filter(Boolean);
  if (tokens.includes(patternNorm)) {
    if (patternNorm.length <= 4 && tokens.length > 1) return 0.35;
    return 0.95;
  }

  if (
    resourceNorm.startsWith(`${patternNorm}_`) ||
    resourceNorm.endsWith(`_${patternNorm}`)
  ) {
    return 0.88;
  }

  if (patternNorm.length >= 5 && resourceNorm.includes(patternNorm)) {
    return Math.min(0.9, patternNorm.length / Math.max(resourceNorm.length, 1));
  }

  return 0;
}

function columnRoleBoost(meta: ResourceMeta): Partial<Record<ResourceRole, number>> {
  const boost: Partial<Record<ResourceRole, number>> = {};
  const fields = meta.fields.map((f) => norm(f.name));
  const has = (p: string) => fields.some((f) => f === p || f.includes(p));

  if (has("email") && (has("nome") || has("name"))) {
    boost.party = (boost.party ?? 0) + 0.25;
  }
  if (has("matricula") || has("status_contrato") || has("freq_30") || has("valor_mensalidade")) {
    boost.party = (boost.party ?? 0) + 0.35;
  }
  if (has("senha") || has("password") || has("senha_hash")) {
    boost.staff = (boost.staff ?? 0) + 0.4;
    boost.party = (boost.party ?? 0) - 0.5;
  }
  if (has("estoque") || has("sku") || has("preco") || has("price")) {
    boost.catalog_item = (boost.catalog_item ?? 0) + 0.3;
  }
  if (has("total") && (has("status") || has("cliente_id") || has("customer_id"))) {
    boost.transaction = (boost.transaction ?? 0) + 0.25;
  }
  if (has("data_checkin") || has("checkin")) {
    boost.event = (boost.event ?? 0) + 0.3;
  }
  if (has("valor_cobrado") || has("valor_pago") || has("dias_atraso")) {
    boost.ledger = (boost.ledger ?? 0) + 0.3;
  }
  if (has("sentimento") || (has("score") && has("comentario"))) {
    boost.survey = (boost.survey ?? 0) + 0.25;
  }
  if (has("churn") || has("alunos_em_risco") || has("receita_em_risco")) {
    boost.risk_snapshot = (boost.risk_snapshot ?? 0) + 0.35;
  }
  if (has("n_alunos") || has("churn_base") || has("inadimplencia")) {
    boost.location = (boost.location ?? 0) + 0.25;
  }

  // FK hints
  for (const f of fields) {
    if (!f.endsWith("_id") && f !== "id") continue;
    const base = f.replace(/_?id$/, "");
    if (["aluno", "cliente", "customer", "member", "student", "paciente"].includes(base)) {
      boost.event = (boost.event ?? 0) + 0.1;
      boost.ledger = (boost.ledger ?? 0) + 0.1;
      boost.survey = (boost.survey ?? 0) + 0.1;
    }
  }

  return boost;
}

function scoreRole(meta: ResourceMeta): ResourceRoleBinding {
  const n = norm(meta.name);
  let best: ResourceRoleBinding = {
    resource: meta.name,
    role: "unknown",
    confidence: 0,
    inferred: true,
  };

  for (const { role, patterns } of ROLE_PATTERNS) {
    for (const p of patterns) {
      const conf = patternMatchConfidence(n, norm(p));
      if (conf > best.confidence) {
        best = { resource: meta.name, role, confidence: conf, inferred: true };
      }
    }
  }

  const boosts = columnRoleBoost(meta);
  for (const [role, boost] of Object.entries(boosts) as Array<[ResourceRole, number]>) {
    const conf = Math.min(0.99, (best.role === role ? best.confidence : 0.4) + boost);
    if (role === best.role) {
      best = { ...best, confidence: Math.min(0.99, best.confidence + boost) };
    } else if (conf > best.confidence) {
      best = { resource: meta.name, role, confidence: conf, inferred: true };
    }
  }

  if (SATELLITE_NAMES.has(n) && best.role === "party") {
    best = { ...best, role: "staff", confidence: Math.max(best.confidence, 0.85) };
  }

  return best;
}

function demoteSatelliteParties(roles: ResourceRoleBinding[]): ResourceRoleBinding[] {
  const parties = roles.filter(
    (r) => canonicalizeRole(r.role) === "party" && r.confidence >= 0.45,
  );
  if (parties.length < 2) return roles;

  const business = parties.filter((r) => !SATELLITE_NAMES.has(norm(r.resource)));
  if (!business.length) return roles;

  return roles.map((r) => {
    if (
      canonicalizeRole(r.role) === "party" &&
      SATELLITE_NAMES.has(norm(r.resource))
    ) {
      return {
        ...r,
        role: "staff" as ResourceRole,
        confidence: Math.min(r.confidence, 0.7),
        inferred: true,
      };
    }
    return r;
  });
}

/** Prefer real location tables over junction names like gerente_unidades. */
function demoteCompoundLocations(roles: ResourceRoleBinding[]): ResourceRoleBinding[] {
  const locations = roles.filter(
    (r) => canonicalizeRole(r.role) === "location" && r.confidence >= 0.45,
  );
  if (locations.length < 2) return roles;
  const pure = locations.filter((r) => {
    const n = norm(r.resource);
    return n === "unidade" || n === "unidades" || n === "unit" || n === "units" ||
      n === "filial" || n === "filiais" || n === "branch" || n === "branches" ||
      n === "loja" || n === "lojas" || n === "academia" || n === "academias" ||
      (!n.includes("_") && n.length <= 12);
  });
  if (!pure.length) return roles;
  return roles.map((r) => {
    if (canonicalizeRole(r.role) !== "location") return r;
    const n = norm(r.resource);
    if (n.includes("_") && !pure.some((p) => p.resource === r.resource)) {
      return { ...r, confidence: Math.min(r.confidence, 0.4), inferred: true };
    }
    return r;
  });
}

function collectSignals(resources: ResourceMeta[]): BusinessSignal[] {
  const signals: BusinessSignal[] = [];
  for (const r of resources) {
    for (const f of r.fields) {
      const fn = norm(f.name);
      if (fn === "status" || fn.includes("status")) {
        signals.push({
          kind: "status_field",
          resource: r.name,
          field: f.name,
          detail: `Campo de status em ${r.name}.${f.name}`,
        });
      }
      if (
        fn.includes("total") ||
        fn.includes("preco") ||
        fn.includes("price") ||
        fn.includes("valor") ||
        fn.includes("amount") ||
        fn.includes("mensalidade")
      ) {
        signals.push({
          kind: "money_field",
          resource: r.name,
          field: f.name,
          detail: `Campo monetário em ${r.name}.${f.name}`,
        });
      }
      if (fn.includes("estoque") || fn.includes("stock") || fn.includes("inventory")) {
        signals.push({
          kind: "inventory_field",
          resource: r.name,
          field: f.name,
          detail: `Campo de estoque em ${r.name}.${f.name}`,
        });
      }
      if (fn.includes("email")) {
        signals.push({
          kind: "email_field",
          resource: r.name,
          field: f.name,
          detail: `Email em ${r.name}.${f.name}`,
        });
      }
      if (
        fn.includes("churn") ||
        fn.includes("risco") ||
        fn === "score" ||
        fn === "classif" ||
        fn.includes("tendencia") ||
        fn.includes("dias_atraso") ||
        fn.startsWith("freq_")
      ) {
        signals.push({
          kind: "retention_field",
          resource: r.name,
          field: f.name,
          detail: `Sinal de retenção/risco em ${r.name}.${f.name}`,
        });
      }
    }
  }
  return signals;
}

function scoreDomain(
  resources: ResourceMeta[],
  roles: ResourceRoleBinding[],
  signals: BusinessSignal[],
): { domain: BusinessDomain; confidence: number } {
  const blob = [
    ...resources.map((r) => r.name),
    ...resources.flatMap((r) => r.fields.map((f) => f.name)),
  ]
    .map(norm)
    .join(" ");

  const scores: Record<Exclude<BusinessDomain, "generic">, number> = {
    membership_retention: 0,
    erp_commerce: 0,
    saas_billing: 0,
    crm: 0,
    hr: 0,
  };

  for (const [domain, keywords] of Object.entries(DOMAIN_KEYWORDS) as Array<
    [Exclude<BusinessDomain, "generic">, string[]]
  >) {
    for (const kw of keywords) {
      if (blob.includes(norm(kw))) scores[domain] += 1;
    }
  }

  const roleBoost: Partial<Record<ResourceRole, Exclude<BusinessDomain, "generic">>> = {
    party: "erp_commerce",
    transaction: "erp_commerce",
    catalog_item: "erp_commerce",
    line_item: "erp_commerce",
    event: "membership_retention",
    risk_snapshot: "membership_retention",
    survey: "membership_retention",
    ledger: "membership_retention",
    location: "membership_retention",
    subscription: "saas_billing",
    lead: "crm",
    contact: "crm",
    staff: "hr",
  };

  for (const rb of roles) {
    if (rb.confidence < 0.5) continue;
    const canon = canonicalizeRole(rb.role);
    // party alone shouldn't force erp if retention signals dominate
    if (canon === "party") {
      scores.erp_commerce += 0.8 * rb.confidence;
      scores.membership_retention += 0.5 * rb.confidence;
      continue;
    }
    if (canon === "ledger") {
      scores.membership_retention += 1.2 * rb.confidence;
      scores.saas_billing += 0.8 * rb.confidence;
      scores.erp_commerce += 0.4 * rb.confidence;
      continue;
    }
    const d = roleBoost[canon];
    if (d) scores[d] += 2 * rb.confidence;
  }

  if (signals.some((s) => s.kind === "inventory_field")) scores.erp_commerce += 1.5;
  if (signals.some((s) => s.kind === "retention_field")) {
    scores.membership_retention += 2.5;
  }
  if (signals.some((s) => s.kind === "money_field")) {
    scores.erp_commerce += 0.5;
    scores.saas_billing += 0.5;
    scores.membership_retention += 0.5;
  }

  // CRM pipeline signals: lead + activity-like events without fitness keywords
  if (roles.some((r) => canonicalizeRole(r.role) === "lead" && r.confidence >= 0.5)) {
    scores.crm += 3;
  }
  if (
    blob.includes("oportunidade") ||
    blob.includes("pipeline") ||
    blob.includes("atividade") ||
    blob.includes("activity")
  ) {
    scores.crm += 2;
  }
  if (
    blob.includes("aluno") ||
    blob.includes("checkin") ||
    blob.includes("churn") ||
    blob.includes("academia")
  ) {
    scores.membership_retention += 2;
  }

  let best: BusinessDomain = "generic";
  let bestScore = 0;
  for (const [domain, score] of Object.entries(scores) as Array<
    [Exclude<BusinessDomain, "generic">, number]
  >) {
    if (score > bestScore) {
      best = domain;
      bestScore = score;
    }
  }

  if (bestScore < 2) {
    return { domain: "generic", confidence: Math.min(0.4, bestScore / 5) };
  }

  return { domain: best, confidence: Math.min(0.98, 0.35 + bestScore / 12) };
}

export function applyRoleOverrides(
  roles: ResourceRoleBinding[],
  overrides?: RoleOverrides | null,
): ResourceRoleBinding[] {
  if (!overrides || !Object.keys(overrides).length) return roles;
  return roles.map((r) => {
    const ov = overrides[r.resource];
    if (!ov) return r;
    return {
      resource: r.resource,
      role: canonicalizeRole(ov),
      confidence: 1,
      inferred: false,
    };
  });
}

/** Detect business domain and resource roles from schema metadata only. */
export function analyzeBusinessProfile(
  snap: SchemaSnapshot,
  overrides?: RoleOverrides | null,
): BusinessProfile {
  let roles = snap.resources.map((r) => scoreRole(r));
  roles = demoteSatelliteParties(roles);
  roles = demoteCompoundLocations(roles);
  roles = applyRoleOverrides(roles, overrides);
  const signals = collectSignals(snap.resources);
  const { domain, confidence } = scoreDomain(snap.resources, roles, signals);

  return {
    domain,
    confidence,
    resourceRoles: roles,
    signals,
    roleOverrides: overrides && Object.keys(overrides).length ? { ...overrides } : undefined,
  };
}

export function findResourceByRole(
  roles: ResourceRoleBinding[],
  role: ResourceRole,
  minConfidence = 0.45,
): string | undefined {
  const matches = roles
    .filter((r) => rolesMatch(r.role, role) && r.confidence >= minConfidence)
    .sort((a, b) => {
      // Prefer non-satellite / non-inferred-low
      const as = SATELLITE_NAMES.has(norm(a.resource)) ? 0 : 1;
      const bs = SATELLITE_NAMES.has(norm(b.resource)) ? 0 : 1;
      if (as !== bs) return bs - as;
      return b.confidence - a.confidence;
    });
  return matches[0]?.resource;
}

export function findField(
  resource: { fields: Array<{ name: string }> },
  patterns: string[],
): string | undefined {
  for (const f of resource.fields) {
    const n = norm(f.name);
    if (patterns.some((p) => n === norm(p) || n.includes(norm(p)))) {
      return f.name;
    }
  }
  return undefined;
}

export function hasRole(
  roles: ResourceRoleBinding[],
  role: ResourceRole,
  minConfidence = 0.45,
): boolean {
  return roles.some((r) => rolesMatch(r.role, role) && r.confidence >= minConfidence);
}
