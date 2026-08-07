import { useEffect, useState } from "react";
import { api } from "../lib/api";
import type { Project } from "../lib/types";

const PROVIDERS = [
  { id: "openai", label: "OpenAI" },
  { id: "anthropic", label: "Anthropic (Claude)" },
  { id: "gemini", label: "Google Gemini" },
  { id: "openai_compatible", label: "OpenAI-compatible (Ollama/vLLM)" },
] as const;

function isProjectLlmOn(project: Project): boolean {
  return (
    project.llmConfig?.enabled === true &&
    Boolean(project.llmConfig?.hasApiKey) &&
    project.llmConfig?.provider !== "none"
  );
}

export function LlmConfigPanel({
  project,
  onProjectUpdate,
}: {
  project: Project;
  onProjectUpdate?: (p: Project) => void;
}) {
  const [provider, setProvider] = useState(
    project.llmConfig?.provider && project.llmConfig.provider !== "none"
      ? project.llmConfig.provider
      : "openai",
  );
  const [model, setModel] = useState(project.llmConfig?.model ?? "");
  const [baseUrl, setBaseUrl] = useState(project.llmConfig?.baseUrl ?? "");
  const [apiKey, setApiKey] = useState("");
  const [hasApiKey, setHasApiKey] = useState(
    Boolean(project.llmConfig?.hasApiKey && isProjectLlmOn(project)),
  );
  const [enabled, setEnabled] = useState(isProjectLlmOn(project));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  useEffect(() => {
    const on = isProjectLlmOn(project);
    setEnabled(on);
    setProvider(
      project.llmConfig?.provider && project.llmConfig.provider !== "none"
        ? project.llmConfig.provider
        : "openai",
    );
    setModel(project.llmConfig?.model ?? "");
    setBaseUrl(project.llmConfig?.baseUrl ?? "");
    setHasApiKey(Boolean(on && project.llmConfig?.hasApiKey));
    setApiKey("");
  }, [project.id, project.llmConfig]);

  async function save() {
    setError(null);
    setOk(null);
    const keyTrim = apiKey.trim();
    if (!keyTrim && !hasApiKey) {
      setError(
        "Cole uma API key para conectar. Salvar com os campos vazios não liga o LLM.",
      );
      return;
    }
    if (provider === "openai_compatible" && !baseUrl.trim()) {
      setError("Informe a Base URL do endpoint (ex.: http://localhost:11434/v1).");
      return;
    }

    setBusy(true);
    try {
      const { llmConfig } = await api.setLlmConfig(project.id, {
        enabled: true,
        provider: provider as
          | "openai"
          | "anthropic"
          | "gemini"
          | "openai_compatible",
        model: model.trim() || null,
        baseUrl:
          provider === "openai_compatible" ? baseUrl.trim() || null : null,
        apiKey: keyTrim || undefined,
      });
      const on = llmConfig.enabled === true && llmConfig.hasApiKey;
      setEnabled(on);
      setHasApiKey(Boolean(llmConfig.hasApiKey));
      setApiKey("");
      if (!on) {
        setError(
          "Não foi possível conectar: é necessária uma API key no projeto.",
        );
      } else {
        setOk("LLM conectada neste projeto");
      }
      onProjectUpdate?.({ ...project, llmConfig });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao salvar");
    } finally {
      setBusy(false);
    }
  }

  async function disconnect() {
    setBusy(true);
    setError(null);
    setOk(null);
    try {
      const { llmConfig } = await api.setLlmConfig(project.id, {
        enabled: false,
        provider: "none",
        clearApiKey: true,
        model: null,
        baseUrl: null,
      });
      setEnabled(false);
      setHasApiKey(false);
      setApiKey("");
      setOk("LLM desconectada neste projeto");
      onProjectUpdate?.({ ...project, llmConfig });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao desconectar");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-2xl border border-border bg-surface-card p-5 card-glow sm:p-6">
      <p className="text-xs font-medium uppercase tracking-widest text-cyan">
        Configuração
      </p>
      <h2 className="mt-1 text-lg font-semibold text-white">LLM Provider</h2>
      <p className="mt-1 text-sm text-slate-400">
        Para ligar, salve com uma API key neste projeto. Campos vazios não
        ativam o LLM.
      </p>

      <div
        className={`mt-4 rounded-lg border px-3 py-2 text-xs ${
          enabled
            ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-200"
            : "border-slate-600 bg-surface text-slate-400"
        }`}
      >
        {enabled ? (
          <>
            LLM <span className="font-medium">conectada</span> · key salva no
            projeto
          </>
        ) : (
          <>
            LLM <span className="font-medium">desconectada</span> neste projeto
          </>
        )}
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className="block text-xs text-slate-400">
          Provider
          <select
            value={provider}
            onChange={(e) => setProvider(e.target.value)}
            disabled={busy}
            className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-white disabled:opacity-50"
          >
            {PROVIDERS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-xs text-slate-400">
          Modelo (opcional)
          <input
            value={model}
            onChange={(e) => setModel(e.target.value)}
            placeholder="ex.: gpt-4o-mini, claude-3-5-haiku…"
            disabled={busy}
            className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-white disabled:opacity-50"
          />
        </label>
        {provider === "openai_compatible" && (
          <label className="block text-xs text-slate-400 sm:col-span-2">
            Base URL
            <input
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              placeholder="http://localhost:11434/v1"
              disabled={busy}
              className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-white disabled:opacity-50"
            />
          </label>
        )}
        <label className="block text-xs text-slate-400 sm:col-span-2">
          API key <span className="text-slate-500">(obrigatória para conectar)</span>
          <input
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder={
              hasApiKey ? "•••••••• (já salva — cole outra para trocar)" : "cole a key"
            }
            disabled={busy}
            className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-white disabled:opacity-50"
            autoComplete="off"
          />
        </label>
      </div>

      {error && <p className="mt-3 text-xs text-red-400">{error}</p>}
      {ok && <p className="mt-3 text-xs text-emerald-400">{ok}</p>}

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => void save()}
          className="rounded-lg cyan-gradient px-3 py-2 text-xs font-semibold text-surface disabled:opacity-50"
        >
          {busy
            ? "Validando…"
            : enabled
              ? "Salvar LLM"
              : "Conectar LLM"}
        </button>
        {enabled && (
          <button
            type="button"
            disabled={busy}
            onClick={() => void disconnect()}
            className="rounded-lg border border-border px-3 py-2 text-xs font-medium text-slate-300 hover:border-red-500/40 hover:text-red-300 disabled:opacity-50"
          >
            Desconectar LLM
          </button>
        )}
      </div>
    </div>
  );
}
