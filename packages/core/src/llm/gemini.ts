import type {
  LlmCompleteJsonOptions,
  LlmCompleteJsonResult,
  LlmProvider,
} from "./types.js";

export type GeminiProviderOptions = {
  apiKey?: string;
  model?: string;
  baseUrl?: string;
};

/**
 * Google Gemini generateContent — JSON mime type when supported.
 */
export class GeminiLlmProvider implements LlmProvider {
  readonly name = "gemini";
  readonly model: string;
  private readonly apiKey: string | undefined;
  private readonly baseUrl: string;

  constructor(opts: GeminiProviderOptions = {}) {
    this.apiKey = opts.apiKey ?? process.env.GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY;
    this.model = opts.model ?? process.env.GEMINI_MODEL ?? "gemini-2.0-flash";
    this.baseUrl = (
      opts.baseUrl ??
      process.env.GEMINI_BASE_URL ??
      "https://generativelanguage.googleapis.com/v1beta"
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
      const systemBits: string[] = [];
      const contents: Array<{
        role: "user" | "model";
        parts: Array<{ text: string }>;
      }> = [];
      for (const m of opts.messages) {
        if (m.role === "system") {
          systemBits.push(m.content);
        } else if (m.role === "user") {
          contents.push({ role: "user", parts: [{ text: m.content }] });
        } else if (m.role === "assistant") {
          contents.push({ role: "model", parts: [{ text: m.content }] });
        }
      }
      if (!contents.length) return null;

      const url = `${this.baseUrl}/models/${encodeURIComponent(this.model)}:generateContent?key=${encodeURIComponent(this.apiKey)}`;
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          systemInstruction: systemBits.length
            ? { parts: [{ text: systemBits.join("\n") }] }
            : undefined,
          contents,
          generationConfig: {
            temperature: opts.temperature ?? 0,
            responseMimeType: "application/json",
          },
        }),
      });
      if (!res.ok) return null;
      const body = (await res.json()) as {
        candidates?: Array<{
          content?: { parts?: Array<{ text?: string }> };
        }>;
      };
      const raw = body.candidates?.[0]?.content?.parts
        ?.map((p) => p.text ?? "")
        .join("");
      if (!raw?.trim()) return null;
      return { raw: raw.trim(), provider: this.name, model: this.model };
    } catch {
      return null;
    }
  }
}
