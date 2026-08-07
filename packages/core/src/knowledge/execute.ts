import type { PlanResult, WorkItem } from "./plan.js";
import type { AffectedService, ApiImpact } from "./impact.js";
import {
  missionPackageFromExecute,
  type MissionPackage,
} from "../missions/fromExecute.js";

export interface ExecuteHandoff {
  suggestedFirstWorkItemId: string | null;
  suggestedFirstTitle: string | null;
  repositories: string[];
  primaryService: string | null;
}

export interface ExecuteContext {
  objective: string;
  mvp: string;
  services: AffectedService[];
  repositories: string[];
  apis: Array<Pick<ApiImpact, "method" | "path" | "surface" | "permission">>;
  dataModel: string[];
  asIsSymbols: string[];
  filesTouched: string[];
  workItems: WorkItem[];
  outOfScope: string[];
  constraints: string[];
  openQuestions: string[];
  driftRisks: string[];
  assumptions: string[];
}

export interface ExecuteResult {
  capabilityId: "eng_execute_context";
  stage: "execute";
  summary: string;
  /**
   * Synapsee packs context only — never writes application code.
   * Canonical deliverable is Mission Package (`mission_package`).
   * `context_pack` kept as legacy alias in docs/clients.
   */
  role: "mission_package";
  /** Markdown brief ready to paste into an agent. */
  agentBrief: string;
  /** Canonical Mission Package for agents (Cursor / Claude / ChatGPT). */
  missionPackage: MissionPackage;
  context: ExecuteContext;
  handoff: ExecuteHandoff;
  readyToImplement: boolean;
  warnings: string[];
  planSummary: {
    summary: string;
    readyForExecute: boolean;
    workItemCount: number;
    sequence: string[];
  };
}

function buildAgentBrief(
  plan: PlanResult,
  ctx: ExecuteContext,
  handoff: ExecuteHandoff,
): string {
  const lines: string[] = [];
  lines.push("# Mission Package — Implementar Story (Story OS)");
  lines.push("");
  lines.push(
    "> Synapsee **não** executa trabalho. Use este Mission Package para implementar no repositório alvo.",
  );
  lines.push("");
  lines.push(`## Objetivo`);
  lines.push(ctx.objective);
  lines.push("");
  lines.push(`## MVP`);
  lines.push(ctx.mvp);
  lines.push("");

  if (ctx.services.length) {
    lines.push(`## Microserviços / repositórios afetados`);
    for (const s of ctx.services) {
      lines.push(
        `- **${s.name}** (\`${s.repository}\`, ${s.kind}, ${s.confidence})${s.url ? ` — ${s.url}` : ""}`,
      );
      if (s.areas.length) {
        lines.push(`  - áreas: ${s.areas.slice(0, 6).join(", ")}`);
      }
    }
    lines.push("");
  }

  if (ctx.apis.length) {
    lines.push(`## APIs`);
    for (const a of ctx.apis.slice(0, 16)) {
      lines.push(`- \`${a.surface}\``);
    }
    lines.push("");
  }

  if (ctx.dataModel.length) {
    lines.push(`## Modelo de dados`);
    for (const t of ctx.dataModel) lines.push(`- ${t}`);
    lines.push("");
  }

  if (ctx.asIsSymbols.length || ctx.filesTouched.length) {
    lines.push(`## AS-IS / arquivos`);
    for (const s of [...new Set([...ctx.filesTouched, ...ctx.asIsSymbols])].slice(
      0,
      12,
    )) {
      lines.push(`- \`${s}\``);
    }
    lines.push("");
  }

  lines.push(`## Work items (ordem)`);
  for (const w of ctx.workItems) {
    lines.push(`### ${w.id}. ${w.title} (${w.kind})`);
    lines.push(w.description);
    if (w.service) lines.push(`- serviço: ${w.service}`);
    if (w.dependsOn.length) lines.push(`- depende de: ${w.dependsOn.join(", ")}`);
    if (w.acceptanceHints.length) {
      lines.push(`- aceite: ${w.acceptanceHints.slice(0, 4).join("; ")}`);
    }
    lines.push("");
  }

  if (ctx.outOfScope.length) {
    lines.push(`## Fora de escopo (não implementar)`);
    for (const o of ctx.outOfScope) lines.push(`- ${o}`);
    lines.push("");
  }

  if (ctx.driftRisks.length) {
    lines.push(`## Riscos de drift`);
    for (const r of ctx.driftRisks.slice(0, 5)) lines.push(`- ${r}`);
    lines.push("");
  }

  if (ctx.openQuestions.length) {
    lines.push(`## Perguntas em aberto`);
    for (const q of ctx.openQuestions) lines.push(`- ${q}`);
    lines.push("");
  }

  lines.push(`## Instruções ao agente`);
  lines.push(
    `1. Comece por **${handoff.suggestedFirstWorkItemId ?? "W1"}**${handoff.suggestedFirstTitle ? ` (${handoff.suggestedFirstTitle})` : ""}.`,
  );
  lines.push(
    "2. Respeite fora de escopo e multi-tenant; não invente vínculos Task↔PR.",
  );
  lines.push(
    "3. Implemente só o que está nos work items; peça confirmação se o repositório estiver ambíguo.",
  );
  if (plan.assumptions.length) {
    lines.push("4. Premissas do Plan:");
    for (const a of plan.assumptions.slice(0, 4)) lines.push(`   - ${a}`);
  }

  return lines.join("\n");
}

