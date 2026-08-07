import type { KnowledgeLayerPort } from "../knowledge/context.js";
import { loadBusinessKnowledge } from "../knowledge/businessKnowledge.js";
import {
  emptyMissionPackage,
  type MissionConclusion,
  type MissionEvidenceRef,
  type MissionPackage,
  type MissionPartyCard,
} from "./package.js";

export function missionPackageFromCollections(input: {
  overdue: unknown;
  attention: unknown;
  limit: number;
  extraWarnings?: string[];
  projectId?: string;
  kl?: KnowledgeLayerPort;
  /** Exposed / bound resource names to prefer when loading roles */
  resourceHints?: string[];
}): MissionPackage {
  const overdueRows = extractRows(input.overdue);
  const attentionRows = extractAttention(input.attention);
  const partyCards = buildPartyCards(overdueRows, attentionRows, input.limit);
  const highPriority = partyCards.filter((p) => (p.rank ?? 99) <= 3);
  const overdueCount = Math.max(
    overdueRows.length,
    new Set(partyCards.map((p) => p.partyId ?? p.name)).size,
  );

  const knowledge =
    input.projectId && input.kl
      ? loadBusinessKnowledge(input.kl, input.projectId, input.resourceHints)
      : null;

  const discoveries = buildDiscoveries(
    overdueCount,
    highPriority,
    partyCards,
    knowledge?.briefLines,
  );
  const explanation = buildExplanation(partyCards[0], knowledge?.briefLines);
  const recommendation = [
    highPriority.length
      ? `Comece pelos ${Math.min(3, highPriority.length)} primeiros clientes da lista priorizada.`
      : "Revise as evidências antes de iniciar contatos.",
    "Após cada contato, registre o resultado (promessa, negativação, acordo, sem resposta).",
    "Recalcule a fila com uma nova missão quando houver atualizações no ERP.",
  ];
  const availableActions = [
    "Gerar mensagem de cobrança personalizada",
    "Montar e-mail com tom adequado ao atraso",
    "Criar lista CSV dos priorizados",
    "Resumir histórico financeiro do cliente",
    "Explicar a prioridade com base nos dados deste pacote",
  ];
  const restrictions = [
    "Alterar valores de títulos ou saldos",
    "Registrar pagamento no ERP",
    "Excluir ou editar registros",
    "Acessar ou cobrar clientes fora desta lista",
    "Inventar fatos que não estejam nas evidências",
  ];
  const statusSteps = [
    "Contexto preparado",
    "Evidências coletadas",
    "Prioridades calculadas",
    partyCards.length > 0 ? "Pronto para execução" : "Aguardando dados suficientes",
  ];

  const evidence: MissionEvidenceRef[] = partyCards.map((p) => ({
    id: p.partyId,
    type: "Party",
    title: formatPartyEvidenceTitle(p),
    source: "business",
  }));

  const conclusions: MissionConclusion[] = [
    {
      capabilityId: "collect_overdue",
      title: "Descobertas",
      summary: discoveries.join(" "),
      data: { discoveries, partyCards },
    },
  ];

  const objective =
    "Reduzir a inadimplência priorizando clientes com maior probabilidade de recuperação financeira.";

  const warnings = [
    ...(input.extraWarnings ?? []),
    ...(partyCards.length === 0
      ? [
          "Nenhum inadimplente priorizado — confira se financeiro e clientes estão expostos e com papéis corretos.",
        ]
      : []),
  ];

  const pkg = emptyMissionPackage({
    missionId: "collect_overdue",
    missionTitle: "Cobrar inadimplentes",
    intent: "Quero cobrar inadimplentes",
    objective,
    evidence,
    conclusions,
    risks:
      partyCards.length === 0
        ? ["Sem inadimplentes no pacote — o agente não tem lista para executar."]
        : [
            "Contato agressivo demais pode aumentar churn.",
            "Dados desatualizados no ERP podem alterar a prioridade real.",
          ],
    plan: recommendation,
    checklist: availableActions.map((a) => `O agente pode: ${a}`),
    references: [],
    warnings,
    ready: partyCards.length > 0,
    statusSteps,
    discoveries,
    explanation,
    recommendation,
    availableActions,
    restrictions,
    partyCards,
    context: {
      overdue: input.overdue,
      attention: input.attention,
      limit: input.limit,
      presentation: "business_collections_v2",
      partyCards,
      businessKnowledge: knowledge
        ? {
            domain: knowledge.domain,
            roles: knowledge.roles,
            enrichmentsHit: knowledge.enrichmentsHit,
          }
        : undefined,
    },
  });
  pkg.agentBrief = renderCollectionsMissionBrief(pkg);
  return pkg;
}

