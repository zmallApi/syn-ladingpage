import { useEffect, useState, type ReactNode } from "react";

type Stage = "connect" | "understand" | "specialize" | "publish";

const STAGE_MS: Record<Stage, number> = {
  connect: 5200,
  understand: 7200,
  specialize: 7500,
  publish: 7500,
};

const STAGES: Stage[] = ["connect", "understand", "specialize", "publish"];

const CAPABILITIES = [
  "Encontrar inadimplentes",
  "Calcular dias de atraso",
  "Priorizar cobranças",
  "Quem pode cancelar",
];

export function DemoAnimation() {
  const [stageIndex, setStageIndex] = useState(0);
  const [tick, setTick] = useState(0);
  const [phase, setPhase] = useState(0);

  const stage = STAGES[stageIndex];

  useEffect(() => {
    const id = window.setInterval(() => {
      setStageIndex((i) => (i + 1) % STAGES.length);
      setTick((t) => t + 1);
    }, STAGE_MS[stage]);
    return () => window.clearInterval(id);
  }, [stage]);

  useEffect(() => {
    setPhase(0);
    const delays =
      stage === "connect"
        ? [800, 2200, 4000]
        : stage === "understand"
          ? [700, 2200, 4000, 5800]
          : stage === "specialize"
            ? [700, 1800, 3000, 4200, 5600]
            : [900, 2200, 3800, 5200];
    delays.forEach((ms, i) => {
      window.setTimeout(() => setPhase(i + 1), ms);
    });
  }, [stage, tick]);

  return (
    <div className="relative mx-auto w-full max-w-md overflow-hidden">
      <div className="absolute inset-0 rounded-3xl bg-cyan/5 blur-3xl" />
      <div className="relative overflow-hidden rounded-3xl border border-border/80 bg-surface-card/90">
        <div className="flex items-center justify-between border-b border-border/60 px-5 py-3">
          <span className="text-[11px] tracking-wide text-slate-500">Synapsee</span>
          <div className="flex gap-1.5">
            {STAGES.map((s, i) => (
              <span
                key={s}
                className={`h-1 w-5 rounded-full transition-colors ${
                  i === stageIndex ? "bg-cyan" : "bg-border"
                }`}
              />
            ))}
          </div>
        </div>

        <div className="relative min-h-[340px] p-5">
          <Stage visible={stage === "connect"}>
            <Label>Conectar</Label>
            <p
              className={`mt-4 text-lg font-medium text-white transition duration-700 ${
                phase >= 1 ? "opacity-100" : "opacity-0"
              }`}
            >
              Sistema empresarial conectado.
            </p>
            <p
              className={`mt-2 text-sm text-slate-500 transition duration-700 ${
                phase >= 2 ? "opacity-100" : "opacity-0"
              }`}
            >
              Cloud ou Edge — dados continuam onde estão.
            </p>
            <p
              className={`mt-8 text-sm text-cyan transition duration-700 ${
                phase >= 3 ? "opacity-100" : "opacity-0"
              }`}
            >
              Pronto para entender o negócio.
            </p>
          </Stage>

          <Stage visible={stage === "understand"}>
            <Label>Entender</Label>
            <p
              className={`mt-4 text-lg font-medium text-white transition duration-700 ${
                phase >= 1 ? "opacity-100" : "opacity-0"
              }`}
            >
              Conhecimento da empresa interpretado.
            </p>
            <div
              className={`mt-6 space-y-2 text-sm transition duration-700 ${
                phase >= 2 ? "opacity-100" : "opacity-0"
              }`}
            >
              <p className="text-slate-500">Empresa → conhecimento</p>
              <p className="text-cyan">→ papéis, processos, relações</p>
            </div>
            <p
              className={`mt-4 text-sm text-slate-400 transition duration-700 ${
                phase >= 3 ? "opacity-100" : "opacity-0"
              }`}
            >
              Não é renomear tabelas. É liberar o que a empresa já sabe.
            </p>
            <p
              className={`mt-6 text-sm text-slate-300 transition duration-700 ${
                phase >= 4 ? "opacity-100" : "opacity-0"
              }`}
            >
              Camada semântica: clientes, cobranças, vendas — não só tabelas.
            </p>
          </Stage>

          <Stage visible={stage === "specialize"}>
            <Label>Especializar</Label>
            <p
              className={`mt-3 text-sm text-slate-400 transition duration-700 ${
                phase >= 1 ? "opacity-100" : "opacity-0"
              }`}
            >
              Capacidades concretas sugeridas:
            </p>
            <ul className="mt-4 space-y-2.5">
              {CAPABILITIES.map((c, i) => (
                <li
                  key={c}
                  className={`flex items-center gap-2 text-sm text-slate-200 transition duration-700 ${
                    phase > i + 1 ? "opacity-100 translate-x-0" : "opacity-0 -translate-x-1"
                  }`}
                >
                  <span className="text-cyan">✓</span>
                  {c}
                </li>
              ))}
            </ul>
            <p
              className={`mt-6 text-sm font-medium text-white transition duration-700 ${
                phase >= 5 ? "opacity-100" : "opacity-0"
              }`}
            >
              Publicar para os agentes?
            </p>
          </Stage>

          <Stage visible={stage === "publish"}>
            <Label>Publicar → Usar</Label>
            <p
              className={`mt-4 text-lg font-medium text-white transition duration-700 ${
                phase >= 1 ? "opacity-100" : "opacity-0"
              }`}
            >
              Capacidades publicadas no MCP.
            </p>
            <ul
              className={`mt-4 space-y-2 text-sm transition duration-700 ${
                phase >= 2 ? "opacity-100" : "opacity-0"
              }`}
            >
              <li className="font-mono text-cyan">cap_list_at_risk</li>
              <li className="font-mono text-cyan">cap_party_360</li>
              <li className="font-mono text-cyan">cap_overdue_ledger</li>
            </ul>
            <p
              className={`mt-6 text-sm text-slate-400 transition duration-700 ${
                phase >= 3 ? "opacity-100" : "opacity-0"
              }`}
            >
              Cursor, Claude e ChatGPT passam a usar o conhecimento da empresa.
            </p>
            <p
              className={`mt-4 text-sm font-medium text-white transition duration-700 ${
                phase >= 4 ? "opacity-100" : "opacity-0"
              }`}
            >
              Você aprovou. A IA executa.
            </p>
          </Stage>
        </div>
      </div>
    </div>
  );
}

function Label({ children }: { children: string }) {
  return (
    <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-slate-500">
      {children}
    </p>
  );
}

function Stage({ visible, children }: { visible: boolean; children: ReactNode }) {
  return (
    <div
      className={`transition-opacity duration-1000 ${
        visible ? "opacity-100" : "pointer-events-none absolute inset-5 opacity-0"
      }`}
    >
      {children}
    </div>
  );
}
