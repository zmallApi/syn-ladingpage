import { z } from "zod";
import type { SchemaSnapshot } from "../adapters/types.js";
import { completeAndParse, getDefaultLlmProvider, type LlmProvider } from "../llm/index.js";
import type { BusinessDomain, BusinessProfile } from "./types.js";

const refineSchema = z.object({
  domain: z
    .enum([
      "erp_commerce",
      "saas_billing",
      "crm",
      "hr",
      "membership_retention",
      "generic",
    ])
    .optional(),
  confidence: z.number().min(0).max(1).optional(),
  suggestedCapabilityIds: z.array(z.string()).default([]),
  rationale: z.string().optional(),
});

export type LlmRefineResult = z.infer<typeof refineSchema>;

/**
 * Optional LLM refine via LlmProvider. Fail-closed.
 * Never sends row data — only schema metadata + heuristic profile.
 */
export async function refineWithLlm(
  profile: BusinessProfile,
  schema: SchemaSnapshot,
  catalogIds: string[],
  provider: LlmProvider = getDefaultLlmProvider(),
): Promise<LlmRefineResult | null> {
  const payload = {
    domain_heuristic: profile.domain,
    confidence_heuristic: profile.confidence,
    resourceRoles: profile.resourceRoles.map((r) => ({
      resource: r.resource,
      role: r.role,
      confidence: r.confidence,
    })),
    resources: schema.resources.map((r) => ({
      name: r.name,
      fields: r.fields.map((f) => f.name),
    })),
    catalogIds,
  };

  const result = await completeAndParse(
    provider,
    {
      task: "business_domain_refine",
      temperature: 0,
      messages: [
        {
          role: "system",
          content:
            "You classify database schemas into business domains and pick capability tool IDs from a fixed catalog. Reply JSON only. Never invent SQL or new tool ids outside catalogIds.",
        },
        {
          role: "user",
          content: JSON.stringify({
            task: "Refine domain and suggest capability IDs from catalogIds only.",
            input: payload,
          }),
        },
      ],
    },
    refineSchema,
  );
  if (!result) return null;

  const allowed = new Set(catalogIds);
  const suggested = result.data.suggestedCapabilityIds ?? [];
  return {
    ...result.data,
    domain: result.data.domain as BusinessDomain | undefined,
    suggestedCapabilityIds: suggested.filter((id) => allowed.has(id)),
  };
}
