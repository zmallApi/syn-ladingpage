const trusts = [
  {
    title: "Dados no seu ambiente",
    text: "Nada é importado. O conhecimento é interpretado onde já está.",
  },
  {
    title: "Sem abrir o banco",
    text: "Com Edge, apenas conexões de saída. O Cloud nunca entra na sua rede.",
  },
  {
    title: "Você aprova tudo",
    text: "A IA nunca executa algo que você não tenha publicado.",
  },
  {
    title: "Revogue a qualquer momento",
    text: "Capacidades e tokens podem ser desligados. Você no controle — sempre.",
  },
];

const extras = [
  "Sem abrir portas no banco",
  "Apenas conexões de saída (Edge)",
  "Trilha de auditoria (roadmap)",
  "Revogue qualquer capacidade a qualquer momento",
];

export function Trust() {
  return (
    <section className="border-t border-border/60 py-16 sm:py-24">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="mb-12 text-center">
          <p className="text-xs font-medium uppercase tracking-widest text-cyan">Confiança</p>
          <h2 className="mt-2 text-3xl font-bold text-white sm:text-4xl">
            A IA continua sob o seu controle
          </h2>
        </div>

        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {trusts.map((t) => (
            <div
              key={t.title}
              className="rounded-2xl border border-border bg-surface-card p-6 card-glow"
            >
              <p className="text-cyan">✓</p>
              <h3 className="mt-3 text-base font-semibold text-white">{t.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-400">{t.text}</p>
            </div>
          ))}
        </div>

        <ul className="mx-auto mt-10 flex max-w-3xl flex-wrap justify-center gap-x-6 gap-y-2 text-sm text-slate-400">
          {extras.map((e) => (
            <li key={e} className="flex items-center gap-2">
              <span className="text-cyan">✓</span>
              {e}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
