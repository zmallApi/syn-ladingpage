import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { setApiKey, USE_MOCK, verifyApiKey } from "../lib/api";

export function LoginPage() {
  const navigate = useNavigate();
  const [key, setKey] = useState("dev-key");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!key.trim()) {
      setError("Informe a API key");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await verifyApiKey(key.trim());
      setApiKey(key.trim());
      navigate("/projects", { replace: true });
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Não foi possível validar a API key. A API está no ar?",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-surface px-4">
      <div className="absolute inset-0 grid-bg opacity-40" />
      <div className="absolute left-1/2 top-1/4 h-64 w-96 -translate-x-1/2 rounded-full bg-cyan/5 blur-3xl" />

      <form
        onSubmit={submit}
        className="relative w-full max-w-md rounded-2xl border border-border bg-surface-card p-6 card-glow"
      >
        <div className="mb-6 flex items-center gap-2.5">
          <img src="/favicon.svg" alt="" className="h-8 w-8" />
          <div>
            <h1 className="text-lg font-semibold text-white">
              Synapsee <span className="text-cyan">IA</span>
            </h1>
            <p className="text-xs text-slate-500">Admin — acesso com API key</p>
          </div>
        </div>

        <label className="block">
          <span className="mb-1.5 block text-xs font-medium text-slate-400">API Key</span>
          <input
            type="password"
            value={key}
            onChange={(e) => {
              setKey(e.target.value);
              setError(null);
            }}
            className="w-full rounded-lg border border-border bg-surface-raised px-3 py-2.5 font-mono text-sm text-white outline-none focus:border-cyan/50 focus:ring-1 focus:ring-cyan/25"
            placeholder="PLATFORM_API_KEY"
            autoComplete="current-password"
          />
        </label>

        {error && <p className="mt-2 text-xs text-red-400">{error}</p>}

        <p className="mt-3 text-[11px] text-slate-600">
          {USE_MOCK ? (
            <>
              Modo mock ativo — qualquer key funciona. Defina{" "}
              <code className="text-slate-400">VITE_USE_MOCK=false</code> para a API real.
            </>
          ) : (
            <>
              Conectado à API em{" "}
              <code className="text-slate-400">
                {import.meta.env.VITE_API_URL || "(proxy)"}
              </code>
              . Use a mesma <code className="text-slate-400">PLATFORM_API_KEY</code> do backend.
            </>
          )}
        </p>

        <button
          type="submit"
          disabled={busy}
          className="mt-6 w-full rounded-xl cyan-gradient py-2.5 text-sm font-semibold text-surface disabled:opacity-60"
        >
          {busy ? "Validando..." : "Entrar"}
        </button>
      </form>
    </div>
  );
}
