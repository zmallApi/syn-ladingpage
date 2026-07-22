import type { SchemaSnapshot } from "../adapters/types.js";
import { requiredExposedResources } from "./helpers.js";
import { analyzeBusinessProfile, hasRole } from "./heuristics.js";
import { refineWithLlm } from "./llm.js";
import { suggestCapabilityPack } from "./packs.js";
import {
  bindTemplate,
  capabilityTemplates,
  listTemplatesForDomain,
} from "./templates.js";
import type {
  AnalyzeResult,
  BusinessDomain,
  CapabilitySuggestion,
  RoleOverrides,
} from "./types.js";

function buildSuggestions(
  schema: SchemaSnapshot,
  domain: BusinessDomain,
  roles: AnalyzeResult["profile"]["resourceRoles"],
  preferredIds?: string[],
  exposedResources?: string[],
): CapabilitySuggestion[] {
  const pool = [
    ...listTemplatesForDomain(domain),
    ...capabilityTemplates.filter((t) => t.domain === "any"),
  ];
  const seen = new Set<string>();
  const templates = pool.filter((t) => {
    if (seen.has(t.id)) return false;
    seen.add(t.id);
    return true;
  });

  const exposed = exposedResources ? new Set(exposedResources) : null;

  const suggestions: CapabilitySuggestion[] = templates.map((t) => {
    const bindings = bindTemplate(t, schema, roles);
    const missingRoles = t.requiredRoles.filter((role) => !hasRole(roles, role));
    let available = bindings != null;
    let reason: string | undefined =
      bindings == null
        ? missingRoles.length
          ? `Faltam papéis: ${missingRoles.join(", ")}`
          : "Não foi possível vincular campos/tabelas"
        : undefined;

    if (available && bindings && exposed) {
      const needed = requiredExposedResources(t, bindings, roles);
      const missingExposed = needed.filter((r) => !exposed.has(r));
      if (missingExposed.length) {
        available = false;
        reason = `Exponha no wizard: ${missingExposed.join(", ")}`;
      }
    }

    return {
      id: t.id,
      title: t.title,
      description: t.description,
      domain: t.domain,
      kind: t.kind ?? "capability",
      requiredRoles: t.requiredRoles,
      bindings: bindings ?? {},
      available,
      reason,
    };
  });

  if (preferredIds?.length) {
    const order = new Map(preferredIds.map((id, i) => [id, i]));
    suggestions.sort((a, b) => {
      const ai = order.has(a.id) ? order.get(a.id)! : 999;
      const bi = order.has(b.id) ? order.get(b.id)! : 999;
      if (ai !== bi) return ai - bi;
      return Number(b.available) - Number(a.available);
    });
  } else {
    suggestions.sort((a, b) => Number(b.available) - Number(a.available));
  }

  return suggestions;
}

/** Heuristic (+ optional LLM) analysis of schema → business profile + tool suggestions. */
export async function analyzeCapabilities(
  schema: SchemaSnapshot,
  opts?: {
    useLlm?: boolean;
    roleOverrides?: RoleOverrides | null;
    /** When set, mark suggestions unavailable if required tables aren't exposed. */
    exposedResources?: string[];
  },
): Promise<AnalyzeResult> {
  let profile = analyzeBusinessProfile(schema, opts?.roleOverrides);
  let llmUsed = false;
  let llmRationale: string | undefined;
  let preferredIds: string[] | undefined;

  const catalogIds = capabilityTemplates.map((t) => t.id);

  if (opts?.useLlm !== false) {
    const refined = await refineWithLlm(profile, schema, catalogIds);
    if (refined) {
      llmUsed = true;
      llmRationale = refined.rationale;
      if (refined.domain) {
        profile = {
          ...profile,
          domain: refined.domain,
          confidence: refined.confidence ?? profile.confidence,
        };
      } else if (refined.confidence != null) {
        profile = { ...profile, confidence: refined.confidence };
      }
      preferredIds = refined.suggestedCapabilityIds;
    }
  }

  const suggestions = buildSuggestions(
    schema,
    profile.domain,
    profile.resourceRoles,
    preferredIds,
    opts?.exposedResources,
  );

  const suggestedPack = suggestCapabilityPack(profile, suggestions);

  return { profile, suggestions, suggestedPack, llmUsed, llmRationale };
}
