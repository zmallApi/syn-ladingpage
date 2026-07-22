/**
 * Phase B smoke: generic catalog ids, aliases, packs (2 fixtures).
 * Run: npx tsx scripts/smoke-phase-b-catalog.mjs
 */
import { analyzeCapabilities } from "../packages/core/src/capabilities/analyze.ts";
import {
  getTemplate,
  mcpToolNamesForCapability,
} from "../packages/core/src/capabilities/templates.ts";
import {
  normalizeCapabilityIds,
  resolveCapabilityId,
} from "../packages/core/src/capabilities/aliases.ts";

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
        { name: "score", dataType: "integer", nullable: true },
        { name: "classif", dataType: "text", nullable: true },
        { name: "dias_atraso", dataType: "integer", nullable: true },
        { name: "freq_30", dataType: "integer", nullable: true },
      ],
    },
    {
      name: "users",
      kind: "table",
      primaryKey: ["id"],
      fields: [
        { name: "id", dataType: "uuid", nullable: false },
        { name: "nome", dataType: "text", nullable: false },
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
      ],
    },
  ],
};

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

assert(resolveCapabilityId("search_members") === "search_parties", "alias members");
assert(resolveCapabilityId("search_customers") === "search_parties", "alias customers");
assert(getTemplate("search_members")?.id === "search_parties", "getTemplate alias");
assert(
  normalizeCapabilityIds(["search_members", "search_customers", "list_at_risk"]).join(",") ===
    "search_parties,list_at_risk",
  "normalize dedupe",
);

const erp = await analyzeCapabilities(erpclient, { useLlm: false });
const erpAvail = erp.suggestions.filter((s) => s.available).map((s) => s.id);
assert(erpAvail.includes("search_parties"), "erp search_parties");
assert(erpAvail.includes("party_summary"), "erp party_summary");
assert(erpAvail.includes("find_open_orders"), "erp find_open_orders");
assert(!erpAvail.includes("search_customers"), "no legacy id in suggestions");
assert(erp.suggestedPack?.id === "commerce_ops", `erp pack=${erp.suggestedPack?.id}`);

const ret = await analyzeCapabilities(retentionLike, { useLlm: false });
const retAvail = ret.suggestions.filter((s) => s.available).map((s) => s.id);
assert(retAvail.includes("search_parties"), "ret search_parties");
assert(retAvail.includes("list_at_risk"), "ret list_at_risk");
assert(retAvail.includes("recent_events"), "ret recent_events");
assert(retAvail.includes("overdue_ledger"), "ret overdue_ledger");
assert(retAvail.includes("survey_overview"), "ret survey_overview");
assert(retAvail.includes("risk_series"), "ret risk_series");
assert(retAvail.includes("location_summary"), "ret location_summary");
assert(
  ret.suggestedPack?.id === "engagement_retention",
  `ret pack=${ret.suggestedPack?.id}`,
);

const tools = mcpToolNamesForCapability("search_members");
assert(tools.includes("cap_search_parties"), "mcp canonical");
assert(tools.includes("cap_search_members"), "mcp legacy alias");

console.log(
  JSON.stringify(
    {
      ok: true,
      erp: { domain: erp.profile.domain, pack: erp.suggestedPack, available: erpAvail },
      retention: {
        domain: ret.profile.domain,
        pack: ret.suggestedPack,
        available: retAvail,
      },
      mcpAliasTools: tools,
    },
    null,
    2,
  ),
);
