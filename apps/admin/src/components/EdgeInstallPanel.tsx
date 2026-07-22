import { useState } from "react";

export function EdgeInstallPanel({
  dockerRun,
  dockerCompose,
  edgeStatus,
  edgeLastSeen,
  edgeVersion,
  edgeResourceCount,
  online,
  tokenPlaintext,
  onGenerateToken,
  generating,
}: {
  dockerRun: string;
  dockerCompose: string;
  edgeStatus?: string;
  edgeLastSeen?: string | null;
  edgeVersion?: string | null;
  edgeResourceCount?: number | null;
  online?: boolean;
  tokenPlaintext?: string | null;
  onGenerateToken?: () => void;
  generating?: boolean;
}) {
  const [tab, setTab] = useState<"docker" | "compose">("docker");
  const [copied, setCopied] = useState<"cmd" | "token" | null>(null);
  const [showInstall, setShowInstall] = useState(!online);

  async function copy(kind: "cmd" | "token", value: string) {
    await navigator.clipboard.writeText(value);
    setCopied(kind);
    setTimeout(() => setCopied(null), 1500);
  }

  const snippet = tab === "docker" ? dockerRun : dockerCompose;
  const statusLabel = online
    ? "online"
    : edgeStatus === "offline"
      ? "offline"
      : edgeStatus === "error"
        ? "error"
        : "pending";

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-border bg-surface p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs font-medium uppercase tracking-widest text-slate-500">
            Status Edge
          </p>
          <span
            className={`rounded border px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide ${
              statusLabel === "online"
                ? "border-green/30 bg-green/10 text-green"
                : statusLabel === "offline"
                  ? "border-amber-500/30 bg-amber-500/10 text-amber-400"
                  : statusLabel === "error"
                    ? "border-red-500/30 bg-red-500/10 text-red-400"
                    : "border-border bg-surface-card text-slate-500"
            }`}
          >
            {statusLabel === "online"
              ? "Empresa conectada"
              : statusLabel === "offline"
                ? "Edge offline"
                : statusLabel === "error"
                  ? "Banco indisponível"
                  : "Aguardando Edge"}
          </span>
        </div>
        <p className="mt-2 text-xs text-slate-500">
          {edgeVersion ? `versão ${edgeVersion}` : "sem versão"}
          {edgeResourceCount != null ? ` · ${edgeResourceCount} tabelas` : ""}
          {edgeLastSeen
            ? ` · visto ${new Date(edgeLastSeen).toLocaleString()}`
            : ""}
        </p>
        {statusLabel === "online" ? (
          <p className="mt-2 text-xs text-slate-400">
            Edge ativo e banco respondendo. Credenciais ficam só no Edge.
          </p>
        ) : statusLabel === "error" ? (
          <p className="mt-2 text-xs text-amber-200/80">
            O agente Edge está conectado ao Cloud, mas o banco não responde. Verifique se
            o banco está no ar e as variáveis SYNAPSEE_DB_*.
          </p>
        ) : statusLabel === "offline" ? (
          <p className="mt-2 text-xs text-slate-400">
            Edge desconectado. Reinicie o agente na rede do cliente.
          </p>
        ) : (
          <p className="mt-2 text-xs text-slate-400">
            Credenciais do banco ficam só no Edge. Rode o comando abaixo na rede do
            cliente — o Cloud nunca abre porta de entrada.
          </p>
        )}
      </div>

      {tokenPlaintext && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4">
          <p className="text-xs font-medium uppercase tracking-widest text-amber-400">
            Project Token (uma vez)
          </p>
          <code className="mt-2 block break-all font-mono text-xs text-amber-100">
            {tokenPlaintext}
          </code>
          <button
            type="button"
            onClick={() => copy("token", tokenPlaintext)}
            className="mt-2 text-xs text-amber-300 hover:underline"
          >
            {copied === "token" ? "Copiado" : "Copiar token"}
          </button>
          <p className="mt-2 text-[11px] text-amber-200/70">
            Guarde agora — não será mostrado novamente. Revogue e gere outro se
            perder.
          </p>
        </div>
      )}

      {online && !showInstall && (
        <button
          type="button"
          onClick={() => setShowInstall(true)}
          className="text-xs text-slate-500 hover:text-cyan"
        >
          Mostrar comando de reinstalação / token →
        </button>
      )}

      {showInstall && (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setTab("docker")}
              className={`rounded-lg border px-3 py-1.5 text-xs ${
                tab === "docker"
                  ? "border-cyan/40 text-cyan"
                  : "border-border text-slate-400 hover:text-slate-200"
              }`}
            >
              docker run
            </button>
            <button
              type="button"
              onClick={() => setTab("compose")}
              className={`rounded-lg border px-3 py-1.5 text-xs ${
                tab === "compose"
                  ? "border-cyan/40 text-cyan"
                  : "border-border text-slate-400 hover:text-slate-200"
              }`}
            >
              docker-compose.yml
            </button>
            {onGenerateToken && (
              <button
                type="button"
                disabled={generating}
                onClick={onGenerateToken}
                className="ml-auto rounded-lg border border-border px-3 py-1.5 text-xs text-slate-300 hover:border-cyan/40 hover:text-cyan disabled:opacity-50"
              >
                {generating ? "Gerando…" : "Gerar novo token"}
              </button>
            )}
            {online && (
              <button
                type="button"
                onClick={() => setShowInstall(false)}
                className="rounded-lg border border-border px-3 py-1.5 text-xs text-slate-500 hover:text-slate-300"
              >
                Ocultar
              </button>
            )}
          </div>

          <div className="relative">
            <pre className="overflow-x-auto rounded-xl border border-border bg-surface p-3 font-mono text-[11px] leading-relaxed text-slate-300">
              {snippet || "# Gere um token para preencher SYNAPSEE_TOKEN"}
            </pre>
            {snippet && (
              <button
                type="button"
                onClick={() => copy("cmd", snippet)}
                className="absolute right-2 top-2 rounded border border-border bg-surface-card px-2 py-1 text-[10px] text-slate-400 hover:text-white"
              >
                {copied === "cmd" ? "Copiado" : "Copiar"}
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
