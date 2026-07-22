const specialists = [
  {
    title: "Especialista em Cobrança",
    learns: "Quando a IA recebe este especialista, ela aprende:",
    items: [
      "Quem deve",
      "Quanto deve",
      "Há quanto tempo",
      "Quem cobrar primeiro",
    ],
  },
  {
    title: "Especialista em Retenção",
    learns: "Ela passa a saber:",
    items: [
      "Quem pode cancelar",
      "Sinais de risco e atraso",
      "Quem priorizar no contato",
      "O que olhar no histórico",
    ],
  },
  {
    title: "Especialista em Oportunidades",
    learns: "Ela consegue:",
    items: [
      "Encontrar onde vender mais",
      "Cruzar comportamento e potencial",
      "Sugerir próximos passos",
      "Priorizar contas quentes",
    ],
  },
  {
    title: "Especialista em Atendimento",
    learns: "Na hora da pergunta, ela tem:",
    items: [
      "Histórico completo do cliente",
      "Eventos recentes",
      "Situação financeira",
      "Contexto para responder com precisão",
    ],
  },
];

export function Deliverables() {
  return (
    <section id="entregaveis" className="border-t border-border/60 py-16 sm:py-24">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="mb-12 text-center">
          <p className="text-xs font-medium uppercase tracking-widest text-cyan">
            Capacidades
          </p>
          <h2 className="mt-2 text-3xl font-bold text-white sm:text-4xl">
            Capacidades são o que a IA passa a saber fazer
          </h2>
          <p className="mx-auto mt-3 max-w-2xl text-sm text-slate-400">
            Não é “expor tabelas”. É publicar habilidades de negócio que você confirma —
            concretas, auditáveis e revogáveis.
          </p>
        </div>

        <div className="grid gap-6 sm:grid-cols-2">
          {specialists.map((c) => (
            <div
              key={c.title}
              className="rounded-2xl border border-border bg-surface-card p-6 card-glow"
            >
              <p className="text-lg font-semibold text-white">{c.title}</p>
              <p className="mt-2 text-sm text-slate-500">{c.learns}</p>
              <ul className="mt-4 space-y-2">
                {c.items.map((item) => (
                  <li key={item} className="flex items-start gap-2 text-sm text-slate-300">
                    <span className="text-cyan">✓</span>
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <p className="mt-10 text-center text-base font-medium text-cyan">
          Quer publicar essas capacidades para seus agentes?
        </p>
      </div>
    </section>
  );
}
