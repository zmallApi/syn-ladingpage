const missions = [
  {
    ask: "Quero implementar esta Story",
    why: "O agente não precisa vasculhar o monorepo. Recebe o que importa para executar.",
  },
  {
    ask: "Quero cobrar inadimplentes",
    why: "Prioridade, evidências e limites claros — antes de qualquer mensagem ao cliente.",
  },
  {
    ask: "Quero entender este incidente",
    why: "Blast radius e evidências do que já existe, sem o agente inventar o mapa.",
  },
  {
    ask: "Quero descobrir quem pode cancelar",
    why: "Sinais de risco e próximas ações a partir do conhecimento da empresa.",
  },
];

export function Missions() {
  return (
    <section id="missoes" className="border-t border-border/60 py-16 sm:py-24">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="mb-12 text-center">
          <p className="text-xs font-medium uppercase tracking-widest text-cyan">
            Missões
          </p>
          <h2 className="mt-2 text-3xl font-bold text-white sm:text-4xl">
            Você começa pelo objetivo
          </h2>
          <p className="mx-auto mt-3 max-w-2xl text-sm text-slate-400">
            Não por uma lista de ferramentas. Você diz o que precisa — o Synapsee
            prepara o contexto para o agente executar.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          {missions.map((m) => (
            <div
              key={m.ask}
              className="rounded-2xl border border-border bg-surface-card p-6 card-glow"
            >
              <p className="text-lg font-semibold text-white">✓ {m.ask}</p>
              <p className="mt-3 text-sm leading-relaxed text-slate-400">{m.why}</p>
            </div>
          ))}
        </div>

        <p className="mx-auto mt-10 max-w-xl text-center text-sm text-slate-500">
          Depois do objetivo, o Synapsee prepara o contexto — e só então entrega o
          Mission Package ao agente.
        </p>
      </div>
    </section>
  );
}
