import { DemoAnimation } from "./DemoAnimation";

export function Hero({ onConnect }: { onConnect: () => void }) {
  return (
    <section className="relative overflow-hidden pt-28 pb-16 sm:pt-36 sm:pb-24">
      <div className="absolute inset-0 grid-bg opacity-50" />
      <div className="absolute left-1/2 top-0 h-[500px] w-[800px] -translate-x-1/2 rounded-full bg-cyan/5 blur-3xl" />

      <div className="relative mx-auto max-w-6xl px-4 sm:px-6">
        <div className="grid items-center gap-12 lg:grid-cols-2 lg:gap-8">
          <div className="min-w-0">
            <p className="mb-3 text-sm font-semibold tracking-tight text-white sm:text-base">
              Synapsee <span className="text-cyan">IA</span>
            </p>
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-border bg-surface-card px-3 py-1 text-xs text-slate-400">
              <span className="h-1.5 w-1.5 rounded-full bg-green animate-pulse" />
              Acesso antecipado ao Beta
            </div>

            <h1 className="text-3xl font-bold leading-tight tracking-tight sm:text-4xl lg:text-[2.75rem] lg:leading-[1.15]">
              <span className="text-white">Seu sistema já entende o seu negócio.</span>
              <br />
              <span className="text-gradient">O Synapsee faz a IA entender também.</span>
            </h1>

            <p className="mt-5 max-w-lg text-lg font-medium leading-snug text-white">
              O Synapsee não conecta tabelas à IA. Ele conecta o conhecimento da empresa.
            </p>

            <p className="mt-4 max-w-lg text-base leading-relaxed text-slate-400">
              Transforme o conhecimento preso no ERP, CRM e outros sistemas em
              capacidades que agentes de IA conseguem utilizar.
            </p>

            <ul className="mt-5 space-y-1.5 text-sm text-slate-300">
              <li className="flex items-center gap-2">
                <span className="text-cyan">✓</span> Sem mover dados.
              </li>
              <li className="flex items-center gap-2">
                <span className="text-cyan">✓</span> Sem expor o banco.
              </li>
              <li className="flex items-center gap-2">
                <span className="text-cyan">✓</span> Sob o seu controle.
              </li>
            </ul>

            <div className="mt-8 flex flex-wrap items-center gap-4">
              <button
                type="button"
                onClick={onConnect}
                className="rounded-xl cyan-gradient px-6 py-3 text-sm font-semibold text-surface shadow-lg shadow-cyan/10 transition hover:brightness-110"
              >
                Solicitar acesso
              </button>
              <a
                href="#como-funciona"
                className="text-sm font-medium text-slate-400 transition hover:text-cyan"
              >
                Como funciona →
              </a>
            </div>
          </div>

          <div className="min-w-0 w-full justify-self-center lg:justify-self-end">
            <DemoAnimation />
          </div>
        </div>
      </div>
    </section>
  );
}
