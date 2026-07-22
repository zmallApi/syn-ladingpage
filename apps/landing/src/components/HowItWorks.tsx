const steps = [
  {
    n: "01",
    title: "Conectar",
    text: "Ligamos ao sistema da empresa. Os dados não saem de lá.",
  },
  {
    n: "02",
    title: "Entender",
    text: "Interpretamos como a empresa funciona — conceitos, relações, processos.",
  },
  {
    n: "03",
    title: "Especializar",
    text: "Sugerimos capacidades por resultado: cobrar, reter, vender, atender.",
  },
  {
    n: "04",
    title: "Ensinar à IA",
    text: "Você aprova. Só então a IA recebe o que pode fazer.",
  },
  {
    n: "05",
    title: "Executar",
    text: "Agentes respondem com o conhecimento da empresa — sob o seu controle.",
  },
];

export function HowItWorks() {
  return (
    <section id="como-funciona" className="py-16 sm:py-24">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="mb-12 text-center">
          <p className="text-xs font-medium uppercase tracking-widest text-cyan">Como funciona</p>
          <h2 className="mt-2 text-3xl font-bold text-white sm:text-4xl">
            Do sistema da empresa à IA — com entendimento no meio
          </h2>
          <p className="mx-auto mt-3 max-w-2xl text-sm text-slate-400">
            Não entregamos um protocolo. Entregamos uma camada de entendimento entre o que a
            empresa já sabe e o que a IA precisa usar.
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
