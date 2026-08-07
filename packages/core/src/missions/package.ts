/** Mission Package — principal artefato entregue pelo Synapsee. */

export interface MissionEvidenceRef {
  id?: string;
  type?: string;
  title: string;
  url?: string;
  source?: string;
}

export interface MissionConclusion {
  capabilityId: string;
  title: string;
  summary: string;
  data?: unknown;
}

/** Cartão de pessoa/cliente para missões Business (cobrança etc.). */
export interface MissionPartyCard {
  partyId?: string;
  name: string;
  daysOverdue?: number;
  amount?: number;
  score?: number;
  lastContactDays?: number;
  reasons?: string[];
  rank?: number;
}

export interface MissionPackage {
  /** Canonical deliverable role */
  role: "mission_package";
  missionId: string;
  missionTitle: string;
  intent: string;
  objective: string;
  /** Markdown brief ready for Cursor / Claude / ChatGPT */
  agentBrief: string;
  evidence: MissionEvidenceRef[];
  conclusions: MissionConclusion[];
  risks: string[];
  plan: string[];
  checklist: string[];
  references: MissionEvidenceRef[];
  warnings: string[];
  ready: boolean;
  createdAt: string;
  /** Structured payload for agents (stage outputs, rows, etc.) */
  context: Record<string, unknown>;
  /** Business mission presentation (optional) */
  statusSteps?: string[];
  discoveries?: string[];
  explanation?: string;
  recommendation?: string[];
  availableActions?: string[];
  restrictions?: string[];
  partyCards?: MissionPartyCard[];
}

export function emptyMissionPackage(
  partial: Pick<
    MissionPackage,
    "missionId" | "missionTitle" | "intent" | "objective"
  > &
    Partial<MissionPackage>,
): MissionPackage {
  return {
    role: "mission_package",
    missionId: partial.missionId,
    missionTitle: partial.missionTitle,
    intent: partial.intent,
    objective: partial.objective,
    agentBrief: partial.agentBrief ?? "",
    evidence: partial.evidence ?? [],
    conclusions: partial.conclusions ?? [],
    risks: partial.risks ?? [],
    plan: partial.plan ?? [],
    checklist: partial.checklist ?? [],
    references: partial.references ?? [],
    warnings: partial.warnings ?? [],
    ready: partial.ready ?? false,
    createdAt: partial.createdAt ?? new Date().toISOString(),
    context: partial.context ?? {},
    statusSteps: partial.statusSteps,
    discoveries: partial.discoveries,
    explanation: partial.explanation,
    recommendation: partial.recommendation,
    availableActions: partial.availableActions,
    restrictions: partial.restrictions,
    partyCards: partial.partyCards,
  };
}

/** Build agent-facing markdown from package fields. */
export function renderMissionBrief(pkg: MissionPackage): string {
  const lines: string[] = [];
  lines.push(`# Mission Package — ${pkg.missionTitle}`);
  lines.push("");
  lines.push(
    "> Synapsee **não** executa o trabalho. Use este pacote para executar a missão no agente.",
  );
  lines.push("");
  lines.push(`## Objetivo`);
  lines.push(pkg.objective || pkg.intent);
  lines.push("");

  if (pkg.evidence.length) {
    lines.push(`## Evidências`);
    for (const e of pkg.evidence.slice(0, 24)) {
      lines.push(
        `- ${e.title}${e.type ? ` (${e.type})` : ""}${e.url ? ` — ${e.url}` : ""}`,
      );
    }
    lines.push("");
  }

  if (pkg.conclusions.length) {
    lines.push(`## Conclusões`);
    for (const c of pkg.conclusions) {
      lines.push(`### ${c.title} (\`${c.capabilityId}\`)`);
      lines.push(c.summary);
      lines.push("");
    }
  }

  if (pkg.risks.length) {
    lines.push(`## Riscos`);
    for (const r of pkg.risks.slice(0, 12)) lines.push(`- ${r}`);
    lines.push("");
  }

  if (pkg.plan.length) {
    lines.push(`## Plano`);
    for (const p of pkg.plan) lines.push(`- ${p}`);
    lines.push("");
  }

  if (pkg.checklist.length) {
    lines.push(`## Checklist`);
    for (const c of pkg.checklist) lines.push(`- [ ] ${c}`);
    lines.push("");
  }

  if (pkg.references.length) {
    lines.push(`## Referências`);
    for (const r of pkg.references.slice(0, 16)) {
      lines.push(`- ${r.title}${r.url ? ` — ${r.url}` : ""}`);
    }
    lines.push("");
  }

  if (pkg.warnings.length) {
    lines.push(`## Avisos`);
    for (const w of pkg.warnings) lines.push(`- ${w}`);
    lines.push("");
  }

  lines.push(`## Instruções ao agente`);
  lines.push("1. Execute só o que está neste Mission Package.");
  lines.push("2. Não invente fatos nem vínculos ausentes das evidências.");
  lines.push("3. Se houver gaps, peça confirmação humana antes de agir.");

  return lines.join("\n");
}