/**
 * Story OS Execute — packs Plan into an agent-ready context.
 * Does **not** generate application code.
 */
export function executeContext(plan: PlanResult): ExecuteResult {
  const impact = plan.impact;
  const refine = impact.refine;
  const understand = refine.understand;

  const services = impact.affectedServices;
  const apis = impact.blastRadius.apis
    .filter((a) => a.source !== "inferred" || a.path.startsWith("/api/"))
    .map((a) => ({
      method: a.method,
      path: a.path,
      surface: a.surface,
      permission: a.permission,
    }));

  const constraints: string[] = [
    "Synapsee entrega contexto; o agente de código implementa.",
    "Não inventar vínculos Task↔PR nem repositórios ausentes da evidência.",
    ...plan.outOfScope.map((o) => `Fora de escopo: ${o}`),
  ];
  if (understand.storySections?.acceptance) {
    constraints.push("Respeitar critérios de aceite da história.");
  }

  const context: ExecuteContext = {
    objective: understand.objective,
    mvp: plan.mvp,
    services,
    repositories: impact.blastRadius.repositories,
    apis,
    dataModel: impact.blastRadius.dataModel,
    asIsSymbols: impact.blastRadius.asIsSymbols,
    filesTouched: impact.blastRadius.filesTouched,
    workItems: plan.workItems,
    outOfScope: plan.outOfScope,
    constraints,
    openQuestions: plan.openQuestions,
    driftRisks: impact.driftRisks,
    assumptions: plan.assumptions,
  };

  const first = plan.workItems[0] ?? null;
  const handoff: ExecuteHandoff = {
    suggestedFirstWorkItemId: first?.id ?? null,
    suggestedFirstTitle: first?.title ?? null,
    repositories: impact.blastRadius.repositories,
    primaryService: services[0]?.name ?? null,
  };

  const warnings = [...plan.warnings];
  if (!services.length) {
    warnings.push(
      "Nenhum MS/repositório no pack — confirme o alvo antes de abrir PR.",
    );
  }
  if (!plan.readyForExecute) {
    warnings.push("Plan não estava readyForExecute — pack pode estar incompleto.");
  }

  const readyToImplement =
    plan.workItems.length >= 1 &&
    Boolean(plan.mvp) &&
    (plan.readyForExecute || Boolean(understand.storySections?.toBe));

  const agentBrief = buildAgentBrief(plan, context, handoff);

  const ms = handoff.primaryService ?? "repositório a confirmar";
  const summary = readyToImplement
    ? `Mission Package pronto: ${plan.workItems.length} work item(s) → ${ms}. Cole agentBrief no agente (Synapsee não gera código).`
    : `Mission Package preliminar: ${warnings.length} aviso(s) — revise Plan antes de implementar.`;

  const result: ExecuteResult = {
    capabilityId: "eng_execute_context",
    stage: "execute",
    summary,
    role: "mission_package",
    agentBrief,
    missionPackage: null as unknown as MissionPackage,
    context,
    handoff,
    readyToImplement,
    warnings: [...new Set(warnings.filter(Boolean))],
    planSummary: {
      summary: plan.summary,
      readyForExecute: plan.readyForExecute,
      workItemCount: plan.workItems.length,
      sequence: plan.sequence,
    },
  };
  result.missionPackage = missionPackageFromExecute(result, "execute");
  return result;
}
