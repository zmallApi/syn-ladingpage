/** Client-specific MCP config snippets for the same Streamable HTTP endpoint. */

export type McpClientId =
  | "cursor"
  | "claude"
  | "vscode"
  | "windsurf"
  | "chatgpt"
  | "generic";

export interface McpClientSnippet {
  id: McpClientId;
  label: string;
  /** Where to paste the JSON (human hint). */
  configPath: string;
  /** Extra setup notes shown in admin. */
  notes: string[];
  /** JSON object ready to stringify / merge into the client's config file. */
  config: Record<string, unknown>;
}

export interface BuildMcpClientSnippetsInput {
  serverId: string;
  url: string;
  /** Literal key or placeholder shown in copied snippets. */
  apiKey: string;
}

function httpEntry(url: string, apiKey: string) {
  return {
    url,
    headers: {
      "X-API-Key": apiKey,
    },
  };
}

/**
 * Builds paste-ready configs for the main MCP clients.
 * Transport is always Streamable HTTP on `url` — only the JSON shape / file path differ.
 */
export function buildMcpClientSnippets(
  input: BuildMcpClientSnippetsInput,
): McpClientSnippet[] {
  const { serverId, url, apiKey } = input;
  const entry = httpEntry(url, apiKey);

  return [
    {
      id: "cursor",
      label: "Cursor",
      configPath: "~/.cursor/mcp.json  ou  .cursor/mcp.json (projeto)",
      notes: [
        "Settings → MCP → Add new global MCP server, ou edite o mcp.json.",
        "Depois de ativar novas capabilities no Synapsee, reconecte o servidor MCP.",
      ],
      config: { mcpServers: { [serverId]: entry } },
    },
    {
      id: "claude",
      label: "Claude",
      configPath: "Claude Code: ~/.claude.json / .mcp.json · Claude.ai: Settings → Connectors",
      notes: [
        "Claude Code e conectores Claude.ai usam MCP remoto (Streamable HTTP).",
        "Claude Desktop antigo (só stdio): use o bridge npx mcp-remote com a mesma URL.",
      ],
      config: { mcpServers: { [serverId]: entry } },
    },
    {
      id: "vscode",
      label: "VS Code",
      configPath: ".vscode/mcp.json  ou  MCP: Open User Configuration",
      notes: [
        "VS Code usa a chave raiz \"servers\" (não mcpServers) e type: \"http\".",
        "Abra o Chat do Copilot em modo Agent para usar as tools.",
      ],
      config: {
        servers: {
          [serverId]: {
            type: "http",
            url,
            headers: {
              "X-API-Key": apiKey,
            },
          },
        },
      },
    },
    {
      id: "windsurf",
      label: "Windsurf",
      configPath: "~/.codeium/windsurf/mcp_config.json",
      notes: ["Cascade → MCP → adicione o servidor ou edite o mcp_config.json."],
      config: { mcpServers: { [serverId]: entry } },
    },
    {
      id: "chatgpt",
      label: "ChatGPT",
      configPath: "ChatGPT → Settings → Connectors / Custom MCP (se disponível na conta)",
      notes: [
        "Use a URL Streamable HTTP + header X-API-Key.",
        "Disponibilidade depende do plano/produto OpenAI; o endpoint Synapsee é o mesmo.",
      ],
      config: {
        name: serverId,
        transport: "streamable-http",
        url,
        headers: {
          "X-API-Key": apiKey,
        },
      },
    },
    {
      id: "generic",
      label: "Genérico",
      configPath: "Qualquer cliente MCP com transporte HTTP remoto",
      notes: [
        "Endpoint único Streamable HTTP; autenticação via header X-API-Key.",
        "Liste tools com o manifesto GET .../mcp.json.",
      ],
      config: {
        transport: "streamable-http",
        url,
        headers: {
          "X-API-Key": apiKey,
        },
      },
    },
  ];
}

/** Optional stdio bridge for Claude Desktop builds that still require a local process. */
export function buildMcpRemoteStdioSnippet(input: BuildMcpClientSnippetsInput) {
  const { serverId, url, apiKey } = input;
  return {
    mcpServers: {
      [serverId]: {
        command: "npx",
        args: [
          "-y",
          "mcp-remote",
          url,
          "--header",
          `X-API-Key: ${apiKey}`,
        ],
      },
    },
  };
}
