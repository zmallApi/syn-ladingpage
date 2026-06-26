function IconLayers() {
  return (
    <svg className="h-6 w-6 text-cyan" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 3L3 8l9 5 9-5-9-5z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 12l9 5 9-5M3 16l9 5 9-5" />
    </svg>
  );
}

function IconBuilding() {
  return (
    <svg className="h-6 w-6 text-cyan" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 21h18M5 21V7l7-4 7 4v14M9 21v-6h6v6M9 9h.01M15 9h.01M9 13h.01M15 13h.01" />
    </svg>
  );
}

function IconCode() {
  return (
    <svg className="h-6 w-6 text-cyan" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
    </svg>
  );
}

const audiences = [
  {
    icon: IconLayers,
    title: "Software Houses",
    description: "Transforme o ERP dos clientes em ferramentas para IA.",
  },
  {
    icon: IconBuilding,
    title: "Empresas",
    description: "Conecte seus sistemas internos aos agentes.",
  },
  {
    icon: IconCode,
    title: "Desenvolvedores IA",
    description: "Pare de escrever integrações manualmente.",
  },
];

export function WhoNeedsIt() {
  return (
    <section id="quem-precisa" className="border-t border-border/60 py-16 sm:py-24">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="mb-12 text-center">
          <p className="text-xs font-medium uppercase tracking-widest text-cyan">Público</p>
          <h2 className="mt-2 text-3xl font-bold text-white sm:text-4xl">Quem precisa disso?</h2>
        </div>

        <div className="grid gap-6 md:grid-cols-3">
          {audiences.map((item) => {
            const Icon = item.icon;
            return (
              <div
                key={item.title}
                className="rounded-2xl border border-border bg-surface-card p-6 card-glow transition"
              >
                <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-cyan/20 bg-cyan/5">
                  <Icon />
                </div>
                <h3 className="mt-4 text-lg font-semibold text-white">{item.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-400">{item.description}</p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
