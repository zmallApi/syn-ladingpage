import type { SchemaSnapshot } from "../adapters/types.js";
import { findField, findResourceByRole } from "./heuristics.js";
import { requireExposedResource } from "./helpers.js";
import type {
  CapabilityHandlerContext,
  CapabilityTemplate,
  ResourceRoleBinding,
} from "./types.js";

function asRows(data: unknown[]): Record<string, unknown>[] {
  return data.filter((r) => r && typeof r === "object") as Record<string, unknown>[];
}

function partyFk(meta: { fields: Array<{ name: string }> }): string | undefined {
  return findField(meta, [
    "aluno_id",
    "cliente_id",
    "customer_id",
    "member_id",
    "student_id",
    "party_id",
    "paciente_id",
    "contato_id",
    "contact_id",
    "lead_id",
    "user_id",
  ]);
}

function locationFk(meta: { fields: Array<{ name: string }> }): string | undefined {
  return findField(meta, [
    "unidade_id",
    "location_id",
    "filial_id",
    "branch_id",
    "loja_id",
  ]);
}

const RISK_TOKENS = new Set([
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

function isRiskRow(
  r: Record<string, unknown>,
  bindings: Record<string, string>,
  minDelay: number,
): boolean {
  const classif = String(r[bindings.classifField] ?? "").toLowerCase();
  const trend = String(r[bindings.trendField] ?? "").toLowerCase();
  const delay = Number(r[bindings.delayField] ?? 0);
  const scoreRaw = r[bindings.scoreField];
  const score =
    scoreRaw == null || scoreRaw === "" ? 100 : Number(scoreRaw);
  const classHit = [...RISK_TOKENS].some((t) => classif.includes(t));
  const trendHit = [...RISK_TOKENS].some((t) => trend.includes(t));
  return classHit || trendHit || delay >= minDelay || score < 50;
}

function bindPartyRiskFields(
  schema: SchemaSnapshot,
  roles: ResourceRoleBinding[],
): Record<string, string> | null {
  const party = findResourceByRole(roles, "party");
  if (!party) return null;
  const meta = schema.resources.find((r) => r.name === party);
  if (!meta) return null;
  return {
    party,
    scoreField: findField(meta, ["score", "risco", "risk_score"]) ?? "",
    classifField: findField(meta, ["classif", "classificacao", "risk_class"]) ?? "",
    trendField: findField(meta, ["tendencia", "trend"]) ?? "",
    delayField: findField(meta, ["dias_atraso", "atraso"]) ?? "",
    freq30Field: findField(meta, ["freq_30", "frequencia_30"]) ?? "",
    statusField: findField(meta, ["status_contrato", "status", "stage"]) ?? "",
    nameField: findField(meta, ["nome", "name", "full_name"]) ?? "",
    pk: meta.primaryKey?.[0] ?? "id",
  };
}

async function listRelated(
  ctx: CapabilityHandlerContext,
  resourceName: string | undefined,
  fk: string | undefined,
  partyId: string,
  limit: number,
): Promise<Record<string, unknown>[]> {
  if (!resourceName || !fk) return [];
  if (!ctx.exposedResources.includes(resourceName)) return [];
  const resource = requireExposedResource(ctx, resourceName);
  return asRows(
    await ctx.list(resource, {
      limit,
      offset: 0,
      filter: { [fk]: partyId },
    }),
  );
}

/**
 * Phase C playbooks — composite tools (multiple list/getById, no raw SQL).
 */
export const playbookTemplates: CapabilityTemplate[] = [
  {
    id: "party_360",
    title: "Party 360",
    kind: "playbook",
    description:
      "Use when the agent needs a full picture of one person/org (cliente, aluno, contato): profile + optional risk fields + recent events + ledger items + survey responses. Args: partyId (required).",
    domain: "any",
    requiredRoles: ["party"],
    inputSchema: [
      {
        name: "partyId",
        type: "string",
        required: true,
        description: "ID da parte (cliente/aluno/contato)",
      },
      {
        name: "limit",
        type: "number",
        description: "Máximo de itens por seção (default 20)",
      },
    ],
    bind: (schema, roles) => {
      const base = bindPartyRiskFields(schema, roles);
      if (!base) return null;

      const event = findResourceByRole(roles, "event");
      const ledger = findResourceByRole(roles, "ledger");
      const survey = findResourceByRole(roles, "survey");
      const transaction = findResourceByRole(roles, "transaction");

      const eventMeta = event
        ? schema.resources.find((r) => r.name === event)
        : undefined;
      const ledgerMeta = ledger
        ? schema.resources.find((r) => r.name === ledger)
        : undefined;
      const surveyMeta = survey
        ? schema.resources.find((r) => r.name === survey)
        : undefined;
      const txMeta = transaction
        ? schema.resources.find((r) => r.name === transaction)
        : undefined;

      return {
        ...base,
        event: event ?? "",
        eventFk: eventMeta ? partyFk(eventMeta) ?? "" : "",
        ledger: ledger ?? "",
        ledgerFk: ledgerMeta ? partyFk(ledgerMeta) ?? "" : "",
        survey: survey ?? "",
        surveyFk: surveyMeta ? partyFk(surveyMeta) ?? "" : "",
        transaction: transaction ?? "",
        transactionFk: txMeta ? partyFk(txMeta) ?? "" : "",
        transactionTotal:
          txMeta
            ? findField(txMeta, ["total", "valor", "amount", "value"]) ?? ""
            : "",
      };
    },
    async run(ctx, args) {
      const partyId = String(args.partyId ?? args.memberId ?? args.customerId ?? "");
      if (!partyId) throw new Error("partyId obrigatório");
      const limit = Math.min(Number(args.limit ?? 20) || 20, 50);
      const party = requireExposedResource(ctx, ctx.bindings.party!);
      const profile = await ctx.getById(party, partyId);
      if (!profile) throw new Error(`Parte ${partyId} não encontrada`);

      const r = profile as Record<string, unknown>;
      const events = await listRelated(
        ctx,
        ctx.bindings.event,
        ctx.bindings.eventFk,
        partyId,
        limit,
      );
      const ledger = await listRelated(
        ctx,
        ctx.bindings.ledger,
        ctx.bindings.ledgerFk,
        partyId,
        limit,
      );
      const surveys = await listRelated(
        ctx,
        ctx.bindings.survey,
        ctx.bindings.surveyFk,
        partyId,
        limit,
      );
      const transactions = await listRelated(
        ctx,
        ctx.bindings.transaction,
        ctx.bindings.transactionFk,
        partyId,
        limit,
      );

      const totalField = ctx.bindings.transactionTotal;
      const totalSpent = totalField
        ? transactions.reduce((s, o) => s + Number(o[totalField] ?? 0), 0)
        : null;

      return {
        playbook: "party_360",
        partyId,
        party: profile,
        risk: {
          score: ctx.bindings.scoreField ? r[ctx.bindings.scoreField] : null,
          classif: ctx.bindings.classifField ? r[ctx.bindings.classifField] : null,
          tendencia: ctx.bindings.trendField ? r[ctx.bindings.trendField] : null,
          diasAtraso: ctx.bindings.delayField ? r[ctx.bindings.delayField] : null,
          status: ctx.bindings.statusField ? r[ctx.bindings.statusField] : null,
        },
        sections: {
          events: { count: events.length, items: events },
          ledger: { count: ledger.length, items: ledger },
          surveys: { count: surveys.length, items: surveys },
          transactions: {
            count: transactions.length,
            totalSpent,
            items: transactions,
          },
        },
        actionsHint: [
          events.length === 0 ? "Sem eventos recentes — considerar reengajamento" : null,
          ledger.length > 0 ? "Há itens de ledger — revisar inadimplência" : null,
          surveys.length > 0 ? "Há pesquisas — revisar sentimento/NPS" : null,
        ].filter(Boolean),
      };
    },
  },
  {
    id: "attention_queue",
    title: "Fila de atenção",
    kind: "playbook",
    description:
      "Use to answer 'who needs attention now?'. Ranks parties by risk/delay and optionally lack of recent events or overdue ledger. Args: limit (default 20), minDelayDays (default 1), quietDays (default 14).",
    domain: "any",
    requiredRoles: ["party"],
    inputSchema: [
      { name: "limit", type: "number", description: "Máximo na fila (default 20)" },
      {
        name: "minDelayDays",
        type: "number",
        description: "Mínimo dias de atraso para sinalizar (default 1)",
      },
      {
        name: "quietDays",
        type: "number",
        description: "Dias sem evento = quietude (default 14)",
      },
    ],
    bind: (schema, roles) => {
      const base = bindPartyRiskFields(schema, roles);
      if (!base) return null;
      // Need at least one risk signal OR event/ledger for a useful queue
      const hasRisk =
        Boolean(base.scoreField) ||
        Boolean(base.classifField) ||
        Boolean(base.trendField) ||
        Boolean(base.delayField);
      const event = findResourceByRole(roles, "event");
      const ledger = findResourceByRole(roles, "ledger");
      if (!hasRisk && !event && !ledger) return null;

      const eventMeta = event
        ? schema.resources.find((r) => r.name === event)
        : undefined;
      const ledgerMeta = ledger
        ? schema.resources.find((r) => r.name === ledger)
        : undefined;

      return {
        ...base,
        event: event ?? "",
        eventFk: eventMeta ? partyFk(eventMeta) ?? "" : "",
        eventDate:
          eventMeta
            ? findField(eventMeta, [
                "data_checkin",
                "checkin_at",
                "occurred_at",
                "created_at",
                "data",
              ]) ?? ""
            : "",
        ledger: ledger ?? "",
        ledgerFk: ledgerMeta ? partyFk(ledgerMeta) ?? "" : "",
        ledgerStatus:
          ledgerMeta ? findField(ledgerMeta, ["status", "situacao"]) ?? "" : "",
        ledgerDelay:
          ledgerMeta ? findField(ledgerMeta, ["dias_atraso", "atraso"]) ?? "" : "",
      };
    },
    async run(ctx, args) {
      const limit = Math.min(Number(args.limit ?? 20) || 20, 50);
      const minDelay = Number(args.minDelayDays ?? 1);
      const quietDays = Number(args.quietDays ?? 14);
      const party = requireExposedResource(ctx, ctx.bindings.party!);
      const parties = asRows(await ctx.list(party, { limit: 100, offset: 0 }));
      const pk = ctx.bindings.pk || "id";
      const now = Date.now();

      const overdueStatuses = new Set([
        "atrasado",
        "atrasada",
        "pendente",
        "overdue",
        "vencido",
        "inadimplente",
        "open",
      ]);

      const queue = [];
      for (const p of parties) {
        const partyId = String(p[pk] ?? "");
        if (!partyId) continue;

        const reasons: string[] = [];
        let score = 0;

        if (isRiskRow(p, ctx.bindings, minDelay)) {
          reasons.push("risk_signals");
          score += 40;
          const delay = Number(p[ctx.bindings.delayField] ?? 0);
          if (delay > 0) score += Math.min(30, delay);
        }

        if (ctx.bindings.event && ctx.bindings.eventFk) {
          const events = await listRelated(
            ctx,
            ctx.bindings.event,
            ctx.bindings.eventFk,
            partyId,
            20,
          );
          let lastTs = 0;
          for (const e of events) {
            const raw = ctx.bindings.eventDate
              ? e[ctx.bindings.eventDate]
              : undefined;
            const t = raw ? Date.parse(String(raw)) : 0;
            if (Number.isFinite(t) && t > lastTs) lastTs = t;
          }
          if (events.length === 0) {
            reasons.push("no_events");
            score += 25;
          } else if (lastTs > 0) {
            const days = (now - lastTs) / (1000 * 60 * 60 * 24);
            if (days >= quietDays) {
              reasons.push("quiet_period");
              score += Math.min(35, Math.round(days));
            }
          }
        }

        if (ctx.bindings.ledger && ctx.bindings.ledgerFk) {
          const items = await listRelated(
            ctx,
            ctx.bindings.ledger,
            ctx.bindings.ledgerFk,
            partyId,
            30,
          );
          const overdue = items.filter((row) => {
            const st = String(row[ctx.bindings.ledgerStatus] ?? "").toLowerCase();
            const d = Number(row[ctx.bindings.ledgerDelay] ?? 0);
            return overdueStatuses.has(st) || d > 0;
          });
          if (overdue.length) {
            reasons.push("overdue_ledger");
            score += 20 + Math.min(20, overdue.length * 2);
          }
        }

        if (!reasons.length) continue;
        queue.push({
          partyId,
          name: ctx.bindings.nameField ? p[ctx.bindings.nameField] : null,
          score,
          reasons,
          party: p,
        });
      }

      queue.sort((a, b) => b.score - a.score);
      return {
        playbook: "attention_queue",
        count: queue.length,
        queue: queue.slice(0, limit),
        criteria: { minDelayDays: minDelay, quietDays },
      };
    },
  },
  {
    id: "location_health",
    title: "Saúde do local",
    kind: "playbook",
    description:
      "Use for unit/branch health: location metrics plus optional risk_snapshot, survey and ledger samples filtered by location when FKs exist. Args: locationId optional (if omitted, returns a sample of locations).",
    domain: "any",
    requiredRoles: ["location"],
    inputSchema: [
      {
        name: "locationId",
        type: "string",
        description: "ID da unidade (opcional — sem ID lista amostra)",
      },
      { name: "limit", type: "number", description: "Máximo (default 10)" },
    ],
    bind: (schema, roles) => {
      const location = findResourceByRole(roles, "location");
      if (!location) return null;
      const meta = schema.resources.find((r) => r.name === location);
      if (!meta) return null;

      const risk = findResourceByRole(roles, "risk_snapshot");
      const survey = findResourceByRole(roles, "survey");
      const ledger = findResourceByRole(roles, "ledger");
      const party = findResourceByRole(roles, "party");

      const riskMeta = risk
        ? schema.resources.find((r) => r.name === risk)
        : undefined;
      const surveyMeta = survey
        ? schema.resources.find((r) => r.name === survey)
        : undefined;
      const ledgerMeta = ledger
        ? schema.resources.find((r) => r.name === ledger)
        : undefined;
      const partyMeta = party
        ? schema.resources.find((r) => r.name === party)
        : undefined;

      return {
        location,
        locationPk: meta.primaryKey?.[0] ?? "id",
        nameField: findField(meta, ["nome", "name", "slug"]) ?? "",
        studentsField: findField(meta, ["n_alunos", "alunos", "members"]) ?? "",
        churnField: findField(meta, ["churn_base", "churn"]) ?? "",
        npsField: findField(meta, ["nps_base", "nps"]) ?? "",
        risk: risk ?? "",
        riskLocationFk: riskMeta ? locationFk(riskMeta) ?? "" : "",
        survey: survey ?? "",
        surveyLocationFk: surveyMeta ? locationFk(surveyMeta) ?? "" : "",
        ledger: ledger ?? "",
        ledgerLocationFk: ledgerMeta ? locationFk(ledgerMeta) ?? "" : "",
        party: party ?? "",
        partyLocationFk: partyMeta ? locationFk(partyMeta) ?? "" : "",
      };
    },
    async run(ctx, args) {
      const location = requireExposedResource(ctx, ctx.bindings.location!);
      const limit = Math.min(Number(args.limit ?? 10) || 10, 30);
      const locationId = args.locationId != null ? String(args.locationId) : "";
      const pk = ctx.bindings.locationPk || "id";

      const locations = locationId
        ? [
            await ctx.getById(location, locationId),
          ].filter(Boolean)
        : asRows(await ctx.list(location, { limit, offset: 0 }));

      const reports = [];
      for (const loc of locations) {
        if (!loc || typeof loc !== "object") continue;
        const row = loc as Record<string, unknown>;
        const id = String(row[pk] ?? locationId);
        if (!id) continue;

        const riskRows =
          ctx.bindings.risk && ctx.bindings.riskLocationFk
            ? asRows(
                await ctx.list(requireExposedResource(ctx, ctx.bindings.risk), {
                  limit: 20,
                  offset: 0,
                  filter: { [ctx.bindings.riskLocationFk]: id },
                }),
              )
            : [];

        const surveyRows =
          ctx.bindings.survey && ctx.bindings.surveyLocationFk
            ? asRows(
                await ctx.list(requireExposedResource(ctx, ctx.bindings.survey), {
                  limit: 20,
                  offset: 0,
                  filter: { [ctx.bindings.surveyLocationFk]: id },
                }),
              )
            : [];

        const ledgerRows =
          ctx.bindings.ledger && ctx.bindings.ledgerLocationFk
            ? asRows(
                await ctx.list(requireExposedResource(ctx, ctx.bindings.ledger), {
                  limit: 20,
                  offset: 0,
                  filter: { [ctx.bindings.ledgerLocationFk]: id },
                }),
              )
            : [];

        const partyCount =
          ctx.bindings.party && ctx.bindings.partyLocationFk
            ? (
                await ctx.list(requireExposedResource(ctx, ctx.bindings.party), {
                  limit: 100,
                  offset: 0,
                  filter: { [ctx.bindings.partyLocationFk]: id },
                })
              ).length
            : null;

        reports.push({
          locationId: id,
          location: row,
          metrics: {
            name: ctx.bindings.nameField ? row[ctx.bindings.nameField] : null,
            membersField: ctx.bindings.studentsField
              ? row[ctx.bindings.studentsField]
              : null,
            membersCounted: partyCount,
            churn: ctx.bindings.churnField ? row[ctx.bindings.churnField] : null,
            nps: ctx.bindings.npsField ? row[ctx.bindings.npsField] : null,
          },
          related: {
            riskSnapshots: riskRows.slice(0, 5),
            surveys: surveyRows.slice(0, 5),
            ledger: ledgerRows.slice(0, 5),
          },
        });
      }

      return {
        playbook: "location_health",
        count: reports.length,
        locations: reports,
      };
    },
  },
];
