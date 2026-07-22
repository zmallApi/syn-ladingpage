/**
 * Phase C smoke: playbooks on 3 fixtures (erp, retention, CRM-lite).
 * Run: npx tsx scripts/smoke-phase-c-playbooks.mjs
 */
import { analyzeCapabilities } from "../packages/core/src/capabilities/analyze.ts";
import { getTemplate } from "../packages/core/src/capabilities/templates.ts";

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
        { name: "score", dataType: "integer", nullable: true },
        { name: "classif", dataType: "text", nullable: true },
        { name: "dias_atraso", dataType: "integer", nullable: true },
        { name: "unidade_id", dataType: "uuid", nullable: true },
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
      ],
    },
    {
      name: "churn_historico",
      kind: "table",
      primaryKey: ["id"],
      fields: [
        { name: "id", dataType: "uuid", nullable: false },
        { name: "unidade_id", dataType: "uuid", nullable: true },
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
        { name: "churn_base", dataType: "numeric", nullable: true },
      ],
    },
  ],
};

/** 3rd fixture — CRM-lite (not fitness, not erp commerce inventory) */
const crmLite = {
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
        { name: "score", dataType: "integer", nullable: true },
        { name: "classif", dataType: "text", nullable: true },
      ],
    },
    {
      name: "oportunidades",
      kind: "table",
      primaryKey: ["id"],
      fields: [
        { name: "id", dataType: "integer", nullable: false },
        { name: "cliente_id", dataType: "integer", nullable: false },
        { name: "titulo", dataType: "text", nullable: false },
        { name: "stage", dataType: "text", nullable: true },
      ],
    },
    {
      name: "atividades",
      kind: "table",
      primaryKey: ["id"],
      fields: [
        { name: "id", dataType: "integer", nullable: false },
        { name: "cliente_id", dataType: "integer", nullable: false },
        { name: "tipo", dataType: "text", nullable: true },
        { name: "occurred_at", dataType: "timestamptz", nullable: false },
      ],
    },
    {
      name: "faturas",
      kind: "table",
      primaryKey: ["id"],
      fields: [
        { name: "id", dataType: "integer", nullable: false },
        { name: "cliente_id", dataType: "integer", nullable: false },
        { name: "valor", dataType: "numeric", nullable: false },
        { name: "status", dataType: "text", nullable: false },
        { name: "dias_atraso", dataType: "integer", nullable: true },
      ],
    },
  ],
};

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function avail(result) {
  return result.suggestions.filter((s) => s.available).map((s) => s.id);
}

assert(getTemplate("party_360")?.kind === "playbook", "party_360 is playbook");
assert(getTemplate("attention_queue")?.kind === "playbook", "attention_queue");
assert(getTemplate("location_health")?.kind === "playbook", "location_health");

const erp = await analyzeCapabilities(erpclient, { useLlm: false });
const erpA = avail(erp);
assert(erpA.includes("party_360"), "erp party_360");
assert(erp.profile.domain === "erp_commerce", `erp domain ${erp.profile.domain}`);

const ret = await analyzeCapabilities(retentionLike, { useLlm: false });
const retA = avail(ret);
assert(retA.includes("party_360"), "ret party_360");
assert(retA.includes("attention_queue"), "ret attention_queue");
assert(retA.includes("location_health"), "ret location_health");
assert(
  ret.suggestedPack?.capabilityIds.includes("attention_queue"),
  "ret pack includes attention_queue",
);

const crm = await analyzeCapabilities(crmLite, { useLlm: false });
const crmA = avail(crm);
assert(crmA.includes("party_360"), "crm party_360");
assert(crmA.includes("recent_events"), "crm recent_events");
assert(crmA.includes("attention_queue"), "crm attention_queue");
assert(crmA.includes("overdue_ledger"), "crm overdue_ledger");
assert(
  crm.profile.domain === "crm" || crm.suggestedPack?.id === "crm_pipeline",
  `crm domain/pack expected crm-ish, got domain=${crm.profile.domain} pack=${crm.suggestedPack?.id}`,
);

console.log(
  JSON.stringify(
    {
      ok: true,
      erp: { domain: erp.profile.domain, playbooks: erpA.filter((id) => id.includes("360") || id.includes("attention") || id.includes("location_health")), available: erpA, pack: erp.suggestedPack?.id },
      retention: {
        domain: ret.profile.domain,
        playbooks: retA.filter((id) =>
          ["party_360", "attention_queue", "location_health"].includes(id),
        ),
        pack: ret.suggestedPack?.id,
      },
      crm: {
        domain: crm.profile.domain,
        roles: Object.fromEntries(
          crm.profile.resourceRoles
            .filter((r) => r.confidence >= 0.45)
            .map((r) => [r.resource, r.role]),
        ),
        playbooks: crmA.filter((id) =>
          ["party_360", "attention_queue", "location_health"].includes(id),
        ),
        available: crmA,
        pack: crm.suggestedPack?.id,
      },
    },
    null,
    2,
  ),
);
