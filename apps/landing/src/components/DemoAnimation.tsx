import { useEffect, useState, type ReactNode } from "react";

type Stage = "connect" | "understand" | "specialize" | "teach";

const STAGE_MS: Record<Stage, number> = {
  connect: 5200,
  understand: 7200,
  specialize: 7500,
  teach: 7000,
};

const STAGES: Stage[] = ["connect", "understand", "specialize", "teach"];

const CAPABILITIES = [
  "Cobrar inadimplentes",
  "Descobrir clientes em risco",
  "Encontrar oportunidades de venda",
  "Entender histórico do cliente",
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
            : [900, 2800, 4800];
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
          {/* Connect */}
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
              Os dados continuam onde estão.
            </p>
            <p
              className={`mt-8 text-sm text-cyan transition duration-700 ${
                phase >= 3 ? "opacity-100" : "opacity-0"
              }`}
            >
              Pronto para entender.
            </p>
          </Stage>

          {/* Understand */}
          <Stage visible={stage === "understand"}>
            <Label>Entender</Label>
            <p
              className={`mt-4 text-lg font-medium text-white transition duration-700 ${
                phase >= 1 ? "opacity-100" : "opacity-0"
              }`}
            >
              Entendi como a empresa funciona.
            </p>
            <div
              className={`mt-6 space-y-2 text-sm transition duration-700 ${
                phase >= 2 ? "opacity-100" : "opacity-0"
              }`}
            >
              <p className="text-slate-500">clientes</p>
              <p className="text-cyan">→ quem compra, atrasa, cancela</p>
            </div>
            <p
              className={`mt-4 text-sm text-slate-400 transition duration-700 ${
                phase >= 3 ? "opacity-100" : "opacity-0"
              }`}
            >
              Não é renomear. É interpretar o negócio.
            </p>
            <p
              className={`mt-6 text-sm text-slate-300 transition duration-700 ${
                phase >= 4 ? "opacity-100" : "opacity-0"
              }`}
            >
              Conceitos e processos identificados.
            </p>
          </Stage>

          {/* Specialize */}
          <Stage visible={stage === "specialize"}>
            <Label>Especializar</Label>
            <p
              className={`mt-3 text-sm text-slate-400 transition duration-700 ${
                phase >= 1 ? "opacity-100" : "opacity-0"
              }`}
            >
              Seu sistema já sabe fazer isto:
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
              Deseja ensinar essas capacidades à IA?
            </p>
          </Stage>

          {/* Teach */}
          <Stage visible={stage === "teach"}>
            <Label>Ensinar à IA</Label>
            <p
              className={`mt-4 text-lg font-medium text-white transition duration-700 ${
                phase >= 1 ? "opacity-100" : "opacity-0"
              }`}
            >
              Capacidades aprovadas.
            </p>
            <div
              className={`mt-6 rounded-2xl border border-border/80 bg-surface px-4 py-3 transition duration-700 ${
                phase >= 2 ? "opacity-100" : "opacity-0"
              }`}
            >
              <p className="text-sm text-slate-400">Quem está em risco de cancelar?</p>
              <p className="mt-2 text-sm font-medium text-white">12 clientes em risco</p>
              <p className="mt-1 text-xs text-slate-500">Especialista em Reter Clientes</p>
            </div>
            <p
              className={`mt-6 text-sm text-slate-400 transition duration-700 ${
                phase >= 3 ? "opacity-100" : "opacity-0"
              }`}
            >
              A IA trabalha com o conhecimento da empresa.
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
