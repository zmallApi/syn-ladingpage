const plans = [
  {
    name: "Starter",
    price: "R$49",
    period: "/mês",
    description: "Para validar com um banco de produção",
    features: ["1 banco conectado", "10.000 chamadas/mês", "API REST + OpenAPI", "Servidor MCP básico"],
    highlighted: false,
  },
  {
    name: "Pro",
    price: "R$149",
    period: "/mês",
    description: "Para times que expõem dados a agentes",
    features: ["5 bancos conectados", "100.000 chamadas/mês", "Ferramentas de negócio via IA", "SDK + docs customizados"],
    highlighted: true,
  },
  {
    name: "Agency",
    price: "Sob consulta",
    period: "",
    description: "Para integradores e consultorias",
    features: ["Bancos ilimitados", "Chamadas ilimitadas", "Agentes especializados", "White-label + SLA"],
    highlighted: false,
  },
];

export function Pricing({ onConnect }: { onConnect: () => void }) {
  return (
    <section id="planos" className="border-t border-border/60 py-16 sm:py-24">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="mb-12 text-center">
          <p className="text-xs font-medium uppercase tracking-widest text-cyan">Planos</p>
          <h2 className="mt-2 text-3xl font-bold text-white sm:text-4xl">Comece pequeno, escale quando precisar</h2>
          <p className="mt-3 text-sm text-slate-400">
            Entre na lista de espera e garanta condições especiais de early access.
          </p>
        </div>

        <div className="grid gap-6 md:grid-cols-3">
          {plans.map((plan) => (
            <div
              key={plan.name}
              className={`rounded-2xl border p-6 card-glow transition ${
                plan.highlighted
                  ? "border-cyan/30 bg-surface-card ring-1 ring-cyan/20"
                  : "border-border bg-surface-card"
              }`}
            >
              {plan.highlighted && (
                <span className="mb-3 inline-block rounded-full bg-cyan/10 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-cyan">
                  Mais popular
                </span>
              )}
              <h3 className="text-lg font-semibold text-white">{plan.name}</h3>
              <div className="mt-2 flex items-baseline gap-1">
                <span className="text-3xl font-bold text-white">{plan.price}</span>
                {plan.period && <span className="text-sm text-slate-500">{plan.period}</span>}
              </div>
              <p className="mt-2 text-sm text-slate-400">{plan.description}</p>
              <ul className="mt-5 space-y-2">
                {plan.features.map((f) => (
                  <li key={f} className="flex items-start gap-2 text-sm text-slate-300">
                    <svg className="mt-0.5 h-4 w-4 shrink-0 text-cyan" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    {f}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-10 text-center">
          <button
            type="button"
            onClick={onConnect}
            className="rounded-xl cyan-gradient px-8 py-3 text-sm font-semibold text-surface shadow-lg shadow-cyan/10 transition hover:brightness-110"
          >
            Entrar na lista de espera
          </button>
        </div>
      </div>
    </section>
  );
}
