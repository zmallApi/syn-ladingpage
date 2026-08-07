import type { ImpactResult } from "../knowledge/impact.js";
import type { KnowledgeLayerPort } from "../knowledge/context.js";
import { gatherEvidence } from "../knowledge/gatherEvidence.js";
import {
  emptyMissionPackage,
  renderMissionBrief,
  type MissionPackage,
} from "./package.js";

export function missionPackageFromImpact(
  impact: ImpactResult,
  incidentRef: string,
  kl?: KnowledgeLayerPort,
): MissionPackage {
  const evidenceGather = kl
    ? gatherEvidence(kl, incidentRef, { limit: 40 })
    : null;

  const evidence = [
    ...(evidenceGather?.facts.map((f) => ({
      id: f.id,
      type: f.type,
      title: f.title,
      url: f.url,
      source: f.source,
    })) ?? []),
    ...impact.affectedServices.map((s) => ({
      title: s.name,
      type: "Service",
      url: s.url,
      source: s.repository,
    })),
  ];

  const risks = [
    ...impact.driftRisks,
    ...impact.warnings,
    ...(evidenceGather?.warnings ?? []),
  ];

  const plan = [
    "Confirmar serviço/repositório primário afetado",
    "Revisar PRs/commits relacionados nas evidências",
    "Isolar mudança suspeita e validar em staging",
    "Documentar causa raiz e follow-ups",
  ];

  const checklist = [
    "Escopo do incidente confirmado",
    "Blast radius revisado",
    "Mitigação ou rollback definido",
    "Comunicação aos stakeholders",
  ];

  const pkg = emptyMissionPackage({
    missionId: "analyze_incident",
    missionTitle: "Analisar Incidente",
    intent: "Quero analisar um incidente",
    objective:
      impact.refine?.understand?.objective ??
      `Analisar incidente: ${incidentRef}`,
    evidence,
    conclusions: [
      {
        capabilityId: "eng_impact_analysis",
        title: "Impact Analysis",
        summary: impact.summary,
        data: {
          affectedServices: impact.affectedServices,
          blastRadius: impact.blastRadius,
        },
      },
    ],
    risks: [...new Set(risks.filter(Boolean))],
    plan,
    checklist,
    references: evidence.filter((e) => e.url).slice(0, 20),
    warnings: impact.warnings,
    ready: impact.affectedServices.length > 0 || impact.readyForPlan,
    context: {
      incidentRef,
      impact,
      evidenceQuestions: evidenceGather?.answers ?? null,
    },
  });
  pkg.agentBrief = renderMissionBrief(pkg);
  return pkg;
}
