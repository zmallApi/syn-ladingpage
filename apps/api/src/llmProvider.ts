import {
  createLlmProvider,
  type LlmProvider,
  type LlmProviderConfig,
} from "@synapse/core";
import type { ProjectRecord, ProjectStore } from "@synapse/storage";

/**
 * Resolve LLM for a project.
 * - enabled:false / none → off (ignores server .env)
 * - enabled:true + project key → that provider
 * - no project config yet → env fallback (legacy ops)
 * - enabled:true without key → off (incomplete Admin save)
 */
export function resolveProjectLlmProvider(
  store: ProjectStore,
  record: ProjectRecord,
): LlmProvider {
  const cfg = store.getLlmConfig(record);
  const hasRow = Boolean(record.llmConfigJson);

  if (
    cfg.enabled === false ||
    cfg.provider === "none" ||
    cfg.provider === "disabled"
  ) {
    return createLlmProvider({ enabled: false, provider: "none" });
  }

  if (hasRow && cfg.enabled === true && !cfg.apiKey) {
    return createLlmProvider({ enabled: false, provider: "none" });
  }

  if (hasRow && cfg.enabled === true && cfg.apiKey) {
    return createLlmProvider({
      provider: cfg.provider,
      model: cfg.model,
      baseUrl: cfg.baseUrl,
      apiKey: cfg.apiKey,
      enabled: true,
    });
  }

  // No project LLM row: optional env fallback for local/ops.
  return createLlmProvider({
    provider: cfg.provider,
    model: cfg.model,
    baseUrl: cfg.baseUrl,
    apiKey: cfg.apiKey,
  });
}
