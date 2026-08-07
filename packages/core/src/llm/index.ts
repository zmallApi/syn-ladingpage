import { createLlmProvider, type LlmProviderConfig } from "./config.js";
import type { LlmProvider } from "./types.js";

export type {
  LlmCompleteJsonOptions,
  LlmCompleteJsonResult,
  LlmMessage,
  LlmProvider,
} from "./types.js";
export { completeAndParse } from "./types.js";
export { OpenAiLlmProvider } from "./openai.js";
export { AnthropicLlmProvider } from "./anthropic.js";
export { GeminiLlmProvider } from "./gemini.js";
export {
  createLlmProvider,
  DisabledLlmProvider,
  publicLlmConfig,
  type LlmProviderConfig,
  type LlmProviderName,
} from "./config.js";
export {
  validateLlmCredentials,
  type LlmValidateResult,
} from "./validate.js";

let cached: LlmProvider | undefined;
let cachedKey: string | undefined;

function cacheKey(config?: LlmProviderConfig): string {
  return JSON.stringify({
    p: config?.provider ?? process.env.LLM_PROVIDER ?? "openai",
    m: config?.model ?? "",
    b: config?.baseUrl ?? "",
    k: config?.apiKey ? "1" : "0",
    e: config?.enabled === false ? "0" : "1",
  });
}

/** Default / project-scoped provider. Cached per config fingerprint. */
export function getDefaultLlmProvider(
  config?: LlmProviderConfig,
): LlmProvider {
  const key = cacheKey(config);
  if (!cached || cachedKey !== key) {
    cached = createLlmProvider(config ?? {});
    cachedKey = key;
  }
  return cached;
}

/** Test helper — reset cached provider. */
export function resetDefaultLlmProvider(): void {
  cached = undefined;
  cachedKey = undefined;
}
