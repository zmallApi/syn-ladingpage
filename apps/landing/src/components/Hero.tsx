import { DemoAnimation } from "./DemoAnimation";

export function Hero({ onConnect }: { onConnect: () => void }) {
  return (
    <section className="relative overflow-hidden pt-28 pb-16 sm:pt-36 sm:pb-24">
      <div className="absolute inset-0 grid-bg opacity-50" />
      <div className="absolute left-1/2 top-0 h-[500px] w-[800px] -translate-x-1/2 rounded-full bg-cyan/5 blur-3xl" />

      <div className="relative mx-auto max-w-6xl px-4 sm:px-6">
        <div className="grid items-center gap-12 lg:grid-cols-2 lg:gap-8">
          <div>
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-border bg-surface-card px-3 py-1 text-xs text-slate-400">
              <span className="h-1.5 w-1.5 rounded-full bg-green animate-pulse" />
              Acesso antecipado ao Beta
            </div>

            <h1 className="text-3xl font-bold leading-tight tracking-tight sm:text-4xl lg:text-[2.75rem] lg:leading-[1.15]">
              <span className="text-gradient">Conecte qualquer sistema</span>
              <br />
              <span className="text-white">à </span>
              <span className="text-cyan">IA em minutos.</span>
            </h1>

            <p className="mt-5 max-w-lg text-base leading-relaxed text-slate-400 sm:text-lg">
              O Synapsee entende automaticamente seu banco de dados, cria APIs, gera um servidor MCP e
              permite que ChatGPT, Claude, Cursor e outros agentes consultem seu sistema com segurança —
              sem escrever código de integração.
            </p>

            <p className="mt-4 max-w-lg rounded-xl border border-border/80 bg-surface-card/60 px-4 py-3 text-sm leading-relaxed text-slate-400">
              <span className="font-medium text-cyan">MCP</span> (Model Context Protocol) é o padrão que
              permite agentes de IA usarem seu sistema com segurança.
            </p>

            <div className="mt-8 flex flex-wrap items-center gap-4">
              <button
                type="button"
                onClick={onConnect}
                className="rounded-xl cyan-gradient px-6 py-3 text-sm font-semibold text-surface shadow-lg shadow-cyan/10 transition hover:brightness-110"
              >
                Solicitar acesso Beta
              </button>
              <a
                href="#como-funciona"
                className="text-sm font-medium text-slate-400 transition hover:text-cyan"
              >
                Ver como funciona →
              </a>
            </div>

            <div className="mt-10 flex flex-wrap gap-6 text-xs text-slate-500">
              <span>PostgreSQL & ERPs</span>
              <span>·</span>
              <span>ChatGPT, Claude, Cursor, Windsurf</span>
            </div>
          </div>

          <DemoAnimation />
        </div>
      </div>
    </section>
  );
}
