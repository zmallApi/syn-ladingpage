const plans = [
  {
    name: "Starter",
    price: "R$49",
    period: "/mês",
    text: "Um sistema. Capacidades aprovadas por você.",
    features: [
      "Um sistema conectado",
      "Capacidades por resultado",
      "Você aprova o que a IA faz",
    ],
  },
  {
    name: "Pro",
    price: "R$149",
    period: "/mês",
    text: "Vários sistemas. Mais profundidade de entendimento.",
    features: [
      "Até 5 sistemas",
      "Cobrar, reter, vender, atender",
      "Suporte prioritário no Beta",
    ],
    highlight: true,
  },
  {
    name: "Agency",
    price: "Sob consulta",
    period: "",
    text: "Multi-cliente. Onboarding assistido.",
    features: [
      "Portfólio de empresas",
      "Onboarding assistido",
      "Mesma camada de entendimento",
    ],
  },
];

export function Pricing({ onConnect }: { onConnect: () => void }) {
  return (
    <section id="planos" className="border-t border-border/60 py-16 sm:py-24">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="mb-12 text-center">
          <p className="text-xs font-medium uppercase tracking-widest text-cyan">Acesso</p>
          <h2 className="mt-2 text-3xl font-bold text-white sm:text-4xl">
            Beta para quem quer ensinar o negócio à IA
          </h2>
          <p className="mt-3 text-sm text-slate-400">Preços indicativos para early adopters.</p>
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
              {p.highlight && (
                <span className="mb-3 inline-block rounded-full bg-cyan/10 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-cyan">
                  Popular
                </span>
              )}
              <h3 className="text-lg font-semibold text-white">{p.name}</h3>
              <div className="mt-2 flex items-baseline gap-1">
                <span className="text-3xl font-bold text-white">{p.price}</span>
                {p.period && <span className="text-sm text-slate-500">{p.period}</span>}
              </div>
              <p className="mt-2 text-sm text-slate-400">{p.text}</p>
              <ul className="mt-5 space-y-2">
                {p.features.map((f) => (
                  <li key={f} className="flex items-start gap-2 text-sm text-slate-300">
                    <span className="text-cyan">✓</span>
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
            className="rounded-xl cyan-gradient px-8 py-3 text-sm font-semibold text-surface transition hover:brightness-110"
          >
            Solicitar acesso
          </button>
        </div>
      </div>
    </section>
  );
}
