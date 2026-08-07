import { z } from "zod";
import {
  completeAndParse,
  getDefaultLlmProvider,
  type LlmProvider,
} from "../llm/index.js";
import type { DiscoveryResult } from "./discovery.js";
import { summarizeSectionsForLlm } from "./storyBody.js";

const discoveryRefineSchema = z.object({
  summary: z.string().optional(),
  objective: z.string().optional(),
  risks: z.array(z.string()).optional(),
  technicalDebt: z.array(z.string()).optional(),
  checklist: z.array(z.string()).optional(),
  openQuestions: z.array(z.string()).optional(),
  whatAlreadyExists: z.array(z.string()).optional(),
});

export type DiscoveryLlmMeta = {
  llmUsed: boolean;
  llmModel?: string;
  enrichmentsHit?: number;
  llmCallsSaved?: boolean;
};

/**
 * Optional LLM pass over Discovery template output via LlmProvider.
 * Fail-closed: returns base unchanged if unavailable / error.
 */
export async function refineDiscoveryWithLlm(
  base: DiscoveryResult,
  provider: LlmProvider = getDefaultLlmProvider(),
): Promise<DiscoveryResult & DiscoveryLlmMeta> {
  if (!provider.isAvailable()) {
    return { ...base, llmUsed: false };
  }

  const storySections = base.storySections
    ? summarizeSectionsForLlm({
        sections: base.storySections,
        bullets: {},
        codeSymbols: [],
        hasStructuredBody: Object.keys(base.storySections).length > 0,
      })
    : undefined;

  const result = await completeAndParse(
    provider,
    {
      task: "discovery_refine",
      temperature: 0.2,
      messages: [
        {
          role: "system",
          content: [
            "You are a senior eng Discovery assistant for Synapsee.",
            "Improve clarity of a structured Discovery briefing.",
            "Only use the provided evidence. Do not invent PRs, commits, modules, or APIs.",
            "Strengthen: summary, objective, risks, technicalDebt, checklist, openQuestions, whatAlreadyExists.",
            "Preserve AS-IS, TO-BE, acceptance criteria and out-of-scope already extracted from the story body — clarify/order, do not drop them.",
            "openQuestions must be concrete unanswered decisions only (do not re-ask what the story already answered).",
            base.linkConfidence === "none"
              ? "GREENFIELD / no linked code: refine the story using its body sections; do not invent linked evidence."
              : "Linked evidence exists — keep facts accurate and highlight residual risks.",
            "Reply JSON only with those keys (arrays of short Portuguese strings where applicable).",
          ].join(" "),
        },
        {
          role: "user",
          content: JSON.stringify({
            linkConfidence: base.linkConfidence,
            storySections,
            briefing: {
              summary: base.summary,
              objective: base.objective,
              whatAlreadyExists: base.whatAlreadyExists,
              dependencies: base.dependencies,
              affectedModules: base.affectedModules,
              similarPullRequests: base.similarPullRequests,
              similarCommits: base.similarCommits,
              risks: base.risks,
              technicalDebt: base.technicalDebt,
              checklist: base.checklist,
              openQuestions: base.openQuestions,
            },
          }),
        },
      ],
    },
    discoveryRefineSchema,
  );

  if (!result) return { ...base, llmUsed: false };

  const r = result.data;
  return {
    ...base,
    summary: r.summary?.trim() || base.summary,
    objective: r.objective?.trim() || base.objective,
    whatAlreadyExists: r.whatAlreadyExists?.length
      ? r.whatAlreadyExists
      : base.whatAlreadyExists,
    risks: r.risks?.length ? r.risks : base.risks,
    technicalDebt: r.technicalDebt?.length
      ? r.technicalDebt
      : base.technicalDebt,
    checklist: r.checklist?.length ? r.checklist : base.checklist,
    openQuestions: r.openQuestions?.length
      ? r.openQuestions
      : base.openQuestions,
    llmUsed: true,
    llmModel: result.model,
  };
}
