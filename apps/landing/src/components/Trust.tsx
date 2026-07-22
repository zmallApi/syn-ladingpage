const trusts = [
  {
    title: "Dados no seu ambiente",
    text: "Os dados continuam onde estão. Nada é importado.",
  },
  {
    title: "Você aprova tudo",
    text: "A IA nunca executa algo que você não tenha aprovado.",
  },
  {
    title: "Você no controle",
    text: "A IA continua sob o seu controle — sempre.",
  },
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

        <div className="grid gap-6 md:grid-cols-3">
          {trusts.map((t) => (
            <div
              key={t.title}
              className="rounded-2xl border border-border bg-surface-card p-6 card-glow"
            >
              <p className="text-cyan">✓</p>
              <h3 className="mt-3 text-lg font-semibold text-white">{t.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-400">{t.text}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
