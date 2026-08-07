import type { LlmCompleteJsonOptions, LlmCompleteJsonResult, LlmProvider } from "./types.js";

export type OpenAiProviderOptions = {
  apiKey?: string;
  model?: string;
  baseUrl?: string;
};

/**
 * OpenAI Chat Completions JSON mode. Also works with OpenAI-compatible
 * endpoints (Ollama/vLLM) when baseUrl + apiKey are set.
 */
export class OpenAiLlmProvider implements LlmProvider {
  readonly name = "openai";
  readonly model: string;
  private readonly apiKey: string | undefined;
  private readonly baseUrl: string;

  constructor(opts: OpenAiProviderOptions = {}) {
    this.apiKey = opts.apiKey ?? process.env.OPENAI_API_KEY;
    this.model = opts.model ?? process.env.OPENAI_MODEL ?? "gpt-4o-mini";
    this.baseUrl = (
      opts.baseUrl ??
      process.env.OPENAI_BASE_URL ??
      "https://api.openai.com/v1"
    ).replace(/\/$/, "");
  }

  isAvailable(): boolean {
    return Boolean(this.apiKey);
  }

  async completeJson(
    opts: LlmCompleteJsonOptions,
  ): Promise<LlmCompleteJsonResult | null> {
    if (!this.apiKey) return null;
    try {
      const res = await fetch(`${this.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: this.model,
          temperature: opts.temperature ?? 0,
          response_format: { type: "json_object" },
          messages: opts.messages,
        }),
      });
      if (!res.ok) return null;
      const body = (await res.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      const raw = body.choices?.[0]?.message?.content;
      if (!raw) return null;
      return { raw, provider: this.name, model: this.model };
    } catch {
      return null;
    }
  }
}