function buildDiscoveries(
  overdueCount: number,
  highPriority: MissionPartyCard[],
  all: MissionPartyCard[],
  knowledgeLines?: string[],
): string[] {
  if (overdueCount === 0 && all.length === 0) {
    return ["Não foram encontrados clientes inadimplentes com os dados atuais."];
  }
  const lines = [
    `Foram encontrados ${overdueCount} título(s)/cliente(s) inadimplente(s) no ERP.`,
  ];
  if (knowledgeLines?.length) {
    lines.push(
      `Conhecimento Synapsee (Knowledge Layer): ${knowledgeLines.slice(0, 3).join("; ")}.`,
    );
  }
  if (highPriority.length) {
    lines.push(
      `Destes, ${highPriority.length} apresentam prioridade alta pela combinação de dias em atraso, valor em aberto e sinais de risco/score.`,
    );
  }
  const top = all[0];
  if (top) {
    lines.push(
      `O foco inicial recomendado é ${top.name}${top.daysOverdue != null ? ` (${top.daysOverdue} dias em atraso)` : ""}${top.amount != null ? ` · ${formatBrl(top.amount)}` : ""}.`,
    );
  }
  return lines;
}

function buildExplanation(
  top?: MissionPartyCard,
  knowledgeLines?: string[],
): string {
  if (!top) {
    return "Ainda não há um cliente priorizado — faltam evidências de inadimplência no schema.";
  }
  const reasons: string[] = [];
  if (top.amount != null && top.amount > 0) {
    reasons.push(`valor em aberto relevante (${formatBrl(top.amount)})`);
  }
  if (top.daysOverdue != null && top.daysOverdue > 0) {
    reasons.push(`atraso de ${top.daysOverdue} dia(s)`);
  }
  if (top.score != null) {
    reasons.push(`score/prioridade ${top.score}`);
  }
  if (top.lastContactDays != null && top.lastContactDays >= 14) {
    reasons.push(`sem contato recente (${top.lastContactDays} dias)`);
  }
  if (top.reasons?.length) {
    reasons.push(...top.reasons.map(humanizeReason));
  }
  if (!reasons.length) {
    reasons.push("maior prioridade calculada na fila de atenção");
  }
  let text = `Por que ${top.name} está em primeiro?\n\nPorque possui:\n${reasons.map((r) => `✓ ${r}`).join("\n")}`;
  if (knowledgeLines?.length) {
    text += `\n\nConhecimento persistido (não inventado pelo agente):\n${knowledgeLines.map((l) => `• ${l}`).join("\n")}`;
  }
  return text;
}

