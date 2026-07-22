export function Architecture() {
  return (
    <section id="edge" className="border-t border-border/60 py-16 sm:py-24">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="mb-12 text-center">
          <p className="text-xs font-medium uppercase tracking-widest text-cyan">
            Conexão segura
          </p>
          <h2 className="mt-2 text-3xl font-bold text-white sm:text-4xl">
            Conecte do jeito que faz sentido para sua empresa
          </h2>
          <p className="mx-auto mt-3 max-w-2xl text-sm text-slate-400">
            Dados continuam onde estão. Com Edge, o banco nunca precisa ser exposto à
            internet.
          </p>
        </div>

        {/* Architecture diagram */}
        <div className="mx-auto mb-12 max-w-lg rounded-2xl border border-border bg-surface-card p-6 sm:p-8 card-glow">
          <div className="flex flex-wrap items-center justify-center gap-2 text-center">
            {["Cursor", "Claude", "ChatGPT"].map((a) => (
              <span
                key={a}
                className="rounded-lg border border-border bg-surface px-3 py-1.5 text-xs font-medium text-slate-300"
              >
                {a}
              </span>
            ))}
          </div>
          <p className="my-3 text-center font-mono text-lg text-slate-600">↓</p>
          <p className="rounded-xl border border-cyan/30 bg-cyan/5 py-3 text-center text-sm font-semibold text-cyan">
            Synapsee Cloud
          </p>
          <p className="my-2 text-center text-[11px] uppercase tracking-widest text-slate-500">
            HTTPS de saída · só o Edge inicia
          </p>
          <p className="my-3 text-center font-mono text-lg text-slate-600">↑</p>
          <p className="rounded-xl border border-border bg-surface py-3 text-center text-sm font-semibold text-white">
            Synapsee Edge
          </p>
          <p className="my-3 text-center font-mono text-lg text-slate-600">↑</p>
          <p className="rounded-xl border border-border bg-surface py-3 text-center text-sm font-medium text-slate-400">
            Sistema / banco da empresa
          </p>
        </div>

        <p className="mx-auto mb-10 max-w-3xl text-center text-lg font-semibold leading-snug text-white sm:text-xl">
          O Synapsee Cloud nunca entra na rede da empresa. O Synapsee Edge inicia toda a
          comunicação.
        </p>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[32rem] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="px-3 py-3 font-medium text-slate-500" />
                <th className="px-3 py-3 font-semibold text-white">Cloud</th>
                <th className="px-3 py-3 font-semibold text-cyan">Edge</th>
              </tr>
            </thead>
            <tbody className="text-slate-400">
              <tr className="border-b border-border/60">
                <td className="px-3 py-3 text-slate-500">Ideal para</td>
                <td className="px-3 py-3">Começar rápido</td>
                <td className="px-3 py-3 text-slate-200">Empresas e segurança</td>
              </tr>
              <tr className="border-b border-border/60">
                <td className="px-3 py-3 text-slate-500">Setup</td>
                <td className="px-3 py-3">Minutos</td>
                <td className="px-3 py-3 text-slate-200">Docker / Kubernetes</td>
              </tr>
              <tr className="border-b border-border/60">
                <td className="px-3 py-3 text-slate-500">Banco</td>
                <td className="px-3 py-3">Acessível pelo Cloud</td>
                <td className="px-3 py-3 text-slate-200">Nunca exposto</td>
              </tr>
              <tr>
                <td className="px-3 py-3 text-slate-500">Rede</td>
                <td className="px-3 py-3">Conexão direta</td>
                <td className="px-3 py-3 text-slate-200">Apenas conexões de saída</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
