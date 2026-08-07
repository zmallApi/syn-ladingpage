import type { MissionPackage } from "./package.js";
import { getMission, listMissions, type MissionId } from "./catalog.js";
import { missionPackageFromExecute } from "./fromExecute.js";
import { missionPackageFromImpact } from "./fromImpact.js";
import { missionPackageFromCollections } from "./fromCollections.js";
import type { KnowledgeLayerPort } from "../knowledge/context.js";
import type { ExecuteResult } from "../knowledge/execute.js";
import type { ImpactResult } from "../knowledge/impact.js";

export interface MissionRunParams {
  taskRef?: string;
  incidentRef?: string;
  limit?: number;
  minDelayDays?: number;
  [key: string]: unknown;
}

export interface MissionRunDeps {
  runImplementStory?: (
    taskRef: string,
  ) => Promise<ExecuteResult | { error: string }>;
  runImpact?: (
    incidentRef: string,
  ) => Promise<ImpactResult | { error: string }>;
  runCapability?: (
    capabilityId: string,
    args: Record<string, unknown>,
  ) => Promise<unknown>;
  kl?: KnowledgeLayerPort;
  projectId?: string;
  resourceHints?: string[];
}

export interface MissionRunResult {
  missionId: MissionId;
  package: MissionPackage;
  capabilityTrace: string[];
}

export async function runMission(
  missionId: string,
  params: MissionRunParams,
  deps: MissionRunDeps,
): Promise<MissionRunResult | { error: string }> {
  const mission = getMission(missionId);
  if (!mission) {
    return {
      error: `Missão desconhecida: ${missionId}. Use list_missions para ver o catálogo.`,
    };
  }

  if (mission.id === "implement_story") {
    const taskRef = String(params.taskRef ?? "").trim();
    if (!taskRef) return { error: "Parametro taskRef e obrigatorio" };
    if (!deps.runImplementStory) {
      return { error: "Mission implement_story indisponivel neste projeto" };
    }
    const exec = await deps.runImplementStory(taskRef);
    if (exec && typeof exec === "object" && "error" in exec) {
      return { error: String((exec as { error: string }).error) };
    }
    const pkg = missionPackageFromExecute(exec as ExecuteResult, taskRef);
    return {
      missionId: mission.id,
      package: pkg,
      capabilityTrace: mission.capabilities,
    };
  }

  if (mission.id === "analyze_incident") {
    const incidentRef = String(
      params.incidentRef ?? params.taskRef ?? "",
    ).trim();
    if (!incidentRef) return { error: "Parametro incidentRef e obrigatorio" };
    if (!deps.runImpact) {
      return { error: "Mission analyze_incident indisponivel neste projeto" };
    }
    const impact = await deps.runImpact(incidentRef);
    if (impact && typeof impact === "object" && "error" in impact) {
      return { error: String((impact as { error: string }).error) };
    }
    const pkg = missionPackageFromImpact(
      impact as ImpactResult,
      incidentRef,
      deps.kl,
    );
    return {
      missionId: mission.id,
      package: pkg,
      capabilityTrace: mission.capabilities,
    };
  }

  if (mission.id === "collect_overdue") {
    if (!deps.runCapability) {
      return { error: "Missão Cobrar inadimplentes indisponível neste projeto" };
    }
    const limit = Number(params.limit ?? 20) || 20;
    const minDelayDays =
      params.minDelayDays != null ? Number(params.minDelayDays) : undefined;
    const args: Record<string, unknown> = { limit };
    if (minDelayDays != null && !Number.isNaN(minDelayDays)) {
      args.minDelayDays = minDelayDays;
    }

    const warnings: string[] = [];
    let overdue: unknown;
    let attention: unknown;
    const trace: string[] = [];

    try {
      overdue = await deps.runCapability("overdue_ledger", args);
      trace.push("overdue_ledger");
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      warnings.push(
        msg.includes("bindings") || msg.includes("sem bindings")
          ? "Não foi possível mapear a tabela financeira (ledger). Exponha a tabela de títulos/financeiro e, em Capabilities → Corrigir papéis, marque-a como “ledger” (campos de status, vencimento ou dias de atraso ajudam)."
          : `Inadimplência (overdue_ledger): ${msg}`,
      );
      try {
        overdue = await deps.runCapability("list_at_risk", args);
        trace.push("list_at_risk");
        warnings.push(
          "Usando Análise de risco como fallback — a fila de cobrança pode ficar incompleta.",
        );
      } catch {
        overdue = { count: 0, items: [], error: msg };
      }
    }

    try {
      attention = await deps.runCapability("attention_queue", args);
      trace.push("attention_queue");
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      attention = { error: msg, queue: [] };
      warnings.push(
        msg.includes("bindings") || msg.includes("sem bindings")
          ? "Fila de atenção indisponível: falta mapear pessoas (party) com os campos de risco/atraso."
          : `Fila de atenção: ${msg}`,
      );
    }

    const pkg = missionPackageFromCollections({
      overdue,
      attention,
      limit,
      extraWarnings: warnings,
      projectId: deps.projectId,
      kl: deps.kl,
      resourceHints: deps.resourceHints,
    });
    return {
      missionId: mission.id,
      package: pkg,
      capabilityTrace: trace.length ? trace : mission.capabilities,
    };
  }

  return { error: `Missão nao implementada: ${missionId}` };
}

export { getMission, listMissions };
