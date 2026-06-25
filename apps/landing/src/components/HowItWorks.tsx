const tables = [
  { name: "users", rows: "1.2M linhas", status: "done" },
  { name: "organizations", rows: "48K linhas", status: "done" },
  { name: "subscriptions", rows: "312K linhas", status: "done" },
  { name: "invoices", rows: "890K linhas", status: "active" },
  { name: "events", rows: "4.1M linhas", status: "pending" },
  { name: "audit_log", rows: "12M linhas", status: "pending" },
];

const pipeline = [
  { step: "Introspecção", detail: "156 tabelas", done: true },
  { step: "Inferir Relações", detail: "17 FKs", done: true },
  { step: "Classificar PII", detail: "23 cols", done: true },
  { step: "Gerar OpenAPI", detail: "412 ops", done: false, active: true },
  { step: "Emitir MCP", detail: "68 tools", done: false },
  { step: "Publicar Docs", detail: "1 site", done: false },
];

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    done: "border-green/30 bg-green/10 text-green",
    active: "border-cyan/30 bg-cyan/10 text-cyan",
    pending: "border-border bg-surface text-slate-500",
  };
  const labels: Record<string, string> = {
    done: "OK",
    active: "Analisando",
    pending: "Pendente",
  };
  return (
    <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide border ${styles[status]}`}>
      {labels[status]}
    </span>
  );
}

export function HowItWorks() {
  return (
    <section id="como-funciona" className="py-16 sm:py-24">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="mb-12 text-center">
          <p className="text-xs font-medium uppercase tracking-widest text-cyan">Como funciona</p>
          <h2 className="mt-2 text-3xl font-bold text-white sm:text-4xl">Do banco ao agente em minutos</h2>
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          {/* Step 01 */}
          <div className="rounded-2xl border border-border bg-surface-card p-5 card-glow transition">
            <div className="mb-4 flex items-center justify-between">
              <span className="font-mono text-xs text-slate-500">01</span>
              <StatusBadge status="done" />
            </div>
            <h3 className="text-base font-semibold text-white">Conexão</h3>
            <p className="mt-1 text-xs text-slate-500">Host, porta, banco e usuário</p>
            <div className="mt-4 space-y-2 rounded-xl border border-border bg-surface p-3 font-mono text-xs">
              <div className="flex justify-between text-slate-500">
                <span>Host</span>
                <span className="text-slate-300">db.cluster-prod...</span>
              </div>
              <div className="flex justify-between text-slate-500">
                <span>Database</span>
                <span className="text-slate-300">atlas_core</span>
              </div>
              <div className="flex justify-between text-slate-500">
                <span>Port</span>
                <span className="text-slate-300">5432</span>
              </div>
              <div className="mt-2 flex items-center justify-between border-t border-border pt-2">
                <span className="text-slate-500">Somente Leitura</span>
                <div className="h-4 w-8 rounded-full bg-cyan/20 p-0.5">
                  <div className="h-3 w-3 rounded-full bg-cyan" />
                </div>
              </div>
            </div>
          </div>

          {/* Step 02 */}
          <div className="rounded-2xl border border-border bg-surface-card p-5 card-glow transition">
            <div className="mb-4 flex items-center justify-between">
              <span className="font-mono text-xs text-slate-500">02</span>
              <StatusBadge status="active" />
            </div>
            <h3 className="text-base font-semibold text-white">Análise de schema por IA</h3>
            <p className="mt-1 text-xs text-slate-500">Detecta entidades e relações de negócio</p>
            <div className="mt-4 space-y-1.5">
              {tables.map((t) => (
                <div key={t.name} className="flex items-center justify-between rounded-lg px-2 py-1.5 text-xs hover:bg-surface-raised">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-slate-300">{t.name}</span>
                    <span className="text-slate-600">{t.rows}</span>
                  </div>
                  <StatusBadge status={t.status} />
                </div>
              ))}
            </div>
            <div className="mt-3 h-1 overflow-hidden rounded-full bg-surface">
              <div className="h-full w-3/5 rounded-full bg-gradient-to-r from-cyan to-purple" />
            </div>
          </div>

          {/* Step 03 */}
          <div className="rounded-2xl border border-border bg-surface-card p-5 card-glow transition">
            <div className="mb-4 flex items-center justify-between">
              <span className="font-mono text-xs text-slate-500">03</span>
              <span className="rounded border border-purple/30 bg-purple/10 px-1.5 py-0.5 text-[10px] font-medium uppercase text-purple">
                Gerando
              </span>
            </div>
            <h3 className="text-base font-semibold text-white">Pipeline de geração</h3>
            <p className="mt-1 text-xs text-slate-500">API, MCP, SDK e docs automaticamente</p>
            <div className="mt-4 space-y-2">
              {pipeline.map((p) => (
                <div key={p.step} className="flex items-center gap-3 text-xs">
                  <div
                    className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${
                      p.done
                        ? "border-green/40 bg-green/10 text-green"
                        : p.active
                          ? "border-cyan/40 bg-cyan/10 text-cyan"
                          : "border-border text-slate-600"
                    }`}
                  >
                    {p.done ? "✓" : p.active ? "●" : "○"}
                  </div>
                  <span className={p.done || p.active ? "text-slate-300" : "text-slate-600"}>{p.step}</span>
                  <span className="ml-auto font-mono text-slate-500">{p.detail}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
