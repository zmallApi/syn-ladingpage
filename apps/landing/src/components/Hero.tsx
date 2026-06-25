function WireframeGlobe() {
  return (
    <div className="relative mx-auto aspect-square w-full max-w-md">
      <div className="absolute inset-0 rounded-full bg-cyan/5 blur-3xl glow-orb" />
      <div className="absolute inset-8 rounded-full border border-cyan/20 float-slow" />
      <div className="absolute inset-16 rounded-full border border-purple/15 float-slow" style={{ animationDelay: "-2s" }} />
      <svg viewBox="0 0 200 200" className="relative h-full w-full" fill="none">
        <circle cx="100" cy="100" r="70" stroke="rgba(0,229,255,0.3)" strokeWidth="0.5" />
        <ellipse cx="100" cy="100" rx="70" ry="25" stroke="rgba(0,229,255,0.2)" strokeWidth="0.5" />
        <ellipse cx="100" cy="100" rx="70" ry="25" stroke="rgba(0,229,255,0.15)" strokeWidth="0.5" transform="rotate(60 100 100)" />
        <ellipse cx="100" cy="100" rx="70" ry="25" stroke="rgba(0,229,255,0.15)" strokeWidth="0.5" transform="rotate(-60 100 100)" />
        <circle cx="100" cy="100" r="4" fill="#00e5ff" />
        {[
          [100, 30], [160, 70], [160, 130], [100, 170], [40, 130], [40, 70],
        ].map(([cx, cy], i) => (
          <g key={i}>
            <line x1="100" y1="100" x2={cx} y2={cy} stroke="rgba(0,229,255,0.15)" strokeWidth="0.5" />
            <circle cx={cx} cy={cy} r="3" fill="rgba(168,85,247,0.6)" />
          </g>
        ))}
      </svg>
    </div>
  );
}

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
              Early access — lista de espera aberta
            </div>

            <h1 className="text-3xl font-bold leading-tight tracking-tight sm:text-4xl lg:text-[2.75rem] lg:leading-[1.15]">
              <span className="text-gradient">Transforme seu ERP</span>
              <br />
              <span className="text-white">em uma ferramenta para </span>
              <span className="text-cyan">ChatGPT e agentes de IA.</span>
            </h1>

            <p className="mt-5 max-w-lg text-base leading-relaxed text-slate-400 sm:text-lg">
              Conecte seu banco de dados. A Synapse mapeia cada tabela, infere relações de negócio
              e gera API REST, servidor MCP e documentação — prontos para ChatGPT, Claude e Cursor.
            </p>

            <div className="mt-8 flex flex-wrap items-center gap-4">
              <button
                type="button"
                onClick={onConnect}
                className="rounded-xl cyan-gradient px-6 py-3 text-sm font-semibold text-surface shadow-lg shadow-cyan/10 transition hover:brightness-110"
              >
                Conectar banco de dados
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

          <WireframeGlobe />
        </div>
      </div>
    </section>
  );
}
