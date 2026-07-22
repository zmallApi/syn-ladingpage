const steps = [
  {
    n: "01",
    title: "Conectar",
    text: "Cloud ou Edge. Os dados não saem do ambiente da empresa.",
  },
  {
    n: "02",
    title: "Entender",
    text: "Transformamos o conhecimento da empresa em capacidades que agentes conseguem utilizar.",
  },
  {
    n: "03",
    title: "Especializar",
    text: "Sugerimos capacidades concretas: encontrar inadimplentes, priorizar cobranças…",
  },
  {
    n: "04",
    title: "Publicar",
    text: "Você aprova. Só então as capacidades entram no MCP para os agentes.",
  },
  {
    n: "05",
    title: "Usar",
    text: "Agentes perguntam em linguagem natural e respondem com o conhecimento da empresa.",
  },
];

const concepts = ["Clientes", "Cobranças", "Vendas", "Contratos", "Processos"];

export function HowItWorks() {
  return (
    <section id="como-funciona" className="py-16 sm:py-24">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="mb-12 text-center">
          <p className="text-xs font-medium uppercase tracking-widest text-cyan">Como funciona</p>
          <h2 className="mt-2 text-3xl font-bold text-white sm:text-4xl">
            Do conhecimento preso nos sistemas à IA que usa esse conhecimento
          </h2>
          <p className="mx-auto mt-3 max-w-2xl text-sm text-slate-400">
            O Synapsee não conecta tabelas à IA. Ele conecta o conhecimento da empresa —
            e você publica só o que aprova.
          </p>
        </div>

        <div className="mx-auto mb-12 max-w-2xl rounded-2xl border border-border bg-surface-card p-6 card-glow sm:p-8">
          <p className="text-center text-xs font-medium uppercase tracking-widest text-cyan">
            Camada semântica
          </p>
          <p className="mt-3 text-center text-sm text-slate-400">
            Em português: a IA deixa de enxergar tabelas. Passa a enxergar o negócio.
          </p>
          <p className="my-4 text-center font-mono text-lg text-slate-600">↓</p>
          <div className="flex flex-wrap items-center justify-center gap-2">
            {concepts.map((c) => (
              <span
                key={c}
                className="rounded-lg border border-cyan/20 bg-cyan/5 px-3 py-1.5 text-sm font-medium text-cyan"
              >
                {c}
              </span>
            ))}
          </div>
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
