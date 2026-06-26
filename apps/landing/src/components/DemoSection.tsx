import { DemoAnimation } from "./DemoAnimation";

export function DemoSection() {
  return (
    <section id="demo" className="border-t border-border/60 py-16 sm:py-24">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="mb-10 text-center">
          <p className="text-xs font-medium uppercase tracking-widest text-cyan">Demo</p>
          <h2 className="mt-2 text-3xl font-bold text-white sm:text-4xl">
            Do banco ao agente em segundos
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-sm text-slate-400 sm:text-base">
            Conecte, analise o schema, gere API + MCP e consulte dados de negócio pelo ChatGPT —
            sem escrever código.
          </p>
        </div>

        <div className="mx-auto max-w-lg">
          <DemoAnimation />
        </div>

        <p className="mt-6 text-center font-mono text-[11px] text-slate-600">
          Animação em loop · ideal para gravar GIF ou vídeo de divulgação
        </p>
      </div>
    </section>
  );
}
