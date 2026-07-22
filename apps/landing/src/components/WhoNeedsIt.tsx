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

const points = [
  {
    icon: IconLayers,
    title: "Software houses",
    text: "O ERP do cliente já conhece o negócio. Faça a IA conhecer também — em cada conta.",
  },
  {
    icon: IconBuilding,
    title: "Empresas",
    text: "Cobrar, reter, vender, atender — com a IA usando o conhecimento que você já tem.",
  },
  {
    icon: IconCode,
    title: "Times de IA",
    text: "Pare de explicar o sistema ao modelo. Ensine o negócio uma vez.",
  },
];

export function WhoNeedsIt() {
  return (
    <section id="quem-precisa" className="border-t border-border/60 py-16 sm:py-24">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="mb-12 text-center">
          <p className="text-xs font-medium uppercase tracking-widest text-cyan">Para quem</p>
          <h2 className="mt-2 text-3xl font-bold text-white sm:text-4xl">
            Finalmente, uma forma da IA entender o ERP
          </h2>
        </div>

        <div className="grid gap-6 md:grid-cols-3">
          {points.map((p) => {
            const Icon = p.icon;
            return (
              <div
                key={p.title}
                className="rounded-2xl border border-border bg-surface-card p-6 card-glow"
              >
                <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-cyan/20 bg-cyan/5">
                  <Icon />
                </div>
                <h3 className="mt-4 text-lg font-semibold text-white">{p.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-400">{p.text}</p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
