import { useState } from "react";

export function EdgeInstallPanel({
  dockerRun,
  dockerCompose,
  edgeStatus,
  edgeLastSeen,
  edgeVersion,
  edgeResourceCount,
  edgeLastError,
  online,
  tokenPlaintext,
  onGenerateToken,
  generating,
  /** business = DB; engineering = GitHub/ClickUp projections */
  variant = "business",
}: {
  dockerRun: string;
  dockerCompose: string;
  edgeStatus?: string;
  edgeLastSeen?: string | null;
  edgeVersion?: string | null;
  edgeResourceCount?: number | null;
  edgeLastError?: string | null;
  online?: boolean;
  tokenPlaintext?: string | null;
  onGenerateToken?: () => void;
  generating?: boolean;
  variant?: "business" | "engineering";
}) {
  const [tab, setTab] = useState<"docker" | "compose">("docker");
  const [copied, setCopied] = useState<"cmd" | "token" | null>(null);
  const [showInstall, setShowInstall] = useState(!online);
  const isEng = variant === "engineering";

  async function copy(kind: "cmd" | "token", value: string) {
    await navigator.clipboard.writeText(value);
    setCopied(kind);
    setTimeout(() => setCopied(null), 1500);
  }

  const snippet = tab === "docker" ? dockerRun : dockerCompose;
  // Prefer edgeStatus from API — never treat WS-only as "online" for Business.
  const statusLabel =
    edgeStatus === "online"
      ? "online"
      : edgeStatus === "offline"
        ? "offline"
        : edgeStatus === "error"
          ? "error"
          : online
            ? "online"
            : "pending";

  const statusBadgeText =
    statusLabel === "online"
      ? isEng
        ? "Fontes via Edge"
        : "Empresa conectada"
      : statusLabel === "offline"
        ? "Edge offline"
        : statusLabel === "error"
          ? isEng
            ? "Projections indisponíveis"
            : "Banco indisponível"
          : "Aguardando Edge";

  const statusDetail =
    statusLabel === "online"
      ? isEng
        ? "Edge ativo. Tokens GitHub e ClickUp ficam só no Edge — o Cloud não os armazena."
        : "Edge ativo e banco respondendo. Credenciais ficam só no Edge."
      : statusLabel === "error"
        ? isEng
          ? "O Edge está no Cloud, mas as projections falharam. Verifique SYNAPSEE_GITHUB_TOKEN e SYNAPSEE_CLICKUP_TOKEN no ambiente do Edge."
          : edgeLastError
            ? `Edge no Cloud, mas o banco falhou: ${edgeLastError}`
            : "O agente Edge está conectado ao Cloud, mas o banco não responde. Verifique se o banco está no ar (mesmo network do Edge) e as variáveis SYNAPSEE_DB_*."
        : statusLabel === "offline"
          ? "Edge desconectado. Reinicie o agente na rede do cliente."
          : isEng
            ? "Tokens das fontes (GitHub, ClickUp) ficam só no Edge. Rode o comando abaixo no ambiente do cliente."
            : "Credenciais do banco ficam só no Edge. Rode o comando abaixo no ambiente do cliente.";

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-border bg-surface p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs font-medium uppercase tracking-widest text-slate-500">
            {isEng ? "Edge · Knowledge Sources" : "Status Edge"}
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
            {statusBadgeText}
          </span>
        </div>
        <p className="mt-2 text-xs text-slate-500">
          {edgeVersion ? `versão ${edgeVersion}` : "sem versão"}
          {!isEng && edgeResourceCount != null
            ? ` · ${edgeResourceCount} tabelas`
            : ""}
          {edgeLastSeen
            ? ` · visto ${new Date(edgeLastSeen).toLocaleString()}`
            : ""}
        </p>
        <p className="mt-2 text-xs text-slate-400">{statusDetail}</p>
        {isEng && statusLabel === "online" && (
          <p className="mt-2 text-[11px] text-slate-500">
            O Edge guarda os tokens GitHub/ClickUp e sincroniza fatos para a
            Knowledge Layer.
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

          {isEng && (
            <p className="text-[11px] text-slate-500">
              No Edge, configure{" "}
              <code className="text-slate-400">SYNAPSEE_GITHUB_TOKEN</code> e{" "}
              <code className="text-slate-400">SYNAPSEE_CLICKUP_TOKEN</code> (e
              opcionalmente repos/spaces). Sem{" "}
              <code className="text-slate-400">SYNAPSEE_DB_*</code>.
            </p>
          )}

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
