const today = [
  { label: "ERP", note: null },
  { label: "CRM", note: null },
  { label: "Billing", note: null },
];

const soon = ["Jira", "Confluence", "GitHub", "SAP", "Salesforce", "SQL Server", "Oracle"];

export function Sources() {
  return (
    <section id="fontes" className="border-t border-border/60 py-16 sm:py-24">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="mb-12 text-center">
          <p className="text-xs font-medium uppercase tracking-widest text-cyan">
            Fontes de conhecimento
          </p>
          <h2 className="mt-2 text-3xl font-bold text-white sm:text-4xl">
            O banco é só um meio. O objetivo é o conhecimento do sistema.
          </h2>
          <p className="mx-auto mt-3 max-w-2xl text-sm text-slate-400">
            Hoje conectamos sistemas empresariais (via PostgreSQL e MySQL). Amanhã, outras
            fontes — a mesma camada de entendimento.
          </p>
        </div>

        <div className="grid gap-8 md:grid-cols-2">
          <div className="rounded-2xl border border-border bg-surface-card p-6 card-glow">
            <p className="text-xs font-medium uppercase tracking-widest text-green">Hoje</p>
            <ul className="mt-4 space-y-2">
              {today.map((s) => (
                <li key={s.label} className="flex items-center gap-2 text-sm text-slate-200">
                  <span className="text-green">✓</span>
                  {s.label}
                </li>
              ))}
            </ul>
            <p className="mt-4 text-xs text-slate-500">
              Via PostgreSQL e MySQL — o banco é o meio, não o produto.
            </p>
          </div>
          <div className="rounded-2xl border border-border bg-surface-card p-6 card-glow">
            <p className="text-xs font-medium uppercase tracking-widest text-slate-500">
              Em breve
            </p>
            <ul className="mt-4 grid gap-2 sm:grid-cols-2">
              {soon.map((s) => (
                <li key={s} className="flex items-center gap-2 text-sm text-slate-400">
                  <span className="text-slate-600">○</span>
                  {s}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}
