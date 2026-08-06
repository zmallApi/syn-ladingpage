const steps = [
  {
    n: "01",
    title: "Conectar",
    text: "Ligue as fontes onde o conhecimento da empresa já vive.",
  },
  {
    n: "02",
    title: "Entender",
    text: "O Synapsee transforma esse conhecimento em contexto — sem treinar um chatbot no seu domínio.",
  },
  {
    n: "03",
    title: "Escolher missão",
    text: "Você diz o objetivo: cobrar, implementar uma Story, entender um incidente…",
  },
  {
    n: "04",
    title: "Receber Mission Package",
    text: "Consequência da preparação: objetivo, evidências, plano e limites prontos para o agente.",
  },
  {
    n: "05",
    title: "Executar no agente",
    text: "Cursor, Claude ou ChatGPT fazem o trabalho. O Synapsee já preparou tudo.",
  },
];

export function HowItWorks() {
  return (
    <section id="como-funciona" className="border-t border-border/60 py-16 sm:py-24">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="mb-12 text-center">
          <p className="text-xs font-medium uppercase tracking-widest text-cyan">
            Como funciona
          </p>
          <h2 className="mt-2 text-3xl font-bold text-white sm:text-4xl">
            A jornada do trabalho preparado
          </h2>
          <p className="mx-auto mt-3 max-w-2xl text-sm text-slate-400">
            Conectar → entender → escolher missão → receber o pack → o agente executa.
            Sem atalho que jogue o sistema inteiro no chat.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {steps.map((s) => (
            <div
              key={s.n}
              className="rounded-2xl border border-border bg-surface-card p-5 card-glow"
            >
              <span className="font-mono text-xs text-slate-500">{s.n}</span>
              <h3 className="mt-3 text-base font-semibold text-white">{s.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-400">{s.text}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
