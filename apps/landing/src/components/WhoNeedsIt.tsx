function IconLayers() {
  return (
    <svg
      className="h-6 w-6 text-cyan"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={1.5}
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 3L3 8l9 5 9-5-9-5z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 12l9 5 9-5M3 16l9 5 9-5" />
    </svg>
  );
}

function IconBuilding() {
  return (
    <svg
      className="h-6 w-6 text-cyan"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={1.5}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M3 21h18M5 21V7l7-4 7 4v14M9 21v-6h6v6M9 9h.01M15 9h.01M9 13h.01M15 13h.01"
      />
    </svg>
  );
}

function IconCode() {
  return (
    <svg
      className="h-6 w-6 text-cyan"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={1.5}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4"
      />
    </svg>
  );
}

const points = [
  {
    icon: IconBuilding,
    title: "Empresas",
    text: "Cobrar, reter e vender com agentes que recebem o contexto certo — não um dump do sistema.",
  },
  {
    icon: IconCode,
    title: "Times de engenharia",
    text: "Implementar uma Story sem o agente precisar descobrir o repositório inteiro. O Synapsee prepara o quê; o time foca no como.",
  },
  {
    icon: IconLayers,
    title: "Software houses",
    text: "Cada cliente já tem um sistema que conhece o negócio. Liberem esse entendimento para os agentes — em cada conta.",
  },
];

export function WhoNeedsIt() {
  return (
    <section id="para-quem" className="border-t border-border/60 py-16 sm:py-24">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="mb-12 text-center">
          <p className="text-xs font-medium uppercase tracking-widest text-cyan">
            Por que existe
          </p>
          <h2 className="mt-2 text-3xl font-bold text-white sm:text-4xl">
            Porque o agente não conhece a sua empresa
          </h2>
          <p className="mx-auto mt-3 max-w-2xl text-sm text-slate-400">
            Modelos generalistas são ótimos em linguagem. Péssimos em saber como{" "}
            <em className="not-italic text-slate-300">você</em> cobra, entrega e
            desenvolve. O Synapsee existe para preencher esse buraco.
          </p>
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
