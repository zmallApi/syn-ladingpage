import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api } from "../lib/api";
import type {
  ConnectionMode,
  CreateProjectInput,
  DatabaseEngine,
  Project,
  SchemaSnapshot,
} from "../lib/types";
import { ENGINE_OPTIONS } from "../lib/types";
import { ConnectionForm, emptyConnectionForm } from "../components/ConnectionForm";
import { StageRail } from "../components/StageRail";
import { ProgressBar } from "../components/ProgressBar";
import { ResourceChecklist } from "../components/ResourceChecklist";
import { ApiPlayground } from "../components/ApiPlayground";
import { StatusBadge } from "../components/StatusBadge";
import { EdgeInstallPanel } from "../components/EdgeInstallPanel";

type ConnectPhase = "idle" | "connecting" | "connected" | "analyzing" | "edge-wait";

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function connectingDelayMs() {
  return 1000 + Math.floor(Math.random() * 2000);
}

export function WizardPage() {
  const { id: existingId } = useParams();
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [mode, setMode] = useState<ConnectionMode | null>(null);
  const [form, setForm] = useState<CreateProjectInput>(emptyConnectionForm());
  const [edgeName, setEdgeName] = useState("");
  const [edgeEngine, setEdgeEngine] = useState<DatabaseEngine>("postgresql");
  const [project, setProject] = useState<Project | null>(null);
  const [schema, setSchema] = useState<SchemaSnapshot | null>(null);
  const [revealed, setRevealed] = useState(0);
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [genDone, setGenDone] = useState(false);
  const [connectPhase, setConnectPhase] = useState<ConnectPhase>("idle");
  const [connectProgress, setConnectProgress] = useState(0);
  const [edgeToken, setEdgeToken] = useState<string | null>(null);
  const [dockerRun, setDockerRun] = useState("");
  const [dockerCompose, setDockerCompose] = useState("");
  const [generatingToken, setGeneratingToken] = useState(false);

  useEffect(() => {
    if (!existingId) return;
    (async () => {
      try {
        const p = await api.getProject(existingId);
        if (!p) {
          navigate("/projects");
          return;
        }
        setProject(p);
        setMode(p.connectionMode ?? "cloud");
        setSelected(p.exposedResources);
        if (p.connectionMode === "edge") {
          setConnectPhase(p.edgeStatus === "online" ? "connected" : "edge-wait");
          setConnectProgress(p.edgeStatus === "online" ? 100 : 40);
          try {
            const install = await api.getEdgeInstall(p.id);
            setDockerRun(install.dockerRunTemplate);
            setDockerCompose(install.dockerComposeTemplate);
          } catch {
            /* ignore */
          }
          if (p.exposedResources.length) setStep(4);
          else if (p.edgeStatus === "online") setStep(1);
          else setStep(1);
        } else if (p.exposedResources.length) {
          setStep(4);
        } else {
          setStep(1);
          setConnectPhase("connected");
          setConnectProgress(100);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Sistema não encontrado");
        navigate("/projects");
      }
    })();
  }, [existingId, navigate]);

  // Poll Edge online status
  useEffect(() => {
    if (!project || project.connectionMode !== "edge") return;
    if (project.edgeStatus === "online" && connectPhase === "connected") return;

    const t = window.setInterval(async () => {
      try {
        const p = await api.getProject(project.id);
        if (!p) return;
        setProject(p);
        if (p.edgeStatus === "online") {
          setConnectPhase("connected");
          setConnectProgress(100);
        }
      } catch {
        /* ignore */
      }
    }, 4000);
    return () => clearInterval(t);
  }, [project?.id, project?.connectionMode, project?.edgeStatus, connectPhase]);

  async function runIntrospect(projectId: string) {
    setBusy(true);
    setConnectPhase("analyzing");
    setError(null);
    setRevealed(0);
    setSchema(null);
    setStep(2);
    try {
      const snap = await api.getSchema(projectId);
      setSchema(snap);
      for (let i = 0; i < snap.resources.length; i++) {
        await sleep(280);
        setRevealed(i + 1);
      }
      setConnectPhase("idle");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha na introspecção");
      setStep(1);
      setConnectPhase(
        project?.connectionMode === "edge" && project.edgeStatus !== "online"
          ? "edge-wait"
          : "connected",
      );
    } finally {
      setBusy(false);
    }
  }

  async function goToSchema() {
    if (!project) return;
    await runIntrospect(project.id);
  }

  async function connectCloud() {
    if (!form.name.trim() || !form.host.trim() || !form.database.trim() || !form.username.trim()) {
      setError("Preencha nome, host, database e usuário");
      return;
    }
    setBusy(true);
    setError(null);
    setConnectPhase("connecting");
    setConnectProgress(8);

    const delayMs = connectingDelayMs();
    const started = Date.now();
    const tick = window.setInterval(() => {
      const elapsed = Date.now() - started;
      const pct = Math.min(92, 8 + (elapsed / delayMs) * 84);
      setConnectProgress(pct);
    }, 80);

    try {
      const [p] = await Promise.all([api.createProject(form), sleep(delayMs)]);
      clearInterval(tick);
      setConnectProgress(100);
      setProject(p);
      setConnectPhase("connected");
      setBusy(false);
    } catch (err) {
      clearInterval(tick);
      setError(err instanceof Error ? err.message : "Falha ao conectar");
      setBusy(false);
      setConnectPhase("idle");
      setConnectProgress(0);
    }
  }

  async function createEdge() {
    if (!edgeName.trim()) {
      setError("Informe o nome do sistema");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = await api.createEdgeProject({
        name: edgeName.trim(),
        engine: edgeEngine,
      });
      setProject(result.project);
      setEdgeToken(result.edgeToken.token);
      setDockerRun(result.install.dockerRun);
      setDockerCompose(result.install.dockerCompose);
      setConnectPhase("edge-wait");
      setConnectProgress(40);
      navigate(`/projects/${result.project.id}/wizard`, { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao criar projeto Edge");
    } finally {
      setBusy(false);
    }
  }

  async function regenerateToken() {
    if (!project) return;
    setGeneratingToken(true);
    setError(null);
    try {
      const tok = await api.createEdgeToken(project.id);
      setEdgeToken(tok.token);
      if (tok.install) {
        setDockerRun(tok.install.dockerRun);
        setDockerCompose(tok.install.dockerCompose);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao gerar token");
    } finally {
      setGeneratingToken(false);
    }
  }

  function toggleResource(name: string) {
    setSelected((prev) =>
      prev.includes(name) ? prev.filter((x) => x !== name) : [...prev, name],
    );
  }

  async function generate() {
    if (!project || selected.length === 0) {
      setError("Selecione ao menos um recurso");
      return;
    }
    setBusy(true);
    setError(null);
    setStep(3);
    setGenDone(false);
    try {
      const updated = await api.expose(project.id, selected);
      setProject(updated);
      setGenDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao expor");
    } finally {
      setBusy(false);
    }
  }

  function goToPlayground() {
    setStep(4);
  }

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-widest text-cyan">Wizard</p>
          <h1 className="mt-1 truncate text-xl font-bold text-white sm:text-2xl">
            {project ? project.name : "Conectar banco"}
          </h1>
        </div>
        <Link to="/projects" className="shrink-0 text-sm text-slate-400 hover:text-cyan">
          ← Seus Sistemas
        </Link>
      </div>

      <StageRail current={step} />

      <div className="mt-6 rounded-2xl border border-border bg-surface-card p-3 card-glow sm:p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2 border-b border-border pb-3">
          <span className="font-mono text-[11px] text-slate-500">Synapsee IA — wizard</span>
          {busy && (
            <span className="text-xs text-cyan">
              {connectPhase === "connecting"
                ? "Conectando"
                : connectPhase === "analyzing"
                  ? "Analisando"
                  : "Processando"}
              <span className="demo-dots inline-block w-4" />
            </span>
          )}
        </div>

        {error && (
          <p className="mb-4 rounded-lg border border-red-500/20 bg-red-500/5 px-3 py-2 text-xs text-red-400">
            {error}
          </p>
        )}

        {step === 1 && !mode && !project && (
          <div>
            <p className="mb-1 text-xs font-medium uppercase tracking-widest text-cyan">
              01 — Como conectar
            </p>
            <p className="mb-4 text-sm text-slate-400">
              Escolha se o Cloud diala o banco ou se um Edge no ambiente do cliente
              inicia só conexões de saída.
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => setMode("cloud")}
                className="rounded-xl border border-border bg-surface p-4 text-left hover:border-cyan/40"
              >
                <p className="text-sm font-semibold text-white">Cloud</p>
                <p className="mt-1 text-xs text-slate-500">
                  Host, usuário e senha no wizard. Ideal para POC e redes abertas.
                </p>
              </button>
              <button
                type="button"
                onClick={() => setMode("edge")}
                className="rounded-xl border border-border bg-surface p-4 text-left hover:border-cyan/40"
              >
                <p className="text-sm font-semibold text-white">Edge</p>
                <p className="mt-1 text-xs text-slate-500">
                  Token + Docker no ambiente do cliente. Sem abrir portas para o Cloud.
                </p>
              </button>
            </div>
          </div>
        )}

        {step === 1 && mode === "cloud" && connectPhase === "connecting" && (
          <div className="py-8 text-center">
            <p className="mb-1 text-xs font-medium uppercase tracking-widest text-cyan">01 — Conexão</p>
            <div className="mt-4 flex justify-center">
              <StatusBadge status="connecting" />
            </div>
            <p className="mt-4 font-mono text-sm text-slate-300">
              Conectando
              <span className="demo-dots inline-block w-4" />
            </p>
            <p className="mt-2 break-all text-xs text-slate-500">
              Testando acesso a{" "}
              <span className="font-mono text-slate-400">
                {form.host}:{form.port}/{form.database}
              </span>
            </p>
            <div className="mx-auto mt-6 max-w-sm">
              <ProgressBar progress={connectProgress} />
            </div>
          </div>
        )}

        {step === 1 &&
          mode === "cloud" &&
          connectPhase === "connected" &&
          project &&
          project.connectionMode !== "edge" && (
            <div className="py-8 text-center">
              <p className="mb-1 text-xs font-medium uppercase tracking-widest text-cyan">
                01 — Conexão
              </p>
              <div className="mt-4 flex justify-center">
                <StatusBadge status="connected" />
              </div>
              <p className="mt-4 font-mono text-sm text-slate-300">Conexão estabelecida</p>
              <p className="mt-2 break-all text-xs text-slate-500">
                {project.engine} · {project.host}:{project.port}/{project.database}
              </p>
              <div className="mx-auto mt-6 max-w-sm">
                <ProgressBar progress={100} />
              </div>
              <button
                type="button"
                disabled={busy}
                onClick={goToSchema}
                className="mx-auto mt-6 w-full max-w-sm rounded-xl cyan-gradient px-4 py-2.5 text-sm font-semibold text-surface disabled:opacity-50"
              >
                Próxima etapa — Analisar schema
              </button>
            </div>
          )}

        {step === 1 && mode === "cloud" && connectPhase === "idle" && !project && (
          <div>
            <button
              type="button"
              onClick={() => setMode(null)}
              className="mb-3 text-xs text-slate-500 hover:text-cyan"
            >
              ← Trocar modo
            </button>
            <p className="mb-1 text-xs font-medium uppercase tracking-widest text-cyan">
              01 — Conexão Cloud
            </p>
            <p className="mb-4 text-sm text-slate-400">
              Credenciais ficam criptografadas no Cloud. Dados do cliente nunca são
              importados.
            </p>
            <ConnectionForm value={form} onChange={setForm} disabled={busy} />
            <button
              type="button"
              disabled={busy}
              onClick={connectCloud}
              className="mt-5 w-full rounded-xl cyan-gradient py-2.5 text-sm font-semibold text-surface disabled:opacity-50"
            >
              Conectar
            </button>
            <ProgressBar progress={0} />
          </div>
        )}

        {step === 1 && mode === "edge" && !project && (
          <div>
            <button
              type="button"
              onClick={() => setMode(null)}
              className="mb-3 text-xs text-slate-500 hover:text-cyan"
            >
              ← Trocar modo
            </button>
            <p className="mb-1 text-xs font-medium uppercase tracking-widest text-cyan">
              01 — Projeto Edge
            </p>
            <p className="mb-4 text-sm text-slate-400">
              Sem host/senha no Cloud. Depois geramos o token e o comando Docker.
            </p>
            <label className="mb-3 block">
              <span className="mb-1 block text-xs text-slate-500">Nome do sistema</span>
              <input
                className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-white"
                value={edgeName}
                disabled={busy}
                onChange={(e) => setEdgeName(e.target.value)}
                placeholder="ERP Produção"
              />
            </label>
            <label className="mb-4 block">
              <span className="mb-1 block text-xs text-slate-500">Engine (no Edge)</span>
              <select
                className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-white"
                value={edgeEngine}
                disabled={busy}
                onChange={(e) => setEdgeEngine(e.target.value as DatabaseEngine)}
              >
                {ENGINE_OPTIONS.map((e) => (
                  <option key={e.engine} value={e.engine}>
                    {e.label}
                    {e.status === "planned" ? " (em breve)" : ""}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              disabled={busy}
              onClick={createEdge}
              className="w-full rounded-xl cyan-gradient py-2.5 text-sm font-semibold text-surface disabled:opacity-50"
            >
              Criar projeto Edge
            </button>
          </div>
        )}

        {step === 1 &&
          project?.connectionMode === "edge" &&
          (connectPhase === "edge-wait" ||
            connectPhase === "connected" ||
            connectPhase === "idle") && (
            <div>
              <p className="mb-1 text-xs font-medium uppercase tracking-widest text-cyan">
                01 — Instalar Edge
              </p>
              <p className="mb-4 text-sm text-slate-400">
                Rode o agente na rede do cliente. Quando estiver online, continue para o
                schema.
              </p>
              <EdgeInstallPanel
                dockerRun={dockerRun}
                dockerCompose={dockerCompose}
                edgeStatus={project.edgeStatus}
                edgeLastSeen={project.edgeLastSeen}
                edgeVersion={project.edgeVersion}
                edgeResourceCount={project.edgeResourceCount}
                online={project.edgeStatus === "online"}
                tokenPlaintext={edgeToken}
                onGenerateToken={regenerateToken}
                generating={generatingToken}
              />
              <div className="mx-auto mt-6 max-w-sm">
                <ProgressBar
                  progress={project.edgeStatus === "online" ? 100 : connectProgress}
                />
              </div>
              <button
                type="button"
                disabled={busy || project.edgeStatus !== "online"}
                onClick={goToSchema}
                className="mt-5 w-full rounded-xl cyan-gradient py-2.5 text-sm font-semibold text-surface disabled:opacity-50"
              >
                {project.edgeStatus === "online"
                  ? "Próxima etapa — Analisar schema"
                  : "Aguardando Edge online…"}
              </button>
            </div>
          )}

        {step === 2 && (
          <div>
            <div className="mb-4 flex items-center justify-between">
              <div>
                <p className="text-xs font-medium uppercase tracking-widest text-cyan">02 — Schema</p>
                <p className="mt-1 font-mono text-sm text-slate-400">
                  {schema && revealed >= schema.resources.length
                    ? "Schema pronto"
                    : "Analisando schema"}
                  {(!schema || revealed < schema.resources.length) && (
                    <span className="demo-dots inline-block w-4" />
                  )}
                </p>
              </div>
              <StatusBadge
                status={
                  schema && revealed >= schema.resources.length ? "ok" : "active"
                }
              />
            </div>
            {schema ? (
              <>
                <ResourceChecklist
                  resources={schema.resources}
                  revealedCount={revealed}
                  selectable={revealed >= schema.resources.length}
                  selected={selected}
                  onToggle={toggleResource}
                />
                <ProgressBar
                  progress={(revealed / Math.max(schema.resources.length, 1)) * 100}
                />
                {revealed >= schema.resources.length && (
                  <button
                    type="button"
                    disabled={busy || selected.length === 0}
                    onClick={generate}
                    className="mt-5 w-full rounded-xl cyan-gradient py-2.5 text-sm font-semibold text-surface disabled:opacity-50"
                  >
                    Expor e gerar API ({selected.length})
                  </button>
                )}
              </>
            ) : (
              <div className="py-8 text-center">
                <p className="text-xs text-slate-500">
                  {project?.connectionMode === "edge"
                    ? "Job Edge: introspect (metadados only)"
                    : "Lendo metadados do banco (sem importar dados)"}
                </p>
                <div className="mx-auto mt-4 max-w-sm">
                  <ProgressBar progress={connectPhase === "analyzing" ? 45 : 20} />
                </div>
              </div>
            )}
          </div>
        )}

        {step === 3 && (
          <div>
            <p className="mb-1 text-xs font-medium uppercase tracking-widest text-purple">
              03 — Gerando
            </p>
            <p className="mb-4 font-mono text-sm text-slate-400">
              Gerando
              {!genDone && <span className="demo-dots inline-block w-4" />}
            </p>
            <div className="space-y-2">
              {["REST API", "OpenAPI", "MCP Server", "MCP Tools"].map((item, i) => {
                const visible = genDone || busy;
                return (
                  <div
                    key={item}
                    className={`flex items-center gap-2 text-sm transition ${
                      visible ? "opacity-100" : "opacity-40"
                    }`}
                    style={{ transitionDelay: `${i * 80}ms` }}
                  >
                    <span className="flex h-4 w-4 items-center justify-center rounded-full bg-green/20 text-[10px] text-green">
                      {genDone ? "✓" : i < 2 ? "✓" : "…"}
                    </span>
                    <span className="font-mono text-slate-300">{item}</span>
                  </div>
                );
              })}
            </div>
            <ProgressBar progress={genDone ? 100 : 55} />
            {genDone && project && (
              <div className="mt-4 rounded-xl border border-border bg-surface p-3 text-left">
                <p className="text-[11px] uppercase tracking-widest text-slate-500">
                  Endpoint MCP
                </p>
                <code className="mt-1 block break-all font-mono text-xs text-cyan">
                  {api.mcpUrl(project.id)}
                </code>
              </div>
            )}
            {genDone && (
              <button
                type="button"
                onClick={goToPlayground}
                className="mt-6 w-full rounded-xl cyan-gradient py-2.5 text-sm font-semibold text-surface"
              >
                Próxima etapa — Testar API
              </button>
            )}
          </div>
        )}

        {step === 4 && project && (
          <div>
            <p className="mb-1 text-xs font-medium uppercase tracking-widest text-cyan">
              04 — Testar
            </p>
            <p className="mb-4 text-sm text-slate-400">
              Consulte a API gerada
              {project.connectionMode === "edge" ? " (via jobs Edge)" : ""}. Base:{" "}
              <code className="break-all text-cyan">/p/{project.id}/</code>
            </p>
            <ApiPlayground projectId={project.id} resources={project.exposedResources} />
            <Link
              to={`/projects/${project.id}`}
              className="mt-6 inline-block text-sm text-cyan hover:underline"
            >
              Ir para detalhe do sistema →
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
