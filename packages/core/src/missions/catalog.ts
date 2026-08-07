import type { MissionPackage } from "./package.js";

export type MissionId =
  | "implement_story"
  | "collect_overdue"
  | "analyze_incident";

export interface MissionDefinition {
  id: MissionId;
  title: string;
  intent: string;
  description: string;
  /** Capability ids used (order). */
  capabilities: string[];
  vertical: "engineering" | "business" | "any";
  paramSchema: Array<{
    name: string;
    type: "string" | "number";
    required?: boolean;
    description: string;
  }>;
}

export const MISSION_CATALOG: MissionDefinition[] = [
  {
    id: "implement_story",
    title: "Implementar Story",
    intent: "Quero implementar uma história",
    description:
      "Orquestra Understand → Refine → Impact → Plan → Execute e entrega Mission Package para o agente de código.",
    capabilities: [
      "eng_understand_story",
      "eng_refine_story",
      "eng_impact_analysis",
      "eng_implementation_plan",
      "eng_execute_context",
    ],
    vertical: "engineering",
    paramSchema: [
      {
        name: "taskRef",
        type: "string",
        required: true,
        description: "Id ClickUp, id canônico ou trecho do título",
      },
    ],
  },
  {
    id: "collect_overdue",
    title: "Cobrar inadimplentes",
    intent: "Quero cobrar inadimplentes",
    description:
      "Prepara contexto, evidências e prioridades de cobrança e entrega um Mission Package para o agente executar o contato.",
    capabilities: ["overdue_ledger", "attention_queue"],
    vertical: "business",
    paramSchema: [
      {
        name: "limit",
        type: "number",
        required: false,
        description: "Máximo de itens na fila (padrão 20)",
      },
      {
        name: "minDelayDays",
        type: "number",
        required: false,
        description: "Atraso mínimo em dias",
      },
    ],
  },
  {
    id: "analyze_incident",
    title: "Analisar Incidente",
    intent: "Quero analisar um incidente",
    description:
      "Monta blast radius + evidências da Knowledge Layer para investigar um incidente.",
    capabilities: ["eng_impact_analysis"],
    vertical: "engineering",
    paramSchema: [
      {
        name: "incidentRef",
        type: "string",
        required: true,
        description: "Task/Story/ref do incidente ou área afetada",
      },
    ],
  },
];

export function getMission(id: string): MissionDefinition | undefined {
  return MISSION_CATALOG.find((m) => m.id === id);
}

export function listMissions(vertical?: string): MissionDefinition[] {
  if (!vertical) return [...MISSION_CATALOG];
  return MISSION_CATALOG.filter(
    (m) => m.vertical === "any" || m.vertical === vertical,
  );
}

export type { MissionPackage };
