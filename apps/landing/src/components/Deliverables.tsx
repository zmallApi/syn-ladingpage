const capabilities = [
  {
    title: "Especialista em Cobrar",
    need: "Quero cobrar quem está inadimplente",
  },
  {
    title: "Especialista em Reter Clientes",
    need: "Quero saber quem pode cancelar",
  },
  {
    title: "Especialista em Descobrir Oportunidades",
    need: "Quero encontrar onde vender mais",
  },
  {
    title: "Especialista em Atender Clientes",
    need: "Quero o histórico completo na hora",
  },
];

export function Deliverables() {
  return (
    <section id="entregaveis" className="border-t border-border/60 py-16 sm:py-24">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="mb-12 text-center">
          <p className="text-xs font-medium uppercase tracking-widest text-cyan">Capacidades</p>
          <h2 className="mt-2 text-3xl font-bold text-white sm:text-4xl">
            O que o seu sistema já sabe — ensinado à IA
          </h2>
          <p className="mx-auto mt-3 max-w-2xl text-sm text-slate-400">
            O Synapsee identifica automaticamente capacidades da empresa. Você decide o que liberar.
          </p>
        </div>

        <div className="grid gap-6 sm:grid-cols-2">
          {capabilities.map((c) => (
            <div
              key={c.title}
              className="rounded-2xl border border-border bg-surface-card p-6 card-glow"
            >
              <p className="text-lg font-semibold text-white">{c.title}</p>
              <p className="mt-2 text-sm text-slate-500">“{c.need}”</p>
            </div>
          ))}
        </div>

        <p className="mt-10 text-center text-base font-medium text-cyan">
          Deseja ensinar essas capacidades para seus agentes de IA?
        </p>
      </div>
    </section>
  );
}
