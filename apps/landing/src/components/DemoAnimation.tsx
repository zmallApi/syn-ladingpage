import { useEffect, useState } from "react";

type Stage = "connect" | "schema" | "generate" | "chat";

const STAGE_MS: Record<Stage, number> = {
  connect: 3200,
  schema: 3200,
  generate: 3200,
  chat: 4500,
};

const STAGES: Stage[] = ["connect", "schema", "generate", "chat"];

const SCHEMA_TABLES = ["clientes", "vendas", "produtos", "contratos"];
const GENERATED = ["REST API", "OpenAPI", "MCP Server", "AI Tools"];

const FORM_FIELDS = [
  { label: "Host", value: "db.erp-prod.internal" },
  { label: "Porta", value: "5432" },
  { label: "Database", value: "erp_core" },
  { label: "Usuário", value: "readonly" },
  { label: "Senha", value: "••••••••" },
];

function ProgressBar({ progress }: { progress: number }) {
  return (
    <div className="mt-3 h-1 overflow-hidden rounded-full bg-surface">
      <div
        className="h-full rounded-full bg-gradient-to-r from-cyan to-purple transition-all duration-300 ease-out"
        style={{ width: `${progress}%` }}
      />
    </div>
  );
}

function CheckItem({ label, visible, delay = 0 }: { label: string; visible: boolean; delay?: number }) {
  return (
    <div
      className={`flex items-center gap-2 text-sm transition-all duration-500 ${
        visible ? "translate-x-0 opacity-100" : "-translate-x-2 opacity-0"
      }`}
      style={{ transitionDelay: `${delay}ms` }}
    >
      <span className={`flex h-4 w-4 items-center justify-center rounded-full text-[10px] ${visible ? "bg-green/20 text-green" : "bg-surface text-transparent"}`}>
        ✓
      </span>
      <span className="font-mono text-slate-300">{label}</span>
    </div>
  );
}

