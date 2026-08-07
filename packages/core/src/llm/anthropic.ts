import type {
  LlmCompleteJsonOptions,
  LlmCompleteJsonResult,
  LlmProvider,
} from "./types.js";

export type AnthropicProviderOptions = {
  apiKey?: string;
  model?: string;
  baseUrl?: string;
};

/**
 * Anthropic Messages API — JSON via system instruction (no native json_object).
 */
export class AnthropicLlmProvider implements LlmProvider {
  readonly name = "anthropic";
  readonly model: string;
  private readonly apiKey: string | undefined;
  private readonly baseUrl: string;

  constructor(opts: AnthropicProviderOptions = {}) {
    this.apiKey = opts.apiKey ?? process.env.ANTHROPIC_API_KEY;
    this.model =
      opts.model ?? process.env.ANTHROPIC_MODEL ?? "claude-3-5-haiku-latest";
    this.baseUrl = (
      opts.baseUrl ??
      process.env.ANTHROPIC_BASE_URL ??
      "https://api.anthropic.com"
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
      const systemParts: string[] = [
        "Reply with a single JSON object only. No markdown fences.",
      ];
      const messages: Array<{ role: "user" | "assistant"; content: string }> =
        [];
      for (const m of opts.messages) {
        if (m.role === "system") {
          systemParts.push(m.content);
        } else if (m.role === "user" || m.role === "assistant") {
          messages.push({ role: m.role, content: m.content });
        }
      }
      if (!messages.length) return null;

      const res = await fetch(`${this.baseUrl}/v1/messages`, {
        method: "POST",
        headers: {
          "x-api-key": this.apiKey,
          "anthropic-version": "2023-06-01",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: this.model,
          max_tokens: 4096,
          temperature: opts.temperature ?? 0,
          system: systemParts.join("\n"),
          messages,
        }),
      });
      if (!res.ok) return null;
      const body = (await res.json()) as {
        content?: Array<{ type?: string; text?: string }>;
      };
      const raw = body.content
        ?.filter((c) => c.type === "text" && c.text)
        .map((c) => c.text!)
        .join("\n");
      if (!raw) return null;
      const json = extractJsonObject(raw);
      if (!json) return null;
      return { raw: json, provider: this.name, model: this.model };
    } catch {
      return null;
    }
  }
}

function extractJsonObject(text: string): string | null {
  const trimmed = text.trim();
  if (trimmed.startsWith("{")) {
    try {
      JSON.parse(trimmed);
      return trimmed;
    } catch {
      /* fall through */
    }
  }
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start >= 0 && end > start) {
    const slice = trimmed.slice(start, end + 1);
    try {
      JSON.parse(slice);
      return slice;
    } catch {
      return null;
    }
  }
  return null;
}
