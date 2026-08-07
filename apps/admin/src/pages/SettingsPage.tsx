import { useEffect, useState } from "react";
import {
  api,
  getApiKey,
  getStoredTenant,
  getToken,
  setApiKey,
  USE_MOCK,
} from "../lib/api";

type KeyRow = {
  id: string;
  name: string;
  prefix: string;
  createdAt: string;
  revokedAt: string | null;
};

export function SettingsPage() {
  const [tenantId, setTenantId] = useState(getStoredTenant()?.id ?? "");
  const [tenantName, setTenantName] = useState(getStoredTenant()?.name ?? "—");
  const [email, setEmail] = useState<string | null>(null);
  const [usage, setUsage] = useState<{
    projects: number;
    missionRunsMonth: number;
    maxProjects: number;
    maxMissionRunsMonth: number;
  } | null>(null);
  const [keys, setKeys] = useState<KeyRow[]>([]);
  const [newKey, setNewKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const sessionKey = getApiKey();
  const hasJwt = Boolean(getToken());

  async function refresh() {
    try {
      const me = await api.me();
      setTenantId(me.tenant.id);
      setTenantName(me.tenant.name);
      setEmail(me.user?.email ?? null);
      setUsage(me.usage ?? null);
      const listed = await api.listApiKeys(me.tenant.id);
      setKeys(listed.keys);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao carregar");
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  async function createKey() {
    if (!tenantId) return;
    setBusy(true);
    setError(null);
    try {
      const created = await api.createApiKey(tenantId, "Admin");
      setNewKey(created.token);
      setApiKey(created.token);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao criar key");
    } finally {
      setBusy(false);
    }
  }

  async function revoke(keyId: string) {
    if (!tenantId) return;
    setBusy(true);
    try {
      await api.revokeApiKey(tenantId, keyId);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao revogar");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-xl">
      <p className="text-xs font-medium uppercase tracking-widest text-cyan">
        Configurações
      </p>
      <h1 className="mt-1 text-2xl font-bold text-white">Conta / Tenant</h1>

      <div className="mt-8 space-y-4 rounded-2xl border border-border bg-surface-card p-5 card-glow">
        <div>
          <p className="text-xs text-slate-500">Empresa</p>
          <p className="mt-1 text-sm text-slate-200">{tenantName}</p>
        </div>
        {email && (
          <div>
            <p className="text-xs text-slate-500">Usuário</p>
            <p className="mt-1 text-sm text-slate-300">{email}</p>
          </div>
        )}
        <div>
          <p className="text-xs text-slate-500">Sessão</p>
          <p className="mt-1 text-sm text-slate-300">
            {hasJwt ? "JWT (e-mail)" : sessionKey ? "API key" : "—"}
          </p>
        </div>
        {usage && (
          <div>
            <p className="text-xs text-slate-500">Uso do plano</p>
            <p className="mt-1 text-sm text-slate-300">
              Projetos {usage.projects}/{usage.maxProjects} · Missões no mês{" "}
              {usage.missionRunsMonth}/{usage.maxMissionRunsMonth}
            </p>
          </div>
        )}
        <div>
          <p className="text-xs text-slate-500">Modo</p>
          <p className="mt-1 text-sm text-slate-300">
            {USE_MOCK ? "Mock" : "API real"}
          </p>
        </div>
      </div>

      <div className="mt-8 rounded-2xl border border-border bg-surface-card p-5 card-glow">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-white">API keys</h2>
            <p className="mt-1 text-xs text-slate-500">
              Para MCP e automação. Prefixo <code>syn_tk_</code>.
            </p>
          </div>
          <button
            type="button"
            disabled={busy || !tenantId}
            onClick={() => void createKey()}
            className="shrink-0 rounded-lg cyan-gradient px-3 py-2 text-xs font-semibold text-surface disabled:opacity-50"
          >
            Nova key
          </button>
        </div>

        {newKey && (
          <div className="mt-4 rounded-lg border border-cyan/30 bg-cyan/5 p-3">
            <p className="text-[11px] text-slate-400">
              Copie agora — não será mostrada de novo.
            </p>
            <pre className="mt-2 overflow-x-auto font-mono text-xs text-cyan">
              {newKey}
            </pre>
          </div>
        )}

        {error && <p className="mt-3 text-xs text-red-400">{error}</p>}

        <ul className="mt-4 space-y-2">
          {keys.map((k) => (
            <li
              key={k.id}
              className="flex items-center justify-between gap-2 rounded-lg border border-border bg-surface px-3 py-2"
            >
              <div className="min-w-0">
                <p className="truncate text-sm text-slate-200">{k.name}</p>
                <p className="font-mono text-[11px] text-slate-500">
                  {k.prefix}…{" "}
                  {k.revokedAt ? (
                    <span className="text-red-400">revogada</span>
                  ) : (
                    "ativa"
                  )}
                </p>
              </div>
              {!k.revokedAt && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void revoke(k.id)}
                  className="text-xs text-slate-500 hover:text-red-400"
                >
                  Revogar
                </button>
              )}
            </li>
          ))}
          {keys.length === 0 && (
            <li className="text-xs text-slate-600">Nenhuma key ainda.</li>
          )}
        </ul>
      </div>
    </div>
  );
}
