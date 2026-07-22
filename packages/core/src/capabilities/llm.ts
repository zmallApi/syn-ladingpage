import { z } from "zod";
import type { SchemaSnapshot } from "../adapters/types.js";
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
 * Optional OpenAI refine. Fail-closed: returns null if no key / error / invalid JSON.
 * Never sends row data — only schema metadata + heuristic profile.
 */
export async function refineWithLlm(
  profile: BusinessProfile,
  schema: SchemaSnapshot,
  catalogIds: string[],
): Promise<LlmRefineResult | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;

  const model = process.env.OPENAI_MODEL ?? "gpt-4o-mini";
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

  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        temperature: 0,
        response_format: { type: "json_object" },
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
      }),
    });

    if (!res.ok) return null;
    const body = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const raw = body.choices?.[0]?.message?.content;
    if (!raw) return null;

    const parsed = refineSchema.safeParse(JSON.parse(raw));
    if (!parsed.success) return null;

    const allowed = new Set(catalogIds);
    return {
      ...parsed.data,
      domain: parsed.data.domain as BusinessDomain | undefined,
      suggestedCapabilityIds: parsed.data.suggestedCapabilityIds.filter((id) =>
        allowed.has(id),
      ),
    };
  } catch {
    return null;
  }
}
