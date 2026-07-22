import { getApiKey } from "../lib/api";

export function SettingsPage() {
  const key = getApiKey();
  const masked = key ? `${key.slice(0, 3)}${"•".repeat(Math.max(0, key.length - 3))}` : "—";

  return (
    <div className="mx-auto max-w-xl">
      <p className="text-xs font-medium uppercase tracking-widest text-cyan">Configurações</p>
      <h1 className="mt-1 text-2xl font-bold text-white">Sessão</h1>

      <div className="mt-8 space-y-4 rounded-2xl border border-border bg-surface-card p-5 card-glow">
        <div>
          <p className="text-xs text-slate-500">API Key</p>
          <p className="mt-1 font-mono text-sm text-slate-300">{masked}</p>
        </div>
        <div>
          <p className="text-xs text-slate-500">Modo</p>
          <p className="mt-1 text-sm text-slate-300">
            {import.meta.env.VITE_USE_MOCK !== "false" ? "Mock (localStorage)" : "API real"}
          </p>
        </div>
        <div>
          <p className="text-xs text-slate-500">API URL</p>
          <p className="mt-1 font-mono text-sm text-slate-300">
            {import.meta.env.VITE_API_URL || "(relative / proxy)"}
          </p>
        </div>
      </div>
    </div>
  );
}
