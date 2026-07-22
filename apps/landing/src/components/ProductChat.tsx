export function ProductChat() {
  const questions = [
    "Quem pode cancelar este mês?",
    "Quem devo cobrar primeiro?",
    "Quais clientes estão prontos para um upgrade?",
    "Quais contratos vencem esta semana?",
  ];

  return (
    <section id="na-pratica" className="border-t border-border/60 py-16 sm:py-24">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="mb-12 text-center">
          <p className="text-xs font-medium uppercase tracking-widest text-cyan">Na prática</p>
          <h2 className="mt-2 text-3xl font-bold text-white sm:text-4xl">
            Depois de publicado, qualquer agente pode perguntar
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-sm text-slate-400">
            Perguntas como estas — com capacidades que você aprovou, não SQL gerado por IA.
          </p>
        </div>

        <div className="mx-auto max-w-xl rounded-2xl border border-border bg-surface-card p-5 sm:p-6 card-glow">
          <p className="text-[11px] uppercase tracking-widest text-slate-500">
            Exemplos
          </p>
          <ul className="mt-4 space-y-3">
            {questions.map((q) => (
              <li
                key={q}
                className="rounded-xl border border-border bg-surface px-4 py-3 text-sm text-white"
              >
                {q}
              </li>
            ))}
          </ul>
          <p className="mt-5 text-sm text-slate-400">
            O agente responde usando capacidades que você aprovou — não SQL gerado por IA.
          </p>
        </div>
      </div>
    </section>
  );
}
