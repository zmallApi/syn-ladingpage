import type { SchemaSnapshot } from "../adapters/types.js";
import {
  legacyIdsForCanonical,
  resolveCapabilityId,
} from "./aliases.js";
import { findField, findResourceByRole } from "./heuristics.js";
import { requireExposedResource } from "./helpers.js";
import { playbookTemplates } from "./playbooks.js";
import type {
  CapabilityTemplate,
  ResourceRoleBinding,
} from "./types.js";

function asRows(data: unknown[]): Record<string, unknown>[] {
  return data.filter((r) => r && typeof r === "object") as Record<string, unknown>[];
}

function partyFkCandidates(meta: { fields: Array<{ name: string }> }): string | undefined {
  return findField(meta, [
    "aluno_id",
    "cliente_id",
    "customer_id",
    "member_id",
    "student_id",
    "party_id",
    "paciente_id",
    "user_id",
  ]);
}

export const capabilityTemplates: CapabilityTemplate[] = [
  {
    id: "explain_business_model",
    title: "Explicar modelo de negócio",
    description:
      "Resume o domínio detectado, papéis das tabelas e sinais do schema (só metadados).",
    domain: "any",
    requiredRoles: [],
    inputSchema: [],
    bind: () => ({}),
    async run(ctx) {
      return {
        note: "Somente metadados — nenhum dado de negócio foi lido.",
        resources: ctx.schema.resources.map((r) => ({
          name: r.name,
          kind: r.kind,
          fields: r.fields.map((f) => f.name),
          primaryKey: r.primaryKey ?? [],
        })),
        bindings: ctx.bindings,
      };
    },
  },

  // --- generic catalog (Phase B) ---
  {
    id: "search_parties",
    title: "Buscar partes",
    description:
      "Use to find a person/org by name, email or code (cliente/aluno/contato). Args: query (required), limit. Returns matching parties.",
    domain: "any",
    kind: "capability",
    requiredRoles: ["party"],
    inputSchema: [
      {
        name: "query",
        type: "string",
        required: true,
        description: "Texto para buscar em nome/email/código",
      },
      { name: "limit", type: "number", description: "Máximo (default 20)" },
    ],
    bind: (schema, roles) => {
      const party = findResourceByRole(roles, "party");
      if (!party) return null;
      const meta = schema.resources.find((r) => r.name === party);
      if (!meta) return null;
      const nameField = findField(meta, ["nome", "name", "razao_social", "full_name"]);
      const emailField = findField(meta, ["email", "e_mail"]);
      const codeField = findField(meta, ["matricula", "codigo", "code", "sku"]);
      if (!nameField && !emailField && !codeField) return null;
      return {
        party,
        nameField: nameField ?? "",
        emailField: emailField ?? "",
        codeField: codeField ?? "",
      };
    },
    async run(ctx, args) {
      const q = String(args.query ?? "").trim().toLowerCase();
      if (!q) throw new Error("query obrigatória");
      const party = requireExposedResource(ctx, ctx.bindings.party!);
      const limit = Math.min(Number(args.limit ?? 20) || 20, 100);
      const rows = asRows(await ctx.list(party, { limit: 100, offset: 0 }));
      const { nameField, emailField, codeField } = ctx.bindings;
      const matched = rows.filter((r) => {
        const name = nameField ? String(r[nameField] ?? "").toLowerCase() : "";
        const email = emailField ? String(r[emailField] ?? "").toLowerCase() : "";
        const code = codeField ? String(r[codeField] ?? "").toLowerCase() : "";
        return name.includes(q) || email.includes(q) || code.includes(q);
      });
      return { count: matched.length, parties: matched.slice(0, limit) };
    },
  },
  {
    id: "party_summary",
    title: "Resumo da parte",
    description:
      "Use for a quick profile of one party: risk fields if present and related transactions if pedidos exist. Prefer party_360 for a fuller composite view. Args: partyId.",
    domain: "any",
    kind: "capability",
    requiredRoles: ["party"],
    inputSchema: [
      {
        name: "partyId",
        type: "string",
        required: true,
        description: "ID da parte (também aceita customerId/memberId)",
      },
    ],
    bind: (schema, roles) => {
      const party = findResourceByRole(roles, "party");
      if (!party) return null;
      const meta = schema.resources.find((r) => r.name === party);
      if (!meta) return null;
      const transaction = findResourceByRole(roles, "transaction");
      let orderCustomerFk = "";
      let orderTotalField = "";
      if (transaction) {
        const orderMeta = schema.resources.find((r) => r.name === transaction);
        if (orderMeta) {
          orderCustomerFk = partyFkCandidates(orderMeta) ?? "";
          orderTotalField =
            findField(orderMeta, ["total", "valor", "amount", "value"]) ?? "";
        }
      }
      return {
        party,
        transaction: transaction && orderCustomerFk ? transaction : "",
        orderCustomerFk,
        orderTotalField,
        scoreField: findField(meta, ["score", "risco", "risk_score"]) ?? "",
        classifField: findField(meta, ["classif", "classificacao", "risk_class"]) ?? "",
        trendField: findField(meta, ["tendencia", "trend"]) ?? "",
        delayField: findField(meta, ["dias_atraso", "atraso"]) ?? "",
        freq30Field: findField(meta, ["freq_30", "frequencia_30"]) ?? "",
        statusField: findField(meta, ["status_contrato", "status"]) ?? "",
      };
    },
    async run(ctx, args) {
      const partyId = String(
        args.partyId ?? args.customerId ?? args.memberId ?? "",
      );
      if (!partyId) throw new Error("partyId obrigatório");
      const party = requireExposedResource(ctx, ctx.bindings.party!);
      const row = await ctx.getById(party, partyId);
      if (!row) throw new Error(`Parte ${partyId} não encontrada`);
      const r = row as Record<string, unknown>;

      let transactions: Record<string, unknown>[] = [];
      let totalSpent: number | null = null;
      if (ctx.bindings.transaction && ctx.bindings.orderCustomerFk) {
        const tx = requireExposedResource(ctx, ctx.bindings.transaction);
        transactions = asRows(
          await ctx.list(tx, {
            limit: 100,
            offset: 0,
            filter: { [ctx.bindings.orderCustomerFk]: partyId },
          }),
        );
        const totalField = ctx.bindings.orderTotalField;
        totalSpent = totalField
          ? transactions.reduce((sum, o) => sum + Number(o[totalField] ?? 0), 0)
          : null;
      }

      return {
        party: row,
        risk: {
          score: ctx.bindings.scoreField ? r[ctx.bindings.scoreField] : null,
          classif: ctx.bindings.classifField ? r[ctx.bindings.classifField] : null,
          tendencia: ctx.bindings.trendField ? r[ctx.bindings.trendField] : null,
          diasAtraso: ctx.bindings.delayField ? r[ctx.bindings.delayField] : null,
          freq30: ctx.bindings.freq30Field ? r[ctx.bindings.freq30Field] : null,
          status: ctx.bindings.statusField ? r[ctx.bindings.statusField] : null,
        },
        transactionCount: transactions.length,
        totalSpent,
        transactions: transactions.slice(0, 20),
      };
    },
  },
  {
    id: "list_at_risk",
    title: "Partes em risco",
    description:
      "Use to list parties with risk classification/trend, low score or payment delay. For a ranked queue combining events/ledger, prefer attention_queue. Args: limit, minDelayDays.",
    domain: "any",
    kind: "capability",
    requiredRoles: ["party"],
    inputSchema: [
      { name: "limit", type: "number", description: "Máximo (default 30)" },
      {
        name: "minDelayDays",
        type: "number",
        description: "Mínimo de dias de atraso (default 1)",
      },
    ],
    bind: (schema, roles) => {
      const party = findResourceByRole(roles, "party");
      if (!party) return null;
      const meta = schema.resources.find((r) => r.name === party);
      if (!meta) return null;
      const classifField = findField(meta, ["classif", "classificacao"]);
      const trendField = findField(meta, ["tendencia", "trend"]);
      const delayField = findField(meta, ["dias_atraso", "atraso"]);
      const scoreField = findField(meta, ["score", "risco"]);
      if (!classifField && !trendField && !delayField && !scoreField) return null;
      return {
        party,
        classifField: classifField ?? "",
        trendField: trendField ?? "",
        delayField: delayField ?? "",
        scoreField: scoreField ?? "",
      };
    },
    async run(ctx, args) {
      const party = requireExposedResource(ctx, ctx.bindings.party!);
      const limit = Math.min(Number(args.limit ?? 30) || 30, 100);
      const minDelay = Number(args.minDelayDays ?? 1);
      const rows = asRows(await ctx.list(party, { limit: 100, offset: 0 }));
      const riskTokens = new Set([
        "risco",
        "risk",
        "alto",
        "high",
        "critico",
        "critical",
        "queda",
        "down",
        "churn",
        "vermelho",
        "red",
      ]);
      const atRisk = rows.filter((r) => {
        const classif = String(r[ctx.bindings.classifField] ?? "").toLowerCase();
        const trend = String(r[ctx.bindings.trendField] ?? "").toLowerCase();
        const delay = Number(r[ctx.bindings.delayField] ?? 0);
        const score = Number(r[ctx.bindings.scoreField] ?? 100);
        const classHit = [...riskTokens].some((t) => classif.includes(t));
        const trendHit = [...riskTokens].some((t) => trend.includes(t));
        return classHit || trendHit || delay >= minDelay || score < 50;
      });
      return { count: atRisk.length, parties: atRisk.slice(0, limit) };
    },
  },
  {
    id: "recent_events",
    title: "Eventos recentes da parte",
    description: "Lista eventos (check-ins, visitas, etc.) ligados a uma parte.",
    domain: "any",
    requiredRoles: ["party", "event"],
    inputSchema: [
      {
        name: "partyId",
        type: "string",
        required: true,
        description: "ID da parte (também aceita memberId)",
      },
      { name: "limit", type: "number", description: "Máximo (default 30)" },
    ],
    bind: (schema, roles) => {
      const party = findResourceByRole(roles, "party");
      const event = findResourceByRole(roles, "event");
      if (!party || !event) return null;
      const meta = schema.resources.find((r) => r.name === event);
      if (!meta) return null;
      const fk = partyFkCandidates(meta);
      if (!fk) return null;
      return {
        party,
        event,
        partyFk: fk,
        dateField:
          findField(meta, ["data_checkin", "checkin_at", "occurred_at", "created_at"]) ??
          "",
      };
    },
    async run(ctx, args) {
      const partyId = String(args.partyId ?? args.memberId ?? "");
      if (!partyId) throw new Error("partyId obrigatório");
      requireExposedResource(ctx, ctx.bindings.party!);
      const event = requireExposedResource(ctx, ctx.bindings.event!);
      const limit = Math.min(Number(args.limit ?? 30) || 30, 100);
      const rows = asRows(
        await ctx.list(event, {
          limit: 100,
          offset: 0,
          filter: { [ctx.bindings.partyFk!]: partyId },
        }),
      );
      return { partyId, count: rows.length, events: rows.slice(0, limit) };
    },
  },
  {
    id: "overdue_ledger",
    title: "Ledger em atraso",
    description: "Lista cobranças/financeiro com status em atraso ou pendente.",
    domain: "any",
    requiredRoles: ["ledger"],
    inputSchema: [
      { name: "limit", type: "number", description: "Máximo (default 40)" },
    ],
    bind: (schema, roles) => {
      const ledger = findResourceByRole(roles, "ledger");
      if (!ledger) return null;
      const meta = schema.resources.find((r) => r.name === ledger);
      if (!meta) return null;
      const statusField = findField(meta, ["status", "situacao"]);
      const delayField = findField(meta, ["dias_atraso", "atraso"]);
      if (!statusField && !delayField) return null;
      return {
        ledger,
        statusField: statusField ?? "",
        delayField: delayField ?? "",
        partyFk: partyFkCandidates(meta) ?? "",
      };
    },
    async run(ctx, args) {
      const ledger = requireExposedResource(ctx, ctx.bindings.ledger!);
      const limit = Math.min(Number(args.limit ?? 40) || 40, 100);
      const rows = asRows(await ctx.list(ledger, { limit: 100, offset: 0 }));
      const open = new Set([
        "atrasado",
        "atrasada",
        "pendente",
        "open",
        "overdue",
        "vencido",
        "inadimplente",
      ]);
      const overdue = rows.filter((r) => {
        const status = String(r[ctx.bindings.statusField] ?? "").toLowerCase();
        const delay = Number(r[ctx.bindings.delayField] ?? 0);
        return open.has(status) || delay > 0;
      });
      return { count: overdue.length, items: overdue.slice(0, limit) };
    },
  },
  {
    id: "survey_overview",
    title: "Visão de pesquisas",
    description: "Amostra de respostas de survey/NPS (score e sentimento).",
    domain: "any",
    requiredRoles: ["survey"],
    inputSchema: [
      { name: "limit", type: "number", description: "Máximo (default 40)" },
    ],
    bind: (schema, roles) => {
      const survey = findResourceByRole(roles, "survey");
      if (!survey) return null;
      const meta = schema.resources.find((r) => r.name === survey);
      if (!meta) return null;
      const scoreField = findField(meta, ["score", "nota", "nps"]);
      if (!scoreField) return null;
      return {
        survey,
        scoreField,
        sentimentField: findField(meta, ["sentimento", "sentiment"]) ?? "",
        partyFk: partyFkCandidates(meta) ?? "",
      };
    },
    async run(ctx, args) {
      const survey = requireExposedResource(ctx, ctx.bindings.survey!);
      const limit = Math.min(Number(args.limit ?? 40) || 40, 100);
      const rows = asRows(await ctx.list(survey, { limit: 100, offset: 0 }));
      const scoreField = ctx.bindings.scoreField!;
      const scores = rows
        .map((r) => Number(r[scoreField]))
        .filter((n) => Number.isFinite(n));
      const avg =
        scores.length > 0
          ? scores.reduce((a, b) => a + b, 0) / scores.length
          : null;
      return {
        count: rows.length,
        averageScore: avg,
        responses: rows.slice(0, limit),
      };
    },
  },
  {
    id: "risk_series",
    title: "Série de risco",
    description: "Últimos snapshots de risco/churn histórico.",
    domain: "any",
    requiredRoles: ["risk_snapshot"],
    inputSchema: [
      { name: "limit", type: "number", description: "Máximo (default 24)" },
    ],
    bind: (_schema, roles) => {
      const risk = findResourceByRole(roles, "risk_snapshot");
      if (!risk) return null;
      return { risk };
    },
    async run(ctx, args) {
      const risk = requireExposedResource(ctx, ctx.bindings.risk!);
      const limit = Math.min(Number(args.limit ?? 24) || 24, 100);
      const rows = asRows(await ctx.list(risk, { limit: 100, offset: 0 }));
      return { count: rows.length, snapshots: rows.slice(0, limit) };
    },
  },
  {
    id: "location_summary",
    title: "Resumo do local",
    description: "Retorna uma unidade/filial e métricas se existirem no schema.",
    domain: "any",
    requiredRoles: ["location"],
    inputSchema: [
      {
        name: "locationId",
        type: "string",
        required: true,
        description: "ID da unidade/local",
      },
    ],
    bind: (schema, roles) => {
      const location = findResourceByRole(roles, "location");
      if (!location) return null;
      const meta = schema.resources.find((r) => r.name === location);
      if (!meta) return null;
      return {
        location,
        nameField: findField(meta, ["nome", "name", "slug"]) ?? "",
        studentsField: findField(meta, ["n_alunos", "alunos", "members"]) ?? "",
        churnField: findField(meta, ["churn_base", "churn"]) ?? "",
        npsField: findField(meta, ["nps_base", "nps"]) ?? "",
      };
    },
    async run(ctx, args) {
      const locationId = String(args.locationId ?? "");
      if (!locationId) throw new Error("locationId obrigatório");
      const location = requireExposedResource(ctx, ctx.bindings.location!);
      const row = await ctx.getById(location, locationId);
      if (!row) throw new Error(`Local ${locationId} não encontrado`);
      const r = row as Record<string, unknown>;
      return {
        location: row,
        metrics: {
          name: ctx.bindings.nameField ? r[ctx.bindings.nameField] : null,
          members: ctx.bindings.studentsField
            ? r[ctx.bindings.studentsField]
            : null,
          churn: ctx.bindings.churnField ? r[ctx.bindings.churnField] : null,
          nps: ctx.bindings.npsField ? r[ctx.bindings.npsField] : null,
        },
      };
    },
  },

  // --- ERP extras (still generic roles) ---
  {
    id: "find_open_orders",
    title: "Pedidos abertos",
    description: "Lista pedidos com status aberto/pendente/em andamento.",
    domain: "erp_commerce",
    requiredRoles: ["transaction"],
    inputSchema: [
      { name: "limit", type: "number", description: "Máximo (default 30)" },
    ],
    bind: (schema, roles) => {
      const order = findResourceByRole(roles, "transaction");
      if (!order) return null;
      const meta = schema.resources.find((r) => r.name === order);
      if (!meta) return null;
      const statusField = findField(meta, ["status", "situacao", "state"]);
      if (!statusField) return null;
      return { order, statusField };
    },
    async run(ctx, args) {
      const order = requireExposedResource(ctx, ctx.bindings.order!);
      const limit = Math.min(Number(args.limit ?? 30) || 30, 100);
      const statusField = ctx.bindings.statusField!;
      const openValues = new Set([
        "aberto",
        "aberta",
        "pendente",
        "pending",
        "open",
        "em_andamento",
        "processing",
        "novo",
        "new",
      ]);
      const rows = asRows(await ctx.list(order, { limit: 100, offset: 0 }));
      const open = rows.filter((r) =>
        openValues.has(String(r[statusField] ?? "").toLowerCase()),
      );
      return { count: open.length, statusField, orders: open.slice(0, limit) };
    },
  },
  {
    id: "low_inventory",
    title: "Estoque baixo",
    description: "Produtos com estoque abaixo do limiar informado.",
    domain: "erp_commerce",
    requiredRoles: ["catalog_item"],
    inputSchema: [
      {
        name: "threshold",
        type: "number",
        description: "Limiar de estoque (default 10)",
      },
    ],
    bind: (schema, roles) => {
      const product = findResourceByRole(roles, "catalog_item");
      if (!product) return null;
      const meta = schema.resources.find((r) => r.name === product);
      if (!meta) return null;
      const stock = findField(meta, [
        "estoque",
        "stock",
        "inventory",
        "quantidade",
        "qty",
      ]);
      if (!stock) return null;
      return { product, stockField: stock };
    },
    async run(ctx, args) {
      const product = requireExposedResource(ctx, ctx.bindings.product!);
      const threshold = Number(args.threshold ?? 10);
      const stockField = ctx.bindings.stockField!;
      const rows = asRows(await ctx.list(product, { limit: 100, offset: 0 }));
      const low = rows.filter((r) => Number(r[stockField] ?? 0) < threshold);
      return { threshold, stockField, count: low.length, products: low };
    },
  },
  {
    id: "top_products",
    title: "Produtos mais vendidos",
    description: "Ranking aproximado por quantidade em itens de pedido.",
    domain: "erp_commerce",
    requiredRoles: ["catalog_item", "line_item"],
    inputSchema: [
      { name: "limit", type: "number", description: "Top N (default 10)" },
    ],
    bind: (schema, roles) => {
      const product = findResourceByRole(roles, "catalog_item");
      const lineItem = findResourceByRole(roles, "line_item");
      if (!product || !lineItem) return null;
      const li = schema.resources.find((r) => r.name === lineItem);
      if (!li) return null;
      const productFk = findField(li, ["produto_id", "product_id", "item_id"]);
      const qty = findField(li, ["quantidade", "qty", "quantity", "qtd"]);
      if (!productFk) return null;
      return {
        product,
        lineItem,
        productFk,
        qtyField: qty ?? "",
      };
    },
    async run(ctx, args) {
      const lineItem = requireExposedResource(ctx, ctx.bindings.lineItem!);
      const product = requireExposedResource(ctx, ctx.bindings.product!);
      const limit = Math.min(Number(args.limit ?? 10) || 10, 50);
      const items = asRows(await ctx.list(lineItem, { limit: 100, offset: 0 }));
      const productFk = ctx.bindings.productFk!;
      const qtyField = ctx.bindings.qtyField;
      const totals = new Map<string, number>();
      for (const item of items) {
        const pid = String(item[productFk] ?? "");
        if (!pid) continue;
        const qty = qtyField ? Number(item[qtyField] ?? 1) : 1;
        totals.set(pid, (totals.get(pid) ?? 0) + qty);
      }
      const ranked = [...totals.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, limit);

      const products = [];
      for (const [id, qty] of ranked) {
        const p = await ctx.getById(product, id);
        products.push({ productId: id, quantitySold: qty, product: p });
      }
      return { products };
    },
  },
  ...playbookTemplates,
];

export function getTemplate(id: string): CapabilityTemplate | undefined {
  const resolved = resolveCapabilityId(id);
  return capabilityTemplates.find((t) => t.id === resolved);
}

export function listTemplatesForDomain(domain: string): CapabilityTemplate[] {
  return capabilityTemplates.filter(
    (t) => t.domain === "any" || t.domain === domain,
  );
}

export function bindTemplate(
  template: CapabilityTemplate,
  schema: SchemaSnapshot,
  roles: ResourceRoleBinding[],
): Record<string, string> | null {
  return template.bind(schema, roles);
}

/** Tool names to register on MCP for an active capability id (canonical + legacy aliases). */
export function mcpToolNamesForCapability(activeId: string): string[] {
  const canonical = resolveCapabilityId(activeId);
  const names = [`cap_${canonical}`];
  for (const legacy of legacyIdsForCanonical(canonical)) {
    names.push(`cap_${legacy}`);
  }
  // If project still has legacy id stored, ensure that exact name exists
  if (activeId !== canonical) {
    names.push(`cap_${activeId}`);
  }
  return [...new Set(names)];
}