export function DemoAnimation() {
  const [stageIndex, setStageIndex] = useState(0);
  const [tick, setTick] = useState(0);
  const [schemaCount, setSchemaCount] = useState(0);
  const [genCount, setGenCount] = useState(0);
  const [chatPhase, setChatPhase] = useState(0);
  const [connectProgress, setConnectProgress] = useState(0);

  const stage = STAGES[stageIndex];

  useEffect(() => {
    const id = window.setInterval(() => {
      setStageIndex((i) => (i + 1) % STAGES.length);
      setTick((t) => t + 1);
    }, STAGE_MS[stage]);
    return () => window.clearInterval(id);
  }, [stage]);

  useEffect(() => {
    setSchemaCount(0);
    setGenCount(0);
    setChatPhase(0);
    setConnectProgress(0);

    if (stage === "connect") {
      const steps = [20, 40, 60, 80, 100];
      steps.forEach((p, i) => {
        window.setTimeout(() => setConnectProgress(p), 400 + i * 350);
      });
    }

    if (stage === "schema") {
      SCHEMA_TABLES.forEach((_, i) => {
        window.setTimeout(() => setSchemaCount(i + 1), 500 + i * 450);
      });
    }

    if (stage === "generate") {
      GENERATED.forEach((_, i) => {
        window.setTimeout(() => setGenCount(i + 1), 500 + i * 450);
      });
    }

    if (stage === "chat") {
      window.setTimeout(() => setChatPhase(1), 800);
      window.setTimeout(() => setChatPhase(2), 2200);
      window.setTimeout(() => setChatPhase(3), 3200);
    }
  }, [stage, tick]);

  return (
    <div className="relative mx-auto w-full max-w-md">
      <div className="absolute inset-0 rounded-2xl bg-cyan/5 blur-3xl glow-orb" />

      <div className="relative overflow-hidden rounded-2xl border border-border bg-surface-card card-glow">
        {/* Title bar */}
        <div className="flex items-center gap-2 border-b border-border px-4 py-2.5">
          <div className="flex gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-red-500/70" />
            <span className="h-2.5 w-2.5 rounded-full bg-amber/70" />
            <span className="h-2.5 w-2.5 rounded-full bg-green/70" />
          </div>
          <span className="ml-2 font-mono text-[11px] text-slate-500">Synapsee MCP — demo</span>
          <div className="ml-auto flex gap-1">
            {STAGES.map((s, i) => (
              <span
                key={s}
                className={`h-1 w-4 rounded-full transition-colors duration-300 ${
                  i === stageIndex ? "bg-cyan" : "bg-border"
                }`}
              />
            ))}
          </div>
        </div>

        <div className="relative min-h-[340px] p-4">
          {/* Stage: Connect */}
          <div
            className={`transition-all duration-500 ${
              stage === "connect" ? "opacity-100" : "pointer-events-none absolute opacity-0"
            }`}
          >
            <p className="mb-3 text-xs font-medium uppercase tracking-widest text-cyan">Conexão</p>
            <div className="space-y-2">
              {FORM_FIELDS.map((f, i) => (
                <div
                  key={f.label}
                  className={`flex items-center justify-between rounded-lg border border-border bg-surface px-3 py-2 font-mono text-xs transition-all duration-300 ${
                    connectProgress > i * 20 ? "opacity-100" : "opacity-40"
                  }`}
                >
                  <span className="text-slate-500">{f.label}</span>
                  <span className="text-slate-300">{f.value}</span>
                </div>
              ))}
            </div>
            <button
              type="button"
              className={`mt-4 w-full rounded-lg py-2.5 text-sm font-semibold transition-all duration-500 ${
                connectProgress >= 100
                  ? "cyan-gradient text-surface shadow-lg shadow-cyan/20"
                  : "border border-border bg-surface-raised text-slate-500"
              }`}
            >
              {connectProgress >= 100 ? "Conectado ✓" : "Conectar"}
            </button>
            <ProgressBar progress={connectProgress} />
          </div>

          {/* Stage: Schema */}
          <div
            className={`transition-all duration-500 ${
              stage === "schema" ? "opacity-100" : "pointer-events-none absolute opacity-0"
            }`}
          >
            <p className="mb-1 text-xs font-medium uppercase tracking-widest text-cyan">Analisando schema</p>
            <p className="mb-4 font-mono text-sm text-slate-400">
              Analisando schema
              <span className="demo-dots inline-block w-4" />
            </p>
            <div className="space-y-2">
              {SCHEMA_TABLES.map((t, i) => (
                <CheckItem key={t} label={t} visible={schemaCount > i} delay={i * 80} />
              ))}
            </div>
            <ProgressBar progress={(schemaCount / SCHEMA_TABLES.length) * 100} />
          </div>

          {/* Stage: Generate */}
          <div
            className={`transition-all duration-500 ${
              stage === "generate" ? "opacity-100" : "pointer-events-none absolute opacity-0"
            }`}
          >
            <p className="mb-1 text-xs font-medium uppercase tracking-widest text-purple">Gerando</p>
            <p className="mb-4 font-mono text-sm text-slate-400">
              Gerando
              <span className="demo-dots inline-block w-4" />
            </p>
            <div className="space-y-2">
              {GENERATED.map((item, i) => (
                <CheckItem key={item} label={item} visible={genCount > i} delay={i * 80} />
              ))}
            </div>
            <ProgressBar progress={(genCount / GENERATED.length) * 100} />
          </div>

          {/* Stage: Chat */}
          <div
            className={`transition-all duration-500 ${
              stage === "chat" ? "opacity-100" : "pointer-events-none absolute opacity-0"
            }`}
          >
            <div className="mb-3 flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-green/10 text-xs font-bold text-green">
                AI
              </div>
              <span className="text-sm font-medium text-white">ChatGPT</span>
              <span className="ml-auto rounded border border-green/30 bg-green/10 px-1.5 py-0.5 text-[10px] text-green">
                MCP conectado
              </span>
            </div>

            <div className="space-y-3">
              <div
                className={`ml-auto max-w-[90%] rounded-xl rounded-tr-sm border border-border bg-surface-raised px-3 py-2 text-sm text-slate-300 transition-all duration-500 ${
                  chatPhase >= 1 ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0"
                }`}
              >
                Quantos clientes compraram este mês?
              </div>

              <div
                className={`max-w-[95%] rounded-xl rounded-tl-sm border border-cyan/20 bg-cyan/5 px-3 py-3 transition-all duration-500 ${
                  chatPhase >= 2 ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0"
                }`}
              >
                <p className="text-sm font-semibold text-white">127 clientes</p>
                <p className="mt-1 text-sm text-cyan">R$ 89.400 faturados</p>
                <p className="mt-2 font-mono text-[10px] text-slate-500">
                  via tool: consultar_vendas_mes
                </p>
              </div>

              <div
                className={`flex justify-center transition-all duration-700 ${
                  chatPhase >= 3 ? "scale-100 opacity-100" : "scale-75 opacity-0"
                }`}
              >
                <span className="text-2xl text-cyan demo-sparkle">✦</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
