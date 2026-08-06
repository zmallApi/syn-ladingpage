const today = [
  "ERP",
  "CRM",
  "Sistema financeiro",
  "GitHub",
  "ClickUp",
  "Confluence",
];

const soon = [
  "Jira",
  "SAP",
  "Salesforce",
  "SharePoint",
  "Slack",
  "SQL Server",
  "Oracle",
];

export function Sources() {
  return (
    <section id="fontes" className="border-t border-border/60 py-16 sm:py-24">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="mb-12 text-center">
          <p className="text-xs font-medium uppercase tracking-widest text-cyan">
            Fontes
          </p>
          <h2 className="mt-2 text-3xl font-bold text-white sm:text-4xl">
            O conhecimento cresce com a sua empresa
          </h2>
          <p className="mx-auto mt-3 max-w-2xl text-sm text-slate-400">
            O Synapsee cresce com novos domínios. Cada fonte alimenta o mesmo sistema
            que prepara contexto — hoje e amanhã.
          </p>
        </div>

        <div className="grid gap-8 md:grid-cols-2">
          <div className="rounded-2xl border border-border bg-surface-card p-6 card-glow">
            <p className="text-xs font-medium uppercase tracking-widest text-green">
              Hoje
            </p>
            <ul className="mt-4 grid gap-2 sm:grid-cols-2">
              {today.map((s) => (
                <li key={s} className="flex items-center gap-2 text-sm text-slate-200">
                  <span className="text-green">✓</span>
                  {s}
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded-2xl border border-border bg-surface-card p-6 card-glow">
            <p className="text-xs font-medium uppercase tracking-widest text-slate-500">
              Em seguida
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
