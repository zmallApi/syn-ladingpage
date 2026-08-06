const trusts = [
  {
    title: "Edge",
    text: "Quando precisa, as fontes ficam na sua rede. O Cloud não precisa entrar.",
  },
  {
    title: "Dados no cliente",
    text: "O Synapsee prepara contexto a partir das suas fontes — sem treinar um modelo com o seu negócio.",
  },
  {
    title: "Só conexões de saída",
    text: "Com Edge, a conversa começa do seu lado. Nada entra sem você.",
  },
  {
    title: "Aprovação humana",
    text: "A IA só age no que você autorizou. Revogue o acesso quando quiser.",
  },
];

export function Trust() {
  return (
    <section id="confianca" className="border-t border-border/60 py-16 sm:py-24">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="mb-12 text-center">
          <p className="text-xs font-medium uppercase tracking-widest text-cyan">
            Segurança
          </p>
          <h2 className="mt-2 text-3xl font-bold text-white sm:text-4xl">
            A IA nunca faz nada que você não tenha aprovado
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-sm text-slate-400">
            Preparar trabalho para agentes exige confiança. O Synapsee foi pensado para
            isso desde o primeiro dia.
          </p>
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

        <p className="mx-auto mt-10 max-w-xl text-center text-sm font-medium text-slate-300">
          Modelos são motor. O conhecimento — e o contexto — ficam no Synapsee.
        </p>
      </div>
    </section>
  );
}
