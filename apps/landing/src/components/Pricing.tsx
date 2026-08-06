const plans = [
  {
    name: "Starter",
    price: "R$49",
    period: "/mês",
    text: "Para começar a preparar contexto para os agentes.",
    features: [
      "Um sistema conectado",
      "Missões e trabalho preparado",
      "Uso com seus agentes",
    ],
  },
  {
    name: "Business",
    price: "R$149",
    period: "/mês",
    text: "Dados na sua rede. Só conexões de saída.",
    features: [
      "Edge na sua infraestrutura",
      "Vários sistemas",
      "Cloud nunca entra na sua rede",
      "Suporte prioritário no Beta",
    ],
    highlight: true,
  },
  {
    name: "Enterprise",
    price: "Sob consulta",
    period: "",
    text: "Escala, conformidade e onboarding assistido.",
    features: [
      "Infraestrutura dedicada",
      "Controles avançados (roadmap)",
      "Auditoria (roadmap)",
      "Onboarding assistido",
    ],
  },
];

export function Pricing({ onConnect }: { onConnect: () => void }) {
  return (
    <section id="planos" className="border-t border-border/60 py-16 sm:py-24">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="mb-12 text-center">
          <p className="text-xs font-medium uppercase tracking-widest text-cyan">
            Acesso
          </p>
          <h2 className="mt-2 text-3xl font-bold text-white sm:text-4xl">
            Do primeiro sistema à operação segura
          </h2>
          <p className="mt-3 text-sm text-slate-400">
            Preços indicativos para early adopters.
          </p>
        </div>

        <div className="grid gap-6 md:grid-cols-3">
          {plans.map((p) => (
            <div
              key={p.name}
              className={`rounded-2xl border p-6 card-glow ${
                p.highlight
                  ? "border-cyan/30 bg-surface-card ring-1 ring-cyan/20"
                  : "border-border bg-surface-card"
              }`}
            >
              <p className="text-sm font-medium text-slate-400">{p.name}</p>
              <p className="mt-3 text-3xl font-bold text-white">
                {p.price}
                <span className="text-base font-normal text-slate-500">
                  {p.period}
                </span>
              </p>
              <p className="mt-2 text-sm text-slate-400">{p.text}</p>
              <ul className="mt-6 space-y-2">
                {p.features.map((f) => (
                  <li
                    key={f}
                    className="flex items-start gap-2 text-sm text-slate-300"
                  >
                    <span className="text-cyan">✓</span>
                    {f}
                  </li>
                ))}
              </ul>
              <button
                type="button"
                onClick={onConnect}
                className={`mt-8 w-full rounded-xl py-2.5 text-sm font-semibold transition ${
                  p.highlight
                    ? "cyan-gradient text-surface hover:brightness-110"
                    : "border border-border text-slate-200 hover:border-cyan/40 hover:text-cyan"
                }`}
              >
                Solicitar acesso
              </button>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
