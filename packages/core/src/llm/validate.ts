import type { LlmProviderConfig } from "./config.js";

export type LlmValidateResult =
  | { ok: true; provider: string; model?: string }
  | { ok: false; error: string };

/**
 * Ping the provider with the given credentials before persisting.
 * Uses lightweight list-models endpoints (no generation cost when available).
 */
export async function validateLlmCredentials(
  config: LlmProviderConfig & { apiKey: string },
): Promise<LlmValidateResult> {
  const provider = (
    config.provider ??
    process.env.LLM_PROVIDER ??
    "openai"
  ).toLowerCase();
  const apiKey = config.apiKey.trim();
  if (!apiKey) {
    return { ok: false, error: "API key vazia" };
  }

  if (provider === "none" || provider === "disabled" || config.enabled === false) {
    return { ok: true, provider: "none" };
  }

  try {
    if (provider === "anthropic" || provider === "claude") {
      return await validateAnthropic(apiKey, config.model, config.baseUrl);
    }
    if (provider === "gemini" || provider === "google") {
      return await validateGemini(apiKey, config.model, config.baseUrl);
    }
    // openai + openai_compatible
    return await validateOpenAiCompatible(
      apiKey,
      config.model,
      config.baseUrl,
      provider === "openai_compatible",
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `Falha ao validar: ${message}` };
  }
}

async function validateOpenAiCompatible(
  apiKey: string,
  model: string | undefined,
  baseUrl: string | undefined,
  requireBaseUrl: boolean,
): Promise<LlmValidateResult> {
  const base = (
    baseUrl?.trim() ||
    process.env.OPENAI_BASE_URL ||
    (requireBaseUrl ? "" : "https://api.openai.com/v1")
  ).replace(/\/$/, "");

  if (!base) {
    return {
      ok: false,
      error: "Base URL é obrigatória para OpenAI-compatible (ex.: http://localhost:11434/v1)",
    };
  }

  const res = await fetch(`${base}/models`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
  });

  if (res.status === 401 || res.status === 403) {
    return { ok: false, error: "API key inválida ou sem permissão (OpenAI)" };
  }
  if (!res.ok) {
    const text = (await res.text().catch(() => "")).slice(0, 200);
    return {
      ok: false,
      error: `Provider recusou a key (HTTP ${res.status})${text ? `: ${text}` : ""}`,
    };
  }

  if (model?.trim()) {
    const body = (await res.json().catch(() => null)) as {
      data?: Array<{ id?: string }>;
    } | null;
    const ids = new Set(
      (body?.data ?? []).map((m) => m.id).filter(Boolean) as string[],
    );
    if (ids.size > 0 && !ids.has(model.trim())) {
      return {
        ok: false,
        error: `Modelo "${model.trim()}" não encontrado neste provider. Confira o nome.`,
      };
    }
  }

  return {
    ok: true,
    provider: requireBaseUrl ? "openai_compatible" : "openai",
    model: model?.trim() || undefined,
  };
}

async function validateAnthropic(
  apiKey: string,
  model: string | undefined,
  baseUrl: string | undefined,
): Promise<LlmValidateResult> {
  const base = (
    baseUrl?.trim() ||
    process.env.ANTHROPIC_BASE_URL ||
    "https://api.anthropic.com"
  ).replace(/\/$/, "");

  const res = await fetch(`${base}/v1/models`, {
    method: "GET",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
  });

  if (res.status === 401 || res.status === 403) {
    return { ok: false, error: "API key inválida ou sem permissão (Anthropic)" };
  }
  if (!res.ok) {
    // Some accounts may not expose /v1/models — fall back to a tiny Messages call.
    if (res.status === 404) {
      return validateAnthropicWithPing(apiKey, model, base);
    }
    const text = (await res.text().catch(() => "")).slice(0, 200);
    return {
      ok: false,
      error: `Provider recusou a key (HTTP ${res.status})${text ? `: ${text}` : ""}`,
    };
  }

  return {
    ok: true,
    provider: "anthropic",
    model: model?.trim() || undefined,
  };
}

async function validateAnthropicWithPing(
  apiKey: string,
  model: string | undefined,
  base: string,
): Promise<LlmValidateResult> {
  const res = await fetch(`${base}/v1/messages`, {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: model?.trim() || "claude-3-5-haiku-latest",
      max_tokens: 8,
      messages: [{ role: "user", content: "ping" }],
    }),
  });
  if (res.status === 401 || res.status === 403) {
    return { ok: false, error: "API key inválida ou sem permissão (Anthropic)" };
  }
  if (!res.ok) {
    const text = (await res.text().catch(() => "")).slice(0, 200);
    return {
      ok: false,
      error: `Provider recusou a key (HTTP ${res.status})${text ? `: ${text}` : ""}`,
    };
  }
  return {
    ok: true,
    provider: "anthropic",
    model: model?.trim() || undefined,
  };
}

async function validateGemini(
  apiKey: string,
  model: string | undefined,
  baseUrl: string | undefined,
): Promise<LlmValidateResult> {
  const base = (
    baseUrl?.trim() ||
    process.env.GEMINI_BASE_URL ||
    "https://generativelanguage.googleapis.com/v1beta"
  ).replace(/\/$/, "");

  const res = await fetch(
    `${base}/models?key=${encodeURIComponent(apiKey)}`,
    { method: "GET" },
  );

  if (res.status === 400 || res.status === 401 || res.status === 403) {
    return { ok: false, error: "API key inválida ou sem permissão (Gemini)" };
  }
  if (!res.ok) {
    const text = (await res.text().catch(() => "")).slice(0, 200);
    return {
      ok: false,
      error: `Provider recusou a key (HTTP ${res.status})${text ? `: ${text}` : ""}`,
    };
  }

  if (model?.trim()) {
    const body = (await res.json().catch(() => null)) as {
      models?: Array<{ name?: string }>;
    } | null;
    const wanted = model.trim();
    const names = (body?.models ?? [])
      .map((m) => m.name ?? "")
      .filter(Boolean);
    const ok = names.some(
      (n) =>
        n === wanted ||
        n.endsWith(`/${wanted}`) ||
        n === `models/${wanted}`,
    );
    if (names.length > 0 && !ok) {
      return {
        ok: false,
        error: `Modelo "${wanted}" não encontrado neste provider. Confira o nome.`,
      };
    }
  }

  return {
    ok: true,
    provider: "gemini",
    model: model?.trim() || undefined,
  };
}
