import { useState } from "react";
import type { McpClientSnippet } from "../lib/types";

const FALLBACK_TABS: Array<{ id: string; label: string }> = [
  { id: "cursor", label: "Cursor" },
  { id: "claude", label: "Claude" },
  { id: "vscode", label: "VS Code" },
  { id: "windsurf", label: "Windsurf" },
  { id: "chatgpt", label: "ChatGPT" },
  { id: "generic", label: "Genérico" },
];

interface Props {
  url: string;
  apiKey: string;
  serverId: string;
  clients?: McpClientSnippet[] | null;
  claudeDesktopStdio?: unknown;
  tools?: string[];
}

export function McpConnectPanel({
  url,
  apiKey,
  serverId,
  clients,
  claudeDesktopStdio,
  tools,
}: Props) {
  const snippets = clients?.length
    ? clients.map((c) => ({
        ...c,
        config: injectApiKey(c.config, apiKey),
      }))
    : buildLocalSnippets(serverId, url, apiKey);

  const [tab, setTab] = useState(snippets[0]?.id ?? "cursor");
  const [copied, setCopied] = useState<"url" | "config" | "stdio" | null>(null);
  const [showStdio, setShowStdio] = useState(false);

  const active = snippets.find((s) => s.id === tab) ?? snippets[0];
  const configText = active ? JSON.stringify(active.config, null, 2) : "";
  const stdioText = claudeDesktopStdio
    ? JSON.stringify(injectApiKey(claudeDesktopStdio, apiKey), null, 2)
    : "";

  async function copy(kind: "url" | "config" | "stdio", value: string) {
    await navigator.clipboard.writeText(value);
    setCopied(kind);
    setTimeout(() => setCopied(null), 1500);
  }

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-xs font-medium uppercase tracking-widest text-cyan">MCP</p>
          <h2 className="mt-1 text-sm font-semibold text-white">
            Conectar agentes (Streamable HTTP)
          </h2>
        </div>
      </div>

      <p className="mb-3 text-xs text-slate-500">
        Um endpoint para Cursor, Claude, VS Code, Windsurf e ChatGPT — só muda o formato do
        JSON. Tools: {tools?.length ? tools.join(", ") : "carregando…"}.
      </p>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <code className="min-w-0 flex-1 break-all rounded-lg border border-border bg-surface px-3 py-2 font-mono text-xs text-cyan">
          {url}
        </code>
        <button
          type="button"
          onClick={() => copy("url", url)}
          className="shrink-0 rounded-lg border border-border px-3 py-2 text-xs text-slate-300 hover:text-white"
        >
          {copied === "url" ? "Copiado" : "Copiar URL"}
        </button>
      </div>

      <div className="mt-4 flex flex-wrap gap-1 border-b border-border pb-2">
        {(snippets.length ? snippets : FALLBACK_TABS).map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setTab(item.id)}
            className={`rounded-lg px-2.5 py-1.5 text-xs transition ${
              tab === item.id
                ? "bg-cyan/10 text-cyan"
                : "text-slate-500 hover:bg-surface hover:text-slate-300"
            }`}
          >
            {"label" in item ? item.label : item.id}
          </button>
        ))}
      </div>

      {active && (
        <div className="mt-3">
          <p className="text-[11px] text-slate-500">
            Arquivo: <span className="text-slate-400">{active.configPath}</span>
          </p>
          {active.notes?.length > 0 && (
            <ul className="mt-2 list-inside list-disc space-y-0.5 text-[11px] text-slate-500">
              {active.notes.map((n) => (
                <li key={n}>{n}</li>
              ))}
            </ul>
          )}

          <div className="mb-2 mt-3 flex items-center justify-between gap-2">
            <p className="text-[11px] uppercase tracking-widest text-slate-500">Config</p>
            <button
              type="button"
              onClick={() => copy("config", configText)}
              className="text-xs text-cyan hover:underline"
            >
              {copied === "config" ? "Copiado" : "Copiar config"}
            </button>
          </div>
          <pre className="max-h-52 overflow-auto rounded-xl border border-border bg-surface p-3 font-mono text-[11px] leading-relaxed break-words whitespace-pre-wrap text-slate-300">
            {configText}
          </pre>

          {active.id === "claude" && stdioText && (
            <div className="mt-3">
              <button
                type="button"
                onClick={() => setShowStdio((v) => !v)}
                className="text-[11px] text-slate-500 hover:text-cyan"
              >
                {showStdio ? "▾" : "▸"} Bridge stdio (Claude Desktop antigo via mcp-remote)
              </button>
              {showStdio && (
                <div className="mt-2">
                  <div className="mb-2 flex justify-end">
                    <button
                      type="button"
                      onClick={() => copy("stdio", stdioText)}
                      className="text-xs text-cyan hover:underline"
                    >
                      {copied === "stdio" ? "Copiado" : "Copiar stdio"}
                    </button>
                  </div>
                  <pre className="max-h-40 overflow-auto rounded-xl border border-border bg-surface p-3 font-mono text-[11px] leading-relaxed break-words whitespace-pre-wrap text-slate-300">
                    {stdioText}
                  </pre>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function injectApiKey(config: unknown, apiKey: string): Record<string, unknown> {
  const raw = JSON.stringify(config ?? {});
  const withKey = raw.replaceAll("<PLATFORM_API_KEY>", apiKey);
  try {
    return JSON.parse(withKey) as Record<string, unknown>;
  } catch {
    return (config as Record<string, unknown>) ?? {};
  }
}

function buildLocalSnippets(
  serverId: string,
  url: string,
  apiKey: string,
): McpClientSnippet[] {
  const headers = { "X-API-Key": apiKey };
  return [
    {
      id: "cursor",
      label: "Cursor",
      configPath: "~/.cursor/mcp.json",
      notes: [],
      config: { mcpServers: { [serverId]: { url, headers } } },
    },
    {
      id: "claude",
      label: "Claude",
      configPath: "~/.claude.json / Claude.ai Connectors",
      notes: [],
      config: { mcpServers: { [serverId]: { url, headers } } },
    },
    {
      id: "vscode",
      label: "VS Code",
      configPath: ".vscode/mcp.json",
      notes: [],
      config: {
        servers: { [serverId]: { type: "http", url, headers } },
      },
    },
    {
      id: "windsurf",
      label: "Windsurf",
      configPath: "~/.codeium/windsurf/mcp_config.json",
      notes: [],
      config: { mcpServers: { [serverId]: { url, headers } } },
    },
    {
      id: "chatgpt",
      label: "ChatGPT",
      configPath: "Connectors / Custom MCP",
      notes: [],
      config: { name: serverId, transport: "streamable-http", url, headers },
    },
    {
      id: "generic",
      label: "Genérico",
      configPath: "Cliente MCP HTTP remoto",
      notes: [],
      config: { transport: "streamable-http", url, headers },
    },
  ];
}
