const withoutSteps = [
  "Empresa",
  "Sistema",
  "MCP",
  "Tools",
  "Agente tenta descobrir",
];

const withSteps = [
  "Empresa",
  "Knowledge Layer",
  "Context Engine",
  "Mission Package",
  "Agente executa",
];

export function McpVsSynapsee() {
  return (
    <section id="diferenca" className="border-t border-border/60 py-16 sm:py-24">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="mb-12 text-center">
          <p className="text-xs font-medium uppercase tracking-widest text-cyan">
            A diferença
          </p>
          <h2 className="mt-2 text-3xl font-bold text-white sm:text-4xl">
            Sem Synapsee, o agente improvisa.
            <br />
            <span className="text-gradient">Com Synapsee, ele recebe o contexto.</span>
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-sm text-slate-400">
            Expor ferramentas não prepara o trabalho. O Synapsee existe para o agente
            não precisar descobrir como a sua empresa funciona.
          </p>
        </div>

        <div className="grid gap-8 md:grid-cols-2">
          <div className="rounded-2xl border border-border bg-surface-card p-6 card-glow">
            <p className="text-xs font-medium uppercase tracking-widest text-slate-500">
              Sem Synapsee
            </p>
            <div className="mt-6 flex flex-col items-center gap-1">
              {withoutSteps.map((step, i) => (
                <div key={step} className="flex w-full flex-col items-center">
                  <span
                    className={`w-full rounded-lg border px-4 py-2.5 text-center text-sm ${
                      step === "Agente tenta descobrir"
                        ? "border-red-500/30 bg-red-500/5 text-slate-300"
                        : "border-border bg-surface text-slate-400"
                    }`}
                  >
                    {step}
                  </span>
                  {i < withoutSteps.length - 1 && (
                    <span className="py-1 font-mono text-slate-600">↓</span>
                  )}
                </div>
              ))}
            </div>
            <p className="mt-5 text-center text-xs text-slate-500">
              Protocolo e tools — o agente ainda caça o entendimento sozinho.
            </p>
          </div>

          <div className="rounded-2xl border border-cyan/30 bg-surface-card p-6 ring-1 ring-cyan/15 card-glow">
            <p className="text-xs font-medium uppercase tracking-widest text-cyan">
              Com Synapsee
            </p>
            <div className="mt-6 flex flex-col items-center gap-1">
              {withSteps.map((step, i) => (
                <div key={step} className="flex w-full flex-col items-center">
                  <span
                    className={`w-full rounded-lg border px-4 py-2.5 text-center text-sm ${
                      step === "Mission Package" || step === "Agente executa"
                        ? "border-cyan/40 bg-cyan/10 font-medium text-cyan"
                        : "border-border bg-surface text-slate-200"
                    }`}
                  >
                    {step}
                  </span>
                  {i < withSteps.length - 1 && (
                    <span className="py-1 font-mono text-slate-600">↓</span>
                  )}
                </div>
              ))}
            </div>
            <p className="mt-5 text-center text-xs text-slate-400">
              O Synapsee prepara o contexto. O agente só executa.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
