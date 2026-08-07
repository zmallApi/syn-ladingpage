import type { ExecuteContext, ExecuteHandoff, ExecuteResult } from "../knowledge/execute.js";
import { emptyMissionPackage, type MissionPackage } from "./package.js";

/** Slice of Execute needed to build a Mission Package (avoids recursive nesting). */
export type ExecuteForPackage = Pick<
  ExecuteResult,
  | "summary"
  | "agentBrief"
  | "context"
  | "handoff"
  | "readyToImplement"
  | "warnings"
  | "planSummary"
>;

/** Convert Story OS Execute into canonical Mission Package. */
export function missionPackageFromExecute(
  execute: ExecuteForPackage,
  taskRef: string,
): MissionPackage {
  const evidence = [
    ...execute.context.services.map((s) => ({
      title: s.name,
      type: "Service",
      url: s.url,
      source: s.repository,
    })),
    ...execute.context.repositories.map((r) => ({
      title: r,
      type: "Repository",
    })),
  ];

  const conclusions = [
    {
      capabilityId: "eng_execute_context",
      title: "Execute / context pack",
      summary: execute.summary,
      data: {
        planSummary: execute.planSummary,
        handoff: execute.handoff,
      },
    },
  ];

  const plan = execute.context.workItems.map(
    (w) => `${w.id}. ${w.title} (${w.kind})`,
  );
  const checklist = execute.context.workItems.flatMap((w) =>
    w.acceptanceHints.slice(0, 2).map((h) => `${w.id}: ${h}`),
  );
  const risks = [...execute.context.driftRisks, ...execute.warnings];

  const executeContext: ExecuteContext = execute.context;
  const handoff: ExecuteHandoff = execute.handoff;

  const pkg = emptyMissionPackage({
    missionId: "implement_story",
    missionTitle: "Implementar Story",
    intent: "Quero implementar uma história",
    objective: execute.context.objective,
    evidence,
    conclusions,
    risks: [...new Set(risks.filter(Boolean))],
    plan,
    checklist,
    references: evidence.filter((e) => e.url),
    warnings: execute.warnings,
    ready: execute.readyToImplement,
    context: {
      taskRef,
      mvp: executeContext.mvp,
      workItems: executeContext.workItems,
      outOfScope: executeContext.outOfScope,
      handoff,
      planSummary: execute.planSummary,
      services: executeContext.services,
      repositories: executeContext.repositories,
      apis: executeContext.apis,
    },
  });

  pkg.agentBrief = execute.agentBrief.includes("Mission Package")
    ? execute.agentBrief
    : `# Mission Package — Implementar Story\n\n${execute.agentBrief}`;

  return pkg;
}