function buildPartyCards(
  overdueRows: Record<string, unknown>[],
  attentionRows: AttentionRow[],
  limit: number,
): MissionPartyCard[] {
  const byParty = new Map<string, MissionPartyCard>();

  for (const row of overdueRows) {
    const partyId = String(
      row.cliente_id ??
        row.party_id ??
        row.partyId ??
        row.aluno_id ??
        row.customer_id ??
        "",
    );
    const key = partyId || String(row.id ?? Math.random());
    const amount = num(row.valor_cobrado ?? row.valor ?? row.amount);
    const paid = num(row.valor_pago ?? row.pago);
    const openAmount =
      amount != null && paid != null ? Math.max(0, amount - paid) : amount;
    const days = num(row.dias_atraso ?? row.atraso ?? row.days_overdue);
    const prev = byParty.get(key);
    if (!prev) {
      byParty.set(key, {
        partyId: partyId || undefined,
        name: String(
          row.nome ?? row.name ?? row.party_name ?? (partyId ? `Cliente ${partyId}` : "Cliente"),
        ),
        daysOverdue: days ?? undefined,
        amount: openAmount ?? undefined,
        reasons: row.status ? [`status: ${String(row.status)}`] : [],
      });
    } else {
      prev.amount = (prev.amount ?? 0) + (openAmount ?? 0);
      prev.daysOverdue = Math.max(prev.daysOverdue ?? 0, days ?? 0);
      if (row.status) {
        prev.reasons = [...(prev.reasons ?? []), `status: ${String(row.status)}`];
      }
    }
  }

  for (const a of attentionRows) {
    const partyId = String(a.partyId ?? a.party?.id ?? "");
    const key =
      partyId ||
      String(a.name ?? "") ||
      `att-${Math.random()}`;
    const party = a.party ?? {};
    const score =
      typeof a.score === "number"
        ? a.score
        : num(party.score ?? party.risco);
    const days =
      num(party.dias_atraso ?? party.atraso) ?? undefined;
    const name = String(
      a.name ?? party.nome ?? party.name ?? (partyId ? `Cliente ${partyId}` : "Cliente"),
    );

    const existing =
      (partyId && byParty.get(partyId)) ||
      [...byParty.values()].find((p) => p.name === name);

    if (existing) {
      existing.name = name !== "Cliente" ? name : existing.name;
      existing.score = score ?? existing.score;
      if (days != null) {
        existing.daysOverdue = Math.max(existing.daysOverdue ?? 0, days);
      }
      existing.reasons = [
        ...new Set([...(existing.reasons ?? []), ...(a.reasons ?? []).map(humanizeReason)]),
      ];
      if (a.reasons?.includes("quiet_period") || a.reasons?.includes("no_events")) {
        existing.lastContactDays = existing.lastContactDays ?? 45;
      }
    } else {
      byParty.set(key, {
        partyId: partyId || undefined,
        name,
        daysOverdue: days,
        score: score ?? undefined,
        reasons: (a.reasons ?? []).map(humanizeReason),
        lastContactDays:
          a.reasons?.includes("quiet_period") || a.reasons?.includes("no_events")
            ? 45
            : undefined,
      });
    }
  }

  const cards = [...byParty.values()].sort((a, b) => {
    const scoreDiff = (b.score ?? 0) - (a.score ?? 0);
    if (scoreDiff !== 0) return scoreDiff;
    const dayDiff = (b.daysOverdue ?? 0) - (a.daysOverdue ?? 0);
    if (dayDiff !== 0) return dayDiff;
    return (b.amount ?? 0) - (a.amount ?? 0);
  });

  return cards.slice(0, limit).map((c, i) => ({ ...c, rank: i + 1 }));
}

