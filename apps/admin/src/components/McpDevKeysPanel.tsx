import { useCallback, useEffect, useState } from "react";
import { api } from "../lib/api";

type McpKeyRow = {
  id: string;
  name: string;
  tokenPrefix: string;
  createdAt: string;
  revokedAt: string | null;
  lastUsedAt: string | null;
};

type CreatedKey = {
  id: string;
  name: string;
  token: string;
  tokenPrefix: string;
  createdAt: string;
  warning?: string;
  mcpUrl: string;
  cursorConfig: Record<string, unknown>;
};

export function McpDevKeysPanel({
  projectId,
  onActiveKey,
}: {
  projectId: string;
  /** When a key is minted, parent can inject it into the MCP snippet. */
  onActiveKey?: (token: string | null) => void;
}) {
  const [keys, setKeys] = useState<McpKeyRow[]>([]);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<CreatedKey | null>(null);
  const [copied, setCopied] = useState<"token" | "config" | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await api.listMcpKeys(projectId);
      setKeys(res.keys);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao listar chaves");
    }
  }, [projectId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function createKey() {
    const label = name.trim();
    if (!label) {
      setError("Informe o nome do desenvolvedor (ex.: Ana - Cursor)");
      return;
    }
    setBusy(true);
    setError(null);
    setCreated(null);
    try {
      const res = await api.createMcpKey(projectId, label);
      setCreated(res);
      setName("");
      onActiveKey?.(res.token);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao criar chave");
    } finally {
      setBusy(false);
    }
  }

  async function revoke(keyId: string, keyName: string) {
    if (!window.confirm(`Revogar chave “${keyName}”? O Cursor desse dev deixa de funcionar.`)) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.revokeMcpKey(projectId, keyId);
      if (created?.id === keyId) {
        setCreated(null);
        onActiveKey?.(null);
      }
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao revogar");
    } finally {
      setBusy(false);
    }
  }

  async function copy(kind: "token" | "config", value: string) {
    await navigator.clipboard.writeText(value);
    setCopied(kind);
    setTimeout(() => setCopied(null), 1500);
  }

  const activeKeys = keys.filter((k) => !k.revokedAt);
  const revokedKeys = keys.filter((k) => k.revokedAt);

  return (
    <div className="rounded-2xl border border-border bg-surface-card p-4 card-glow sm:p-5">
      <p className="text-xs font-medium uppercase tracking-widest text-cyan">
        Chaves MCP (devs)
      </p>
      <h2 className="mt-1 text-sm font-semibold text-white">
        Uma chave por pessoa
      </h2>
      <p className="mt-1.5 text-xs text-slate-500">
        Gere uma <code className="text-slate-400">syn_mcp_…</code> por
        desenvolvedor, copie o JSON e envie com segurança. Não compartilhe a{" "}
        <code className="text-slate-400">syn_tk_</code> do tenant. Vazou? Revogue
        só essa chave.
      </p>

      <div className="mt-4 flex flex-col gap-2 sm:flex-row">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Nome do dev (ex.: Ana - Cursor)"
          className="min-w-0 flex-1 rounded-lg border border-border bg-surface px-3 py-2 text-xs text-white placeholder:text-slate-600"
          disabled={busy}
          onKeyDown={(e) => {
            if (e.key === "Enter") void createKey();
          }}
        />
        <button
          type="button"
          disabled={busy}
          onClick={() => void createKey()}
          className="shrink-0 rounded-lg cyan-gradient px-4 py-2 text-xs font-semibold text-surface disabled:opacity-50"
        >
          {busy ? "Gerando…" : "Gerar chave"}
        </button>
      </div>

      {error && (
        <p className="mt-3 rounded-lg border border-red-500/20 bg-red-500/5 px-3 py-2 text-xs text-red-400">
          {error}
        </p>
      )}

      {created && (
        <div className="mt-4 rounded-xl border border-amber-500/30 bg-amber-500/5 p-3">
          <p className="text-xs font-medium text-amber-200">
            {created.warning ?? "Copie agora — não será mostrado de novo."}
          </p>
          <p className="mt-2 text-[11px] text-slate-500">
            Destinatário: <span className="text-slate-300">{created.name}</span>
          </p>
          <div className="mt-2 flex items-center justify-between gap-2">
            <code className="min-w-0 flex-1 break-all font-mono text-[11px] text-cyan">
              {created.token}
            </code>
            <button
              type="button"
              onClick={() => void copy("token", created.token)}
              className="shrink-0 text-xs text-cyan hover:underline"
            >
              {copied === "token" ? "Copiado" : "Copiar chave"}
            </button>
          </div>
          <div className="mt-3 flex items-center justify-between gap-2">
            <p className="text-[11px] uppercase tracking-widest text-slate-500">
              Cursor mcp.json
            </p>
            <button
              type="button"
              onClick={() =>
                void copy("config", JSON.stringify(created.cursorConfig, null, 2))
              }
              className="text-xs text-cyan hover:underline"
            >
              {copied === "config" ? "Copiado" : "Copiar config"}
            </button>
          </div>
          <pre className="mt-1 max-h-40 overflow-auto rounded-lg border border-border bg-surface p-2 font-mono text-[10px] text-slate-300 whitespace-pre-wrap break-all">
            {JSON.stringify(created.cursorConfig, null, 2)}
          </pre>
        </div>
      )}

      {activeKeys.length > 0 && (
        <ul className="mt-4 divide-y divide-border/60 rounded-xl border border-border">
          {activeKeys.map((k) => (
            <li
              key={k.id}
              className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5"
            >
              <div className="min-w-0">
                <p className="truncate text-xs font-medium text-slate-200">
                  {k.name}
                </p>
                <p className="mt-0.5 font-mono text-[10px] text-slate-500">
                  {k.tokenPrefix}… · criada{" "}
                  {new Date(k.createdAt).toLocaleString()}
                  {k.lastUsedAt
                    ? ` · último uso ${new Date(k.lastUsedAt).toLocaleString()}`
                    : " · nunca usada"}
                </p>
              </div>
              <button
                type="button"
                disabled={busy}
                onClick={() => void revoke(k.id, k.name)}
                className="shrink-0 rounded-md px-2 py-1 text-[10px] font-medium text-slate-500 hover:bg-red-500/10 hover:text-red-300"
              >
                Revogar
              </button>
            </li>
          ))}
        </ul>
      )}

      {revokedKeys.length > 0 && (
        <details className="mt-3">
          <summary className="cursor-pointer text-[11px] text-slate-500 hover:text-slate-300">
            Revogadas ({revokedKeys.length})
          </summary>
          <ul className="mt-2 space-y-1 text-[11px] text-slate-600">
            {revokedKeys.map((k) => (
              <li key={k.id}>
                {k.name} · {k.tokenPrefix}…
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
