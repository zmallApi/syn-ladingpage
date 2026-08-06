const layers = [
  {
    title: "Camada de conhecimento",
    formal: "Knowledge Layer",
    text: "Onde fica o que a empresa já sabe — organizado a partir das fontes, com o que você confirma.",
  },
  {
    title: "Motor de contexto",
    formal: "Context Engine",
    text: "Seleciona e organiza o que importa agora. Não decide o negócio — prepara o entendimento.",
  },
  {
    title: "Motor de missões",
    formal: "Mission Engine",
    text: "Transforma o seu objetivo em trabalho pronto: plano, evidências e limites para o agente.",
  },
  {
    title: "Capacidades",
    formal: "Capabilities",
    text: "Os tipos de missão que o Synapsee sabe preparar — cobrir cobrança, Story, incidente e o que vier a seguir.",
  },
];

const flow = [
  "Fontes de conhecimento",
  "Knowledge Layer",
  "Context Engine",
  "Mission Engine",
  "Mission Package → Agente",
];

export function PlatformArchitecture() {
  return (
    <section id="arquitetura" className="border-t border-border/60 py-16 sm:py-24">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="mb-12 text-center">
          <p className="text-xs font-medium uppercase tracking-widest text-cyan">
            Arquitetura
          </p>
          <h2 className="mt-2 text-3xl font-bold text-white sm:text-4xl">
            Context Operating System
          </h2>
          <p className="mx-auto mt-3 max-w-2xl text-sm text-slate-400">
            Quatro peças. Uma responsabilidade: transformar conhecimento da empresa em
            contexto executável para agentes.
          </p>
        </div>

        <figure className="mb-12 overflow-hidden rounded-2xl border border-border bg-surface-card card-glow">
          <img
            src="/knowledge-graph.png"
            alt="Synapsee Knowledge Graph — código, tarefas, documentos, riscos e decisões conectados em um único mapa de conhecimento"
            className="w-full h-auto"
            loading="lazy"
            decoding="async"
          />
          <figcaption className="border-t border-border/60 px-4 py-3 text-center text-sm text-slate-400 sm:px-6">
            Conhecimento fragmentado vira um mapa — relações entre código, tarefas,
            docs e decisões. É disso que o Synapsee extrai contexto para o agente.
          </figcaption>
        </figure>

        <div className="mx-auto mb-10 max-w-md rounded-2xl border border-border bg-surface-card p-6 card-glow">
          <div className="flex flex-col items-center gap-1 text-sm">
            {flow.map((row, i, arr) => (
              <div key={row} className="flex w-full flex-col items-center">
                <span
                  className={`w-full rounded-lg border px-4 py-2.5 text-center ${
                    row.includes("Mission") || row.includes("Context")
                      ? "border-cyan/40 bg-cyan/10 font-medium text-cyan"
                      : "border-border bg-surface text-slate-300"
                  }`}
                >
                  {row}
                </span>
                {i < arr.length - 1 && (
                  <span className="py-1 font-mono text-slate-600">↓</span>
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {layers.map((l) => (
            <div
              key={l.title}
              className="rounded-2xl border border-border bg-surface-card p-6 card-glow"
            >
              <h3 className="text-base font-semibold text-white">{l.title}</h3>
              <p className="mt-1 text-[11px] text-slate-600">{l.formal}</p>
              <p className="mt-3 text-sm leading-relaxed text-slate-400">{l.text}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