function renderCollectionsMissionBrief(pkg: MissionPackage): string {
  const lines: string[] = [];
  lines.push(`# Mission`);
  lines.push("");
  lines.push(pkg.missionTitle);
  lines.push("");
  lines.push(`## Status`);
  lines.push("");
  for (const s of pkg.statusSteps ?? []) {
    lines.push(`✓ ${s}`);
  }
  lines.push("");
  lines.push(pkg.ready ? "Pronto para execução" : "Rascunho — dados insuficientes");
  lines.push("");
  lines.push(`## Objetivo`);
  lines.push("");
  lines.push(pkg.objective);
  lines.push("");
  lines.push(`## Descobertas`);
  lines.push("");
  for (const d of pkg.discoveries ?? []) {
    lines.push(d);
    lines.push("");
  }
  lines.push(`## Evidências`);
  lines.push("");
  for (const p of pkg.partyCards ?? []) {
    lines.push(`### ${p.rank ?? ""}. ${p.name}`.replace(/^\. /, ""));
    if (p.daysOverdue != null) lines.push(`• ${p.daysOverdue} dias em atraso`);
    if (p.amount != null) lines.push(`• ${formatBrl(p.amount)}`);
    if (p.score != null) lines.push(`• Score/prioridade: ${p.score}`);
    if (p.lastContactDays != null) {
      lines.push(`• Último contato: ${p.lastContactDays} dias`);
    }
    lines.push("");
  }
  if (pkg.explanation) {
    lines.push(`## Explicação`);
    lines.push("");
    lines.push(pkg.explanation);
    lines.push("");
  }
  const bk = pkg.context.businessKnowledge as
    | { domain?: { domain: string }; roles?: Array<{ resource: string; role: string; status: string }> }
    | undefined;
  if (bk?.domain || (bk?.roles && bk.roles.length)) {
    lines.push(`## Conhecimento Synapsee (Knowledge Layer)`);
    lines.push("");
    lines.push(
      "Este conhecimento pertence ao Synapsee — não ao modelo de linguagem.",
    );
    if (bk.domain) {
      lines.push(`• Domínio: ${bk.domain.domain}`);
    }
    for (const r of bk.roles ?? []) {
      lines.push(`• ${r.role} ← \`${r.resource}\` (${r.status})`);
    }
    lines.push("");
  }
  lines.push(`## Recomendação`);
  lines.push("");
  for (const r of pkg.recommendation ?? pkg.plan) {
    lines.push(`• ${r}`);
  }
  lines.push("");
  lines.push(`## Ações disponíveis`);
  lines.push("");
  lines.push("O agente pode:");
  for (const a of pkg.availableActions ?? []) {
    lines.push(`✓ ${a}`);
  }
  lines.push("");
  lines.push(`## Restrições`);
  lines.push("");
  lines.push("O agente NÃO pode:");
  for (const r of pkg.restrictions ?? []) {
    lines.push(`• ${r}`);
  }
  lines.push("");
  lines.push(`## Prompt do agente`);
  lines.push("");
  lines.push(`Você está executando a missão "${pkg.missionTitle}".`);
  lines.push("");
  lines.push("Utilize exclusivamente as evidências deste Mission Package.");
  lines.push("Nunca assuma fatos inexistentes.");
  lines.push("Explique sempre a prioridade utilizando os dados apresentados.");
  lines.push(
    "Caso alguma informação esteja ausente, solicite confirmação humana.",
  );
  lines.push("");
  lines.push(
    "Synapsee preparou o contexto — a execução (contato, mensagem, follow-up) é do agente.",
  );

  if (pkg.warnings.length) {
    lines.push("");
    lines.push(`## Avisos`);
    for (const w of pkg.warnings) lines.push(`• ${w}`);
  }

  return lines.join("\n");
}

type AttentionRow = {
  partyId?: string;
  name?: string | null;
  score?: number;
  reasons?: string[];
  party?: Record<string, unknown>;
};

function extractAttention(data: unknown): AttentionRow[] {
  if (!data || typeof data !== "object") return [];
  const o = data as Record<string, unknown>;
  const queue = o.queue;
  if (Array.isArray(queue)) {
    return queue.filter((x) => x && typeof x === "object") as AttentionRow[];
  }
  return extractRows(data).map((row) => ({
    partyId: String(row.partyId ?? row.id ?? ""),
    name: row.name != null ? String(row.name) : null,
    score: num(row.score) ?? undefined,
    reasons: Array.isArray(row.reasons) ? row.reasons.map(String) : [],
    party: row.party && typeof row.party === "object"
      ? (row.party as Record<string, unknown>)
      : row,
  }));
}

function extractRows(data: unknown): Record<string, unknown>[] {
  if (!data || typeof data !== "object") return [];
  const o = data as Record<string, unknown>;
  for (const key of ["rows", "items", "parties", "queue", "results", "data"]) {
    const v = o[key];
    if (Array.isArray(v)) {
      return v.filter((x) => x && typeof x === "object") as Record<
        string,
        unknown
      >[];
    }
  }
  if (Array.isArray(data)) {
    return data.filter((x) => x && typeof x === "object") as Record<
      string,
      unknown
    >[];
  }
  return [];
}

function formatPartyEvidenceTitle(p: MissionPartyCard): string {
  const bits = [p.name];
  if (p.daysOverdue != null) bits.push(`${p.daysOverdue}d atraso`);
  if (p.amount != null) bits.push(formatBrl(p.amount));
  if (p.score != null) bits.push(`score ${p.score}`);
  return bits.join(" · ");
}

function formatBrl(n: number): string {
  try {
    return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  } catch {
    return `R$ ${n.toFixed(2)}`;
  }
}

function num(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function humanizeReason(r: string): string {
  const map: Record<string, string> = {
    risk_signals: "sinais de risco no cadastro",
    no_events: "ausência de eventos/contato",
    quiet_period: "período sem interação recente",
    overdue_ledger: "títulos em atraso no financeiro",
  };
  return map[r] ?? r.replace(/_/g, " ");
}
