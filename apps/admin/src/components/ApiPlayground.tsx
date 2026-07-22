import { useState } from "react";
import { api } from "../lib/api";

export function ApiPlayground({
  projectId,
  resources,
}: {
  projectId: string;
  resources: string[];
}) {
  const [resource, setResource] = useState(resources[0] ?? "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [response, setResponse] = useState<unknown>(null);

  const path = resource ? `/p/${projectId}/${resource}?limit=10` : "";

  async function run() {
    if (!resource) return;
    setLoading(true);
    setError(null);
    try {
      const data = await api.probe(projectId, resource, { limit: 10 });
      setResponse(data);
    } catch (err) {
      setResponse(null);
      setError(err instanceof Error ? err.message : "Falha na requisição");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <label className="block min-w-[160px] flex-1">
          <span className="mb-1.5 block text-xs font-medium text-slate-400">Recurso</span>
          <select
            className="w-full rounded-lg border border-border bg-surface-raised px-3 py-2 text-sm text-white outline-none focus:border-cyan/50"
            value={resource}
            onChange={(e) => setResource(e.target.value)}
          >
            {resources.length === 0 && <option value="">Nenhum recurso exposto</option>}
            {resources.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          disabled={!resource || loading}
          onClick={run}
          className="rounded-xl cyan-gradient px-5 py-2.5 text-sm font-semibold text-surface disabled:opacity-50"
        >
          {loading ? "Consultando..." : "GET"}
        </button>
      </div>

      <div className="rounded-xl border border-border bg-surface p-3 font-mono text-xs text-slate-400">
        <span className="text-cyan">GET</span>{" "}
        <span className="break-all">{path || "—"}</span>
      </div>

      {error && (
        <p className="rounded-lg border border-red-500/20 bg-red-500/5 px-3 py-2 text-xs text-red-400">
          {error}
        </p>
      )}

      {response !== null && (
        <pre className="max-h-72 overflow-auto rounded-xl border border-border bg-surface p-3 font-mono text-[11px] leading-relaxed break-words whitespace-pre-wrap text-slate-300 sm:p-4">
          {JSON.stringify(response, null, 2)}
        </pre>
      )}

      <button
        type="button"
        className="inline-block text-xs text-cyan hover:underline"
        onClick={async () => {
          try {
            const spec = await api.fetchOpenApi(projectId);
            const blob = new Blob([JSON.stringify(spec, null, 2)], {
              type: "application/json",
            });
            const url = URL.createObjectURL(blob);
            window.open(url, "_blank", "noopener,noreferrer");
            setTimeout(() => URL.revokeObjectURL(url), 60_000);
          } catch (err) {
            setError(err instanceof Error ? err.message : "Falha ao abrir OpenAPI");
          }
        }}
      >
        Abrir OpenAPI →
      </button>
    </div>
  );
}
