const endpoints = [
  { method: "GET", path: "/v1/users", color: "text-cyan" },
  { method: "GET", path: "/v1/users/:id", color: "text-cyan" },
  { method: "POST", path: "/v1/invoices", color: "text-green" },
  { method: "PATCH", path: "/v1/subscriptions/:id", color: "text-purple" },
];

const mcpTools = [
  "query_users",
  "search_organizations",
  "get_subscription_status",
  "summarize_events",
  "find_overdue_invoices",
];

export function Deliverables() {
  return (
    <section id="entregaveis" className="border-t border-border/60 py-16 sm:py-24">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="mb-12 text-center">
          <p className="text-xs font-medium uppercase tracking-widest text-cyan">Entregáveis</p>
          <h2 className="mt-2 text-3xl font-bold text-white sm:text-4xl">Tudo gerado automaticamente</h2>
        </div>

        <div className="grid gap-6 md:grid-cols-3">
          {/* REST API */}
          <div className="rounded-2xl border border-border bg-surface-card p-5 card-glow">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="font-semibold text-white">API REST</h3>
              <span className="rounded border border-green/30 bg-green/10 px-2 py-0.5 text-[10px] font-medium uppercase text-green">
                Pronto
              </span>
            </div>
            <div className="space-y-1.5 font-mono text-xs">
              {endpoints.map((ep) => (
                <div key={ep.path} className="flex items-center gap-2 rounded-lg bg-surface px-2 py-1.5">
                  <span className={`w-10 font-semibold ${ep.color}`}>{ep.method}</span>
                  <span className="text-slate-400">{ep.path}</span>
                </div>
              ))}
            </div>
            <p className="mt-3 text-xs text-slate-500">+ OpenAPI em /openapi.json</p>
          </div>

          {/* MCP */}
          <div className="rounded-2xl border border-border bg-surface-card p-5 card-glow">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="font-semibold text-white">Servidor MCP</h3>
              <span className="rounded border border-cyan/30 bg-cyan/10 px-2 py-0.5 text-[10px] font-medium uppercase text-cyan">
                Ao vivo
              </span>
            </div>
            <div className="rounded-lg border border-border bg-surface p-2 font-mono text-[11px] text-slate-400">
              mcp://synapsee.tec.br/proj_abc123
            </div>
            <p className="mt-3 mb-2 text-xs text-slate-500">Ferramentas expostas</p>
            <div className="flex flex-wrap gap-1.5">
              {mcpTools.map((tool) => (
                <span
                  key={tool}
                  className="rounded border border-border bg-surface px-2 py-0.5 font-mono text-[10px] text-slate-400"
                >
                  {tool}
                </span>
              ))}
            </div>
            <p className="mt-3 text-xs text-slate-600">claude · cursor · windsurf</p>
          </div>

          {/* Docs */}
          <div className="rounded-2xl border border-border bg-surface-card p-5 card-glow">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="font-semibold text-white">Documentação</h3>
              <span className="rounded border border-purple/30 bg-purple/10 px-2 py-0.5 text-[10px] font-medium uppercase text-purple">
                Publicado
              </span>
            </div>
            <div className="rounded-lg border border-border bg-surface p-3">
              <p className="text-xs font-medium text-white">Quick Start</p>
              <pre className="mt-2 overflow-x-auto font-mono text-[10px] leading-relaxed text-slate-400">
{`curl -H "Authorization: Bearer sk_..."
  https://api.synapsee.tec.br/v1/users`}
              </pre>
            </div>
            <p className="mt-3 text-xs text-slate-500">Docs interativos com exemplos por endpoint</p>
          </div>
        </div>
      </div>
    </section>
  );
}
