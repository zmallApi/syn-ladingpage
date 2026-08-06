const packItems = [
  "Objetivo",
  "Evidências",
  "Impacto / prioridade",
  "Plano",
  "Checklist",
  "Restrições ao agente",
];

export function Delivery() {
  return (
    <section id="entrega" className="border-t border-border/60 py-16 sm:py-24">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="mb-12 text-center">
          <p className="text-xs font-medium uppercase tracking-widest text-cyan">
            Depois da missão
          </p>
          <h2 className="mt-2 text-3xl font-bold text-white sm:text-4xl">
            O valor está na preparação do contexto.
            <br />
            <span className="text-slate-400">O Mission Package é só a entrega.</span>
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-sm text-slate-400">
            Ninguém compra um ERP por causa do PDF. Compra porque o negócio está
            organizado. O Synapsee organiza o contexto — e entrega isso ao agente num
            formato pronto para executar.
          </p>
        </div>

        <div className="mx-auto max-w-xl">
          <div className="flex flex-col items-center gap-1 text-sm">
            {[
              { label: "Você", text: "Quero implementar esta Story" },
              { label: "Synapsee", text: "Prepara o contexto da empresa" },
              { label: "Entrega", text: "Mission Package" },
              { label: "Agente", text: "Cursor / Claude / ChatGPT executa" },
            ].map((step, i, arr) => (
              <div key={step.label} className="flex w-full flex-col items-center">
                <div className="w-full rounded-xl border border-border bg-surface-card px-4 py-3 card-glow">
                  <p className="text-[11px] uppercase tracking-widest text-slate-500">
                    {step.label}
                  </p>
                  <p className="mt-1 text-sm text-white">{step.text}</p>
                </div>
                {i < arr.length - 1 && (
                  <span className="py-1 font-mono text-slate-600">↓</span>
                )}
              </div>
            ))}
          </div>

          <div className="mt-8 rounded-2xl border border-cyan/25 bg-cyan/5 p-6">
            <p className="text-xs font-medium uppercase tracking-widest text-cyan">
              O que o agente recebe
            </p>
            <ul className="mt-4 grid gap-2 sm:grid-cols-2">
              {packItems.map((item) => (
                <li
                  key={item}
                  className="flex items-center gap-2 text-sm text-slate-200"
                >
                  <span className="text-cyan">✓</span>
                  {item}
                </li>
              ))}
            </ul>
            <p className="mt-5 text-xs text-slate-500">
              Mission Package = formato de entrega do Context Operating System — não o
              produto.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
