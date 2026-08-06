export function EdgeSecurity() {
  return (
    <section id="edge" className="border-t border-border/60 py-16 sm:py-24">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="mb-12 text-center">
          <p className="text-xs font-medium uppercase tracking-widest text-cyan">
            Conexão
          </p>
          <h2 className="mt-2 text-3xl font-bold text-white sm:text-4xl">
            Seus dados não precisam sair do lugar
          </h2>
          <p className="mx-auto mt-3 max-w-2xl text-sm text-slate-400">
            Comece em minutos na nuvem, ou mantenha as fontes na sua rede. Em ambos os
            casos, o Synapsee prepara contexto — sem abrir o que não deve.
          </p>
        </div>

        <div className="mx-auto mb-10 max-w-lg rounded-2xl border border-border bg-surface-card p-6 sm:p-8 card-glow">
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
            Synapsee
          </p>
          <p className="my-2 text-center text-[11px] uppercase tracking-widest text-slate-500">
            Com Edge: só a sua rede inicia a conversa
          </p>
          <p className="my-3 text-center font-mono text-lg text-slate-600">↑</p>
          <p className="rounded-xl border border-border bg-surface py-3 text-center text-sm font-medium text-slate-400">
            Sistemas da empresa
          </p>
        </div>

        <p className="mx-auto mb-10 max-w-2xl text-center text-base font-semibold leading-snug text-white sm:text-lg">
          O Cloud nunca precisa entrar na sua rede. Quando usa Edge, toda comunicação
          começa do seu lado.
        </p>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[32rem] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="px-3 py-3 font-medium text-slate-500" />
                <th className="px-3 py-3 font-semibold text-white">Para começar</th>
                <th className="px-3 py-3 font-semibold text-cyan">Para empresas</th>
              </tr>
            </thead>
            <tbody className="text-slate-400">
              <tr className="border-b border-border/60">
                <td className="px-3 py-3 text-slate-500">Ideal para</td>
                <td className="px-3 py-3">Validar rápido</td>
                <td className="px-3 py-3 text-slate-200">Segurança e conformidade</td>
              </tr>
              <tr className="border-b border-border/60">
                <td className="px-3 py-3 text-slate-500">Setup</td>
                <td className="px-3 py-3">Minutos</td>
                <td className="px-3 py-3 text-slate-200">Na sua infraestrutura</td>
              </tr>
              <tr className="border-b border-border/60">
                <td className="px-3 py-3 text-slate-500">Dados</td>
                <td className="px-3 py-3">Fonte acessível</td>
                <td className="px-3 py-3 text-slate-200">Permanecem no cliente</td>
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
