import type { CapabilityTemplate } from "./types.js";

function engToolTemplate(
  id: string,
  title: string,
  description: string,
  toolHint: string,
): CapabilityTemplate {
  return {
    id,
    title,
    description,
    domain: "engineering",
    kind: "capability",
    requiredRoles: [],
    inputSchema: [
      {
        name: "taskRef",
        type: "string",
        required: true,
        description: "Id ClickUp / Task da história",
      },
    ],
    bind: () => ({}),
    async run(_ctx, args) {
      return {
        status: "use_mcp_tool",
        capabilityId: id,
        taskRef: String(args.taskRef ?? ""),
        message: toolHint,
      };
    },
  };
}

export const engUnderstandTemplate = engToolTemplate(
  "eng_understand_story",
  "Descoberta de conhecimento",
  "Analisa a história com a Knowledge Layer e devolve um briefing. Não executa o fluxo completo — prefira a missão Implementar história.",
  "Invoke via MCP tool cap_eng_understand_story — ou prefira run_mission(implement_story).",
);

export const engRefineTemplate = engToolTemplate(
  "eng_refine_story",
  "Refinar escopo",
  "Fecha gaps de aceite, escopo e MVP a partir do Understand. Não executa o fluxo completo — prefira a missão Implementar história.",
  "Invoke via MCP tool cap_eng_refine_story — ou prefira run_mission(implement_story).",
);

export const engImpactTemplate = engToolTemplate(
  "eng_impact_analysis",
  "Análise de impacto",
  "Calcula o blast radius (serviços/repos afetados). Não executa o fluxo completo — prefira a missão correspondente.",
  "Invoke via MCP tool cap_eng_impact_analysis — ou prefira run_mission.",
);

export const engPlanTemplate = engToolTemplate(
  "eng_implementation_plan",
  "Plano de implementação",
  "Gera work items ordenados a partir do Impact. Não executa o fluxo completo — prefira a missão Implementar história.",
  "Invoke via MCP tool cap_eng_implementation_plan — ou prefira run_mission(implement_story).",
);

export const engExecuteTemplate = engToolTemplate(
  "eng_execute_context",
  "Mission Package",
  "Emite o Mission Package para o agente implementar. O Synapsee não escreve código — prefira a missão Implementar história.",
  "Invoke via MCP tool cap_eng_execute_context — ou prefira run_mission(implement_story).",
);

export const engineeringCapabilityTemplates: CapabilityTemplate[] = [
  engUnderstandTemplate,
  engRefineTemplate,
  engImpactTemplate,
  engPlanTemplate,
  engExecuteTemplate,
];

export const ENGINEERING_STORY_OS_CAPABILITIES = [
  "eng_understand_story",
  "eng_refine_story",
  "eng_impact_analysis",
  "eng_implementation_plan",
  "eng_execute_context",
] as const;

export const STORY_OS_STAGES = [
  {
    id: "understand",
    capabilityId: "eng_understand_story",
    label: "Understand",
    ready: true,
  },
  {
    id: "refine",
    capabilityId: "eng_refine_story",
    label: "Refine",
    ready: true,
  },
  {
    id: "impact",
    capabilityId: "eng_impact_analysis",
    label: "Impact",
    ready: true,
  },
  {
    id: "plan",
    capabilityId: "eng_implementation_plan",
    label: "Plan",
    ready: true,
  },
  {
    id: "execute",
    capabilityId: "eng_execute_context",
    label: "Execute",
    ready: true,
  },
] as const;
