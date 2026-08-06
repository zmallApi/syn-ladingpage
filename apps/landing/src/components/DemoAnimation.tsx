import { useEffect, useState, type ReactNode } from "react";

type Stage = "problem" | "layer" | "mission" | "execute";

const STAGE_MS: Record<Stage, number> = {
  problem: 5500,
  layer: 6500,
  mission: 7000,
  execute: 7500,
};

const STAGES: Stage[] = ["problem", "layer", "mission", "execute"];

const ASKS = [
  "Quero cobrar inadimplentes",
  "Quero implementar esta Story",
  "Quero entender este incidente",
  "Quero descobrir quem pode cancelar",
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
      stage === "problem"
        ? [700, 2000, 3800]
        : stage === "layer"
          ? [700, 2200, 4000, 5500]
          : stage === "mission"
            ? [600, 1600, 2800, 4000, 5400]
            : [800, 2000, 3600, 5200];
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
          <Stage visible={stage === "problem"}>
            <Label>O problema</Label>
            <p
              className={`mt-4 text-lg font-medium text-white transition duration-700 ${
                phase >= 1 ? "opacity-100" : "opacity-0"
              }`}
            >
              Sua empresa já sabe como funciona.
            </p>
            <p
              className={`mt-3 text-sm text-slate-400 transition duration-700 ${
                phase >= 2 ? "opacity-100" : "opacity-0"
              }`}
            >
              Esse conhecimento está preso em sistemas.
            </p>
            <p
              className={`mt-8 text-sm text-cyan transition duration-700 ${
                phase >= 3 ? "opacity-100" : "opacity-0"
              }`}
            >
              O agente não conhece nada disso.
            </p>
          </Stage>

          <Stage visible={stage === "layer"}>
            <Label>A camada</Label>
            <p
              className={`mt-4 text-lg font-medium text-white transition duration-700 ${
                phase >= 1 ? "opacity-100" : "opacity-0"
              }`}
            >
              O Synapsee fica entre os dois.
            </p>
            <div
              className={`mt-6 space-y-2 text-sm transition duration-700 ${
                phase >= 2 ? "opacity-100" : "opacity-0"
              }`}
            >
              <p className="text-slate-500">Sistemas da empresa</p>
              <p className="text-cyan">→ contexto executável</p>
              <p className="text-slate-500">→ agente de IA</p>
            </div>
            <p
              className={`mt-6 text-sm text-slate-300 transition duration-700 ${
                phase >= 3 ? "opacity-100" : "opacity-0"
              }`}
            >
              Context Operating System.
            </p>
            <p
              className={`mt-3 text-sm text-slate-500 transition duration-700 ${
                phase >= 4 ? "opacity-100" : "opacity-0"
              }`}
            >
              Modelos são motor. O conhecimento fica aqui.
            </p>
          </Stage>

          <Stage visible={stage === "mission"}>
            <Label>Missão</Label>
            <p
              className={`mt-3 text-sm text-slate-400 transition duration-700 ${
                phase >= 1 ? "opacity-100" : "opacity-0"
              }`}
            >
              Você começa pelo objetivo:
            </p>
            <ul className="mt-4 space-y-2.5">
              {ASKS.map((c, i) => (
                <li
                  key={c}
                  className={`flex items-center gap-2 text-sm text-slate-200 transition duration-700 ${
                    phase > i + 1
                      ? "opacity-100 translate-x-0"
                      : "opacity-0 -translate-x-1"
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
              O Synapsee prepara o trabalho.
            </p>
          </Stage>

          <Stage visible={stage === "execute"}>
            <Label>Execução</Label>
            <p
              className={`mt-4 text-lg font-medium text-white transition duration-700 ${
                phase >= 1 ? "opacity-100" : "opacity-0"
              }`}
            >
              Quero implementar esta Story.
            </p>
            <p
              className={`mt-4 text-sm text-slate-400 transition duration-700 ${
                phase >= 2 ? "opacity-100" : "opacity-0"
              }`}
            >
              Contexto preparado — entregue ao agente.
            </p>
            <p
              className={`mt-6 text-sm text-cyan transition duration-700 ${
                phase >= 3 ? "opacity-100" : "opacity-0"
              }`}
            >
              Cursor executa. O Synapsee já preparou.
            </p>
            <p
              className={`mt-4 text-sm font-medium text-white transition duration-700 ${
                phase >= 4 ? "opacity-100" : "opacity-0"
              }`}
            >
              O agente não precisou conhecer a sua empresa.
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
