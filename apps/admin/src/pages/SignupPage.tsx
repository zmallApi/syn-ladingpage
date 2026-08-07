import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../lib/api";

export function SignupPage() {
  const navigate = useNavigate();
  const [companyName, setCompanyName] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [shownKey, setShownKey] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const session = await api.signup({
        email: email.trim(),
        password,
        companyName: companyName.trim(),
        name: name.trim() || undefined,
      });
      if (session.apiKey?.token) {
        setShownKey(session.apiKey.token);
      } else {
        navigate("/projects", { replace: true });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha no cadastro");
    } finally {
      setBusy(false);
    }
  }

  if (shownKey) {
    return (
      <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-surface px-4">
        <div className="relative w-full max-w-md rounded-2xl border border-border bg-surface-card p-6 card-glow">
          <h1 className="text-lg font-semibold text-white">Conta criada</h1>
          <p className="mt-2 text-sm text-slate-400">
            Guarde a API key do tenant — ela não será mostrada de novo. Use no MCP
            (Cursor, Claude…).
          </p>
          <pre className="mt-4 overflow-x-auto rounded-lg border border-cyan/30 bg-cyan/5 p-3 font-mono text-xs text-cyan">
            {shownKey}
          </pre>
          <button
            type="button"
            onClick={() => navigate("/projects", { replace: true })}
            className="mt-5 w-full rounded-xl cyan-gradient px-4 py-2.5 text-sm font-semibold text-surface"
          >
            Ir para o Admin
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-surface px-4">
      <div className="absolute inset-0 grid-bg opacity-40" />
      <form
        onSubmit={submit}
        className="relative w-full max-w-md rounded-2xl border border-border bg-surface-card p-6 card-glow"
      >
        <h1 className="text-lg font-semibold text-white">
          Criar conta <span className="text-cyan">Synapsee</span>
        </h1>
        <p className="mt-1 text-xs text-slate-500">
          Cada empresa = um tenant. Você vira owner da sua conta.
        </p>

        <label className="mt-5 block">
          <span className="mb-1.5 block text-xs font-medium text-slate-400">
            Empresa
          </span>
          <input
            value={companyName}
            onChange={(e) => setCompanyName(e.target.value)}
            className="w-full rounded-lg border border-border bg-surface-raised px-3 py-2.5 text-sm text-white outline-none focus:border-cyan/50"
            required
          />
        </label>
        <label className="mt-3 block">
          <span className="mb-1.5 block text-xs font-medium text-slate-400">
            Seu nome
          </span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded-lg border border-border bg-surface-raised px-3 py-2.5 text-sm text-white outline-none focus:border-cyan/50"
          />
        </label>
        <label className="mt-3 block">
          <span className="mb-1.5 block text-xs font-medium text-slate-400">
            E-mail
          </span>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-lg border border-border bg-surface-raised px-3 py-2.5 text-sm text-white outline-none focus:border-cyan/50"
            required
          />
        </label>
        <label className="mt-3 block">
          <span className="mb-1.5 block text-xs font-medium text-slate-400">
            Senha (mín. 8)
          </span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            minLength={8}
            className="w-full rounded-lg border border-border bg-surface-raised px-3 py-2.5 text-sm text-white outline-none focus:border-cyan/50"
            required
          />
        </label>

        {error && <p className="mt-2 text-xs text-red-400">{error}</p>}

        <button
          type="submit"
          disabled={busy}
          className="mt-5 w-full rounded-xl cyan-gradient px-4 py-2.5 text-sm font-semibold text-surface disabled:opacity-60"
        >
          {busy ? "Criando…" : "Criar conta"}
        </button>
        <p className="mt-4 text-center text-xs text-slate-500">
          Já tem conta?{" "}
          <Link to="/login" className="text-cyan hover:underline">
            Entrar
          </Link>
        </p>
      </form>
    </div>
  );
}
