import type { z } from "zod";

export type LlmMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export type LlmCompleteJsonOptions = {
  messages: LlmMessage[];
  temperature?: number;
  /** Logical task name for logging / future routing */
  task?: string;
};

export type LlmCompleteJsonResult = {
  raw: string;
  provider: string;
  model: string;
};

/**
 * Swappable LLM motor. Synapsee owns knowledge; providers only complete tasks.
 * Fail-closed: implementations return null when unavailable / errored.
 */
export interface LlmProvider {
  readonly name: string;
  readonly model: string;
  isAvailable(): boolean;
  completeJson(
    opts: LlmCompleteJsonOptions,
  ): Promise<LlmCompleteJsonResult | null>;
}

export async function completeAndParse<T>(
  provider: LlmProvider,
  opts: LlmCompleteJsonOptions,
  schema: z.ZodType<T>,
): Promise<{ data: T; provider: string; model: string } | null> {
  if (!provider.isAvailable()) return null;
  const result = await provider.completeJson(opts);
  if (!result) return null;
  try {
    const parsed = schema.safeParse(JSON.parse(result.raw));
    if (!parsed.success) return null;
    return {
      data: parsed.data,
      provider: result.provider,
      model: result.model,
    };
  } catch {
    return null;
  }
}
