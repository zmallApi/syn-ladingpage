/**
 * Phase A smoke: canonical roles + suggestions on two fixtures (in-memory schemas).
 * Does not require Docker. Run: npx tsx scripts/smoke-phase-a-semantics.mjs
 */
import { analyzeCapabilities } from "../packages/core/src/capabilities/analyze.ts";

const erpclient = {
  engine: "postgresql",
  resources: [
    {
      name: "clientes",
      kind: "table",
      primaryKey: ["id"],
      fields: [
        { name: "id", dataType: "integer", nullable: false },
        { name: "nome", dataType: "text", nullable: false },
        { name: "email", dataType: "text", nullable: true },
      ],
    },
    {
      name: "produtos",
      kind: "table",
      primaryKey: ["id"],
      fields: [
        { name: "id", dataType: "integer", nullable: false },
        { name: "sku", dataType: "text", nullable: false },
        { name: "nome", dataType: "text", nullable: false },
        { name: "preco", dataType: "numeric", nullable: false },
        { name: "estoque", dataType: "integer", nullable: false },
      ],
    },
    {
      name: "pedidos",
      kind: "table",
      primaryKey: ["id"],
      fields: [
        { name: "id", dataType: "integer", nullable: false },
        { name: "cliente_id", dataType: "integer", nullable: false },
        { name: "total", dataType: "numeric", nullable: false },
        { name: "status", dataType: "text", nullable: false },
      ],
    },
    {
      name: "itens_pedido",
      kind: "table",
      primaryKey: ["id"],
      fields: [
        { name: "id", dataType: "integer", nullable: false },
        { name: "pedido_id", dataType: "integer", nullable: false },
        { name: "produto_id", dataType: "integer", nullable: false },
        { name: "quantidade", dataType: "integer", nullable: false },
      ],
    },
  ],
};

const retentionLike = {
  engine: "postgresql",
  resources: [
    {
      name: "alunos",
      kind: "table",
      primaryKey: ["id"],
      fields: [
        { name: "id", dataType: "uuid", nullable: false },
        { name: "nome", dataType: "text", nullable: false },
        { name: "email", dataType: "text", nullable: true },
        { name: "matricula", dataType: "text", nullable: true },
        { name: "status_contrato", dataType: "text", nullable: true },
        { name: "score", dataType: "integer", nullable: true },
        { name: "classif", dataType: "text", nullable: true },
        { name: "freq_30", dataType: "integer", nullable: true },
        { name: "dias_atraso", dataType: "integer", nullable: true },
      ],
    },
    {
      name: "users",
      kind: "table",
      primaryKey: ["id"],
      fields: [
        { name: "id", dataType: "uuid", nullable: false },
        { name: "nome", dataType: "text", nullable: false },
        { name: "email", dataType: "text", nullable: true },
        { name: "senha_hash", dataType: "text", nullable: false },
      ],
    },
    {
      name: "checkins",
      kind: "table",
      primaryKey: ["id"],
      fields: [
        { name: "id", dataType: "uuid", nullable: false },
        { name: "aluno_id", dataType: "uuid", nullable: false },
        { name: "data_checkin", dataType: "timestamptz", nullable: false },
      ],
    },
    {
      name: "financeiro",
      kind: "table",
      primaryKey: ["id"],
      fields: [
        { name: "id", dataType: "uuid", nullable: false },
        { name: "aluno_id", dataType: "uuid", nullable: false },
        { name: "valor_cobrado", dataType: "numeric", nullable: false },
        { name: "status", dataType: "text", nullable: false },
        { name: "dias_atraso", dataType: "integer", nullable: true },
      ],
    },
    {
      name: "nps_respostas",
      kind: "table",
      primaryKey: ["id"],
      fields: [
        { name: "id", dataType: "uuid", nullable: false },
        { name: "aluno_id", dataType: "uuid", nullable: false },
        { name: "score", dataType: "integer", nullable: false },
        { name: "sentimento", dataType: "text", nullable: true },
      ],
    },
    {
      name: "churn_historico",
      kind: "table",
      primaryKey: ["id"],
      fields: [
        { name: "id", dataType: "uuid", nullable: false },
        { name: "churn_observado_pct", dataType: "numeric", nullable: true },
        { name: "alunos_em_risco", dataType: "integer", nullable: true },
      ],
    },
    {
      name: "unidades",
      kind: "table",
      primaryKey: ["id"],
      fields: [
        { name: "id", dataType: "uuid", nullable: false },
        { name: "nome", dataType: "text", nullable: false },
        { name: "n_alunos", dataType: "integer", nullable: true },
        { name: "churn_base", dataType: "numeric", nullable: true },
      ],
    },
  ],
};

function roleMap(profile) {
  return Object.fromEntries(
    profile.resourceRoles
      .filter((r) => r.confidence >= 0.45)
      .map((r) => [r.resource, r.role]),
  );
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

const erp = await analyzeCapabilities(erpclient, { useLlm: false });
assert(erp.profile.domain === "erp_commerce", `erp domain=${erp.profile.domain}`);
assert(roleMap(erp.profile).clientes === "party", "clientes should be party");
assert(roleMap(erp.profile).pedidos === "transaction", "pedidos transaction");
assert(roleMap(erp.profile).produtos === "catalog_item", "produtos catalog_item");
const erpAvail = erp.suggestions.filter((s) => s.available).map((s) => s.id);
assert(erpAvail.includes("search_parties"), "erp search_parties");
assert(erpAvail.includes("party_summary"), "erp party_summary");

const ret = await analyzeCapabilities(retentionLike, { useLlm: false });
assert(
  ret.profile.domain === "membership_retention",
  `retention domain=${ret.profile.domain}`,
);
const roles = roleMap(ret.profile);
assert(roles.alunos === "party", `alunos=${roles.alunos}`);
assert(roles.users === "staff", `users should be staff, got ${roles.users}`);
assert(roles.checkins === "event", `checkins=${roles.checkins}`);
assert(roles.financeiro === "ledger", `financeiro=${roles.financeiro}`);
assert(roles.nps_respostas === "survey", `nps=${roles.nps_respostas}`);
assert(roles.churn_historico === "risk_snapshot", `churn=${roles.churn_historico}`);
assert(roles.unidades === "location", `unidades=${roles.unidades}`);
const retAvail = ret.suggestions.filter((s) => s.available).map((s) => s.id);
assert(retAvail.includes("search_parties"), "retention search_parties");
assert(retAvail.includes("recent_events"), "retention recent_events");
assert(retAvail.includes("overdue_ledger"), "retention overdue_ledger");

// Override: force users as party should flip (and demote preference still allows bind)
const overridden = await analyzeCapabilities(retentionLike, {
  useLlm: false,
  roleOverrides: { users: "party", alunos: "unknown" },
});
assert(
  roleMap(overridden.profile).users === "party",
  "override users→party",
);

console.log(
  JSON.stringify(
    {
      ok: true,
      erp: { domain: erp.profile.domain, roles: roleMap(erp.profile), available: erpAvail },
      retention: {
        domain: ret.profile.domain,
        roles,
        available: retAvail,
      },
      overrideOk: true,
    },
    null,
    2,
  ),
);
