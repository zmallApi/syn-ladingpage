import { AnthropicLlmProvider } from "./anthropic.js";
import { GeminiLlmProvider } from "./gemini.js";
import { OpenAiLlmProvider } from "./openai.js";
import type { LlmProvider } from "./types.js";

export type LlmProviderName =
  | "openai"
  | "anthropic"
  | "gemini"
  | "openai_compatible"
  | "none";

export type LlmProviderConfig = {
  provider?: LlmProviderName | string;
  apiKey?: string;
  model?: string;
  /** For openai / openai_compatible (Ollama, vLLM, etc.) */
  baseUrl?: string;
  /** When false / provider "none", LLM is off for this project (ignores env keys). */
  enabled?: boolean;
};

/** No-op provider — project explicitly disconnected LLM. */
export class DisabledLlmProvider implements LlmProvider {
  readonly name = "none";
  readonly model = "none";
  isAvailable(): boolean {
    return false;
  }
  async completeJson(): Promise<null> {
    return null;
  }
}

/**
 * Build a provider from explicit config + env fallbacks.
 * Fail-closed: returns a provider instance even if key missing (isAvailable=false).
 */
export function createLlmProvider(config: LlmProviderConfig = {}): LlmProvider {
  const name = (
    config.provider ??
    process.env.LLM_PROVIDER ??
    "openai"
  ).toLowerCase();

  if (config.enabled === false || name === "none" || name === "disabled") {
    return new DisabledLlmProvider();
  }

  if (name === "anthropic" || name === "claude") {
    return new AnthropicLlmProvider({
      apiKey: config.apiKey,
      model: config.model,
      baseUrl: config.baseUrl,
    });
  }
  if (name === "gemini" || name === "google") {
    return new GeminiLlmProvider({
      apiKey: config.apiKey,
      model: config.model,
      baseUrl: config.baseUrl,
    });
  }
  // openai + openai_compatible share the Chat Completions client
  return new OpenAiLlmProvider({
    apiKey: config.apiKey,
    model: config.model,
    baseUrl:
      config.baseUrl ??
      (name === "openai_compatible"
        ? process.env.OPENAI_BASE_URL
        : undefined),
  });
}

export function publicLlmConfig(
  config: LlmProviderConfig | null | undefined,
): {
  provider: string;
  model?: string;
  baseUrl?: string;
  hasApiKey: boolean;
  enabled: boolean;
} {
  const enabled =
    config?.enabled !== false &&
    String(config?.provider ?? "").toLowerCase() !== "none";
  const provider = enabled
    ? String(config?.provider ?? process.env.LLM_PROVIDER ?? "openai").toLowerCase()
    : "none";
  const envKey =
    provider === "anthropic" || provider === "claude"
      ? Boolean(process.env.ANTHROPIC_API_KEY)
      : provider === "gemini" || provider === "google"
        ? Boolean(process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY)
        : provider === "none"
          ? false
          : Boolean(process.env.OPENAI_API_KEY);
  return {
    provider,
    model: enabled ? config?.model : undefined,
    baseUrl: enabled ? config?.baseUrl : undefined,
    hasApiKey: enabled ? Boolean(config?.apiKey) || envKey : false,
    enabled,
  };
}
