import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  api,
  setApiKey,
  setStoredTenant,
  USE_MOCK,
  verifyApiKey,
} from "../lib/api";

type Mode = "email" | "key";

export function LoginPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<Mode>("email");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [key, setKey] = useState("dev-key");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submitEmail(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.login({ email: email.trim(), password });
      navigate("/projects", { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha no login");
    } finally {
      setBusy(false);
    }
  }

  async function submitKey(e: React.FormEvent) {
    e.preventDefault();
    if (!key.trim()) {
      setError("Informe a API key");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await verifyApiKey(key.trim());
      localStorage.removeItem("synapsee_admin_jwt");
      setApiKey(key.trim());
      try {
        const me = await api.me();
        setStoredTenant({ id: me.tenant.id, name: me.tenant.name });
      } catch {
        setStoredTenant(null);
      }
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

      <div className="relative w-full max-w-md rounded-2xl border border-border bg-surface-card p-6 card-glow">
        <div className="mb-6 flex items-center gap-2.5">
          <img src="/favicon.svg" alt="" className="h-8 w-8" />
          <div>
            <h1 className="text-lg font-semibold text-white">
              Synapsee <span className="text-cyan">IA</span>
            </h1>
            <p className="text-xs text-slate-500">Admin — acesso por conta ou API key</p>
          </div>
        </div>

        <div className="mb-4 flex gap-2 rounded-lg border border-border bg-surface p-1">
          {(
            [
              ["email", "E-mail"],
              ["key", "API key"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => {
                setMode(id);
                setError(null);
              }}
              className={`flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition ${
                mode === id
                  ? "bg-cyan/15 text-cyan"
                  : "text-slate-500 hover:text-slate-300"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {mode === "email" ? (
          <form onSubmit={submitEmail}>
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-slate-400">
                E-mail
              </span>
              <input
                type="email"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  setError(null);
                }}
                className="w-full rounded-lg border border-border bg-surface-raised px-3 py-2.5 text-sm text-white outline-none focus:border-cyan/50 focus:ring-1 focus:ring-cyan/25"
                placeholder="voce@empresa.com"
                autoComplete="email"
                required
              />
            </label>
            <label className="mt-3 block">
              <span className="mb-1.5 block text-xs font-medium text-slate-400">
                Senha
              </span>
              <input
                type="password"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  setError(null);
                }}
                className="w-full rounded-lg border border-border bg-surface-raised px-3 py-2.5 text-sm text-white outline-none focus:border-cyan/50 focus:ring-1 focus:ring-cyan/25"
                autoComplete="current-password"
                required
              />
            </label>
            {error && <p className="mt-2 text-xs text-red-400">{error}</p>}
            <button
              type="submit"
              disabled={busy}
              className="mt-5 w-full rounded-xl cyan-gradient px-4 py-2.5 text-sm font-semibold text-surface disabled:opacity-60"
            >
              {busy ? "Entrando…" : "Entrar"}
            </button>
            <p className="mt-4 text-center text-xs text-slate-500">
              Não tem conta?{" "}
              <Link to="/signup" className="text-cyan hover:underline">
                Criar conta
              </Link>
            </p>
          </form>
        ) : (
          <form onSubmit={submitKey}>
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-slate-400">
                API Key
              </span>
              <input
                type="password"
                value={key}
                onChange={(e) => {
                  setKey(e.target.value);
                  setError(null);
                }}
                className="w-full rounded-lg border border-border bg-surface-raised px-3 py-2.5 font-mono text-sm text-white outline-none focus:border-cyan/50 focus:ring-1 focus:ring-cyan/25"
                placeholder="syn_tk_… ou PLATFORM_API_KEY"
                autoComplete="current-password"
              />
            </label>
            {error && <p className="mt-2 text-xs text-red-400">{error}</p>}
            <p className="mt-3 text-[11px] text-slate-600">
              {USE_MOCK ? (
                <>Modo mock — qualquer key funciona.</>
              ) : (
                <>
                  Use a key do tenant (<code className="text-slate-400">syn_tk_…</code>)
                  ou a key de ops da plataforma.
                </>
              )}
            </p>
            <button
              type="submit"
              disabled={busy}
              className="mt-5 w-full rounded-xl cyan-gradient px-4 py-2.5 text-sm font-semibold text-surface disabled:opacity-60"
            >
              {busy ? "Validando…" : "Entrar com API key"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
