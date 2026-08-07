import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api } from "../lib/api";
import type { McpManifest, Project, SchemaSnapshot } from "../lib/types";
import { StatusBadge } from "../components/StatusBadge";
import { ApiPlayground } from "../components/ApiPlayground";
import { CapabilitiesPanel } from "../components/CapabilitiesPanel";
import { McpConnectPanel } from "../components/McpConnectPanel";
import { McpDevKeysPanel } from "../components/McpDevKeysPanel";
import { EdgeInstallPanel } from "../components/EdgeInstallPanel";
import { EngineeringKnowledgePanel } from "../components/EngineeringKnowledgePanel";
import { LlmConfigPanel } from "../components/LlmConfigPanel";
import { MissionPanel } from "../components/MissionPanel";

type EngTab = "missions" | "agent" | "sources" | "settings" | "edge";
type BizTab =
  | "missions"
  | "capabilities"
  | "agent"
  | "data"
  | "settings"
  | "edge";

function ProjectTabs<T extends string>({
  tabs,
  active,
  onChange,
}: {
  tabs: Array<{ id: T; label: string; hint?: string }>;
  active: T;
  onChange: (id: T) => void;
}) {
  return (
    <div className="mb-6 border-b border-border">
      <nav
        className="-mb-px flex gap-1 overflow-x-auto pb-px"
        aria-label="Seções do projeto"
      >
        {tabs.map((t) => {
          const isActive = active === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => onChange(t.id)}
              className={`relative flex shrink-0 flex-col items-start rounded-t-lg px-3 py-2.5 text-left transition sm:px-4 ${
                isActive ? "text-cyan" : "text-slate-500 hover:text-slate-300"
              }`}
            >
              <span className="text-sm font-medium leading-none">{t.label}</span>
              {t.hint && (
                <span
                  className={`mt-1 text-[10px] font-normal leading-none ${
                    isActive ? "text-cyan/55" : "text-slate-600"
                  }`}
                >
                  {t.hint}
                </span>
              )}
              {isActive && (
                <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-cyan" />
              )}
            </button>
          );
        })}
      </nav>
    </div>
  );
}

function projectBadgeStatus(
  p: Project,
): "connected" | "pending" | "error" | "online" | "offline" {
  if (p.connectionMode === "edge") {
    if (p.edgeStatus === "online") return "online";
    if (p.edgeStatus === "offline") return "offline";
    if (p.edgeStatus === "error") return "error";
    return "pending";
  }
  if (p.status === "error") return "error";
  if (p.status === "pending") return "pending";
  return "connected";
}

export function ProjectDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [project, setProject] = useState<Project | null>(null);
  const [schema, setSchema] = useState<SchemaSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<"base" | null>(null);
  const [mcpManifest, setMcpManifest] = useState<McpManifest | null>(null);
  const [dockerRun, setDockerRun] = useState("");
  const [dockerCompose, setDockerCompose] = useState("");
  const [edgeToken, setEdgeToken] = useState<string | null>(null);
  const [generatingToken, setGeneratingToken] = useState(false);
  const [engTab, setEngTab] = useState<EngTab>("missions");
  const [bizTab, setBizTab] = useState<BizTab>("missions");
  const [mcpDevKey, setMcpDevKey] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    (async () => {
      try {
        const p = await api.getProject(id);
        if (!p) {
          navigate("/projects");
          return;
        }
        setProject(p);
        if (p.connectionMode === "edge" && p.edgeStatus !== "online") {
          if (p.vertical === "engineering") setEngTab("edge");
          else setBizTab("edge");
        } else if (p.vertical === "engineering") {
          setEngTab("missions");
        } else if (!(p.activeCapabilities?.length > 0)) {
          setBizTab("capabilities");
        } else {
          setBizTab("missions");
        }
        if (p.connectionMode === "cloud" && p.status === "error") {
          setError(
            p.edgeLastError
              ? `Banco indisponível: ${p.edgeLastError}`
              : "Banco indisponível — verifique se o PostgreSQL está no ar.",
          );
        }
        if (p.connectionMode === "edge") {
          try {
            const install = await api.getEdgeInstall(p.id);
            setDockerRun(install.dockerRunTemplate);
            setDockerCompose(install.dockerComposeTemplate);
          } catch {
            /* ignore */
          }
        }
        if (p.exposedResources.length || p.vertical === "engineering") {
          const manifest = await api.fetchMcpManifest(id);
          setMcpManifest(manifest);
        }
        if (
          p.vertical !== "engineering" &&
          p.status !== "error" &&
          (p.connectionMode !== "edge" || p.edgeStatus === "online")
        ) {
          try {
            const snap = await api.getSchema(id);
            setSchema(snap);
          } catch (err) {
            setError(
              err instanceof Error ? err.message : "Falha ao carregar schema",
            );
          }
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Erro ao carregar");
      } finally {
        setLoading(false);
      }
    })();
  }, [id, navigate]);

  // Keep Edge presence fresh (online only after DB probe for Business).
  useEffect(() => {
    if (!project || project.connectionMode !== "edge") return;
    const t = window.setInterval(async () => {
      try {
        const p = await api.getProject(project.id);
        if (p) setProject(p);
      } catch {
        /* ignore */
      }
    }, 5000);
    return () => clearInterval(t);
  }, [project?.id, project?.connectionMode]);

  async function copyText(kind: "base", value: string) {
    await navigator.clipboard.writeText(value);
    setCopied(kind);
    setTimeout(() => setCopied(null), 1500);
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

  async function onCapabilitiesUpdated(updated: Project) {
    setProject(updated);
    if (updated.exposedResources.length) {
      try {
        const manifest = await api.fetchMcpManifest(updated.id);
        setMcpManifest(manifest);
      } catch {
        /* keep previous */
      }
    }
  }

  if (loading) return <p className="text-sm text-slate-500">Carregando...</p>;
  if (!project) return null;

  const isEdge = project.connectionMode === "edge";
  const isEngineering = project.vertical === "engineering";

  const engTabs: Array<{ id: EngTab; label: string; hint?: string }> = [
    { id: "missions", label: "Missões", hint: "Objetivos" },
    { id: "agent", label: "Agente", hint: "Conectar MCP" },
    { id: "sources", label: "Fontes", hint: "Knowledge Layer" },
    { id: "settings", label: "Configuração", hint: "LLM Provider" },
    ...(isEdge
      ? [{ id: "edge" as const, label: "Edge", hint: "Instalação" }]
      : []),
  ];

  const bizTabs: Array<{ id: BizTab; label: string; hint?: string }> = [
    { id: "missions", label: "Missões", hint: "Objetivos" },
    { id: "capabilities", label: "Capacidades", hint: "Ferramentas MCP" },
    { id: "agent", label: "Agente", hint: "Conectar MCP" },
    { id: "data", label: "Dados", hint: "Schema e REST" },
    { id: "settings", label: "Configuração", hint: "LLM Provider" },
    ...(isEdge ? [{ id: "edge" as const, label: "Edge", hint: "Banco local" }] : []),
  ];

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link
            to="/projects"
            className="text-xs text-slate-500 hover:text-cyan"
          >
            ← Seus Sistemas
          </Link>
          <h1 className="mt-2 break-words text-xl font-bold text-white sm:text-2xl">
            {project.name}
          </h1>
          <p className="mt-1 break-all font-mono text-xs text-slate-500">
            {isEngineering
              ? "Context Operating System · Engineering"
              : isEdge
                ? `Business · ${project.engine} · Edge`
                : `Business · ${project.engine} · ${project.host}:${project.port}/${project.database}`}
            {isEdge && !isEngineering && project.edgeResourceCount != null
              ? ` · ${project.edgeResourceCount} tabelas`
              : ""}
          </p>
        </div>
        <div className="flex w-full flex-col items-stretch gap-1 sm:w-auto sm:items-end">
          <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:justify-end">
            <StatusBadge
              status={projectBadgeStatus(project)}
              variant={isEngineering ? "engineering" : "business"}
            />
            <Link
              to={`/projects/${project.id}/wizard`}
              className="rounded-lg border border-border px-3 py-2 text-xs text-slate-300 hover:border-cyan/40 hover:text-cyan"
            >
              Abrir wizard
            </Link>
          </div>
          {!isEdge && project.status === "error" && (
              <p className="max-w-md text-right text-[11px] text-red-400/90">
                {project.edgeLastError?.trim() ||
                  "Banco fora do ar ou inacessível neste host/porta."}
              </p>
            )}
        </div>
      </div>

      {error && <p className="mb-4 text-sm text-red-400">{error}</p>}

      {isEngineering ? (
        <>
          <ProjectTabs tabs={engTabs} active={engTab} onChange={setEngTab} />

          {engTab === "missions" && (
            <div className="mb-6">
              <MissionPanel project={project} />
            </div>
          )}

          {engTab === "agent" && (
            <div className="mb-6 space-y-4">
              <div className="rounded-2xl border border-border bg-surface-card p-4 card-glow sm:p-5">
                <div className="mb-3">
                  <p className="text-xs font-medium uppercase tracking-widest text-cyan">
                    Agente
                  </p>
                  <h2 className="mt-1 text-sm font-semibold text-white">
                    Conectar Cursor / Claude / ChatGPT
                  </h2>
                  <p className="mt-1 text-xs text-slate-500">
                    O agente chama{" "}
                    <code className="text-slate-400">run_mission</code>{" "}
                    (Implementar Story) ou as tools Story OS (Understand →
                    Execute) e recebe o Mission Package.
                  </p>
                </div>
                <McpConnectPanel
                  url={mcpManifest?.url ?? api.mcpUrl(project.id)}
                  apiKey={mcpDevKey ?? "<MCP_DEV_KEY>"}
                  serverId={`synapsee-${project.id.slice(0, 8)}`}
                  clients={mcpManifest?.clients}
                  claudeDesktopStdio={mcpManifest?.claudeDesktopStdio}
                />
              </div>
              <McpDevKeysPanel
                projectId={project.id}
                onActiveKey={setMcpDevKey}
              />
            </div>
          )}

          {engTab === "sources" && (
            <div className="mb-6">
              <EngineeringKnowledgePanel project={project} />
            </div>
          )}

          {engTab === "settings" && (
            <div className="mb-6">
              <LlmConfigPanel
                project={project}
                onProjectUpdate={(p) => setProject(p)}
              />
            </div>
          )}

          {engTab === "edge" && isEdge && (
            <div className="mb-6 rounded-2xl border border-border bg-surface-card p-4 card-glow sm:p-5">
              <h2 className="mb-3 text-sm font-semibold text-white">
                {project.edgeStatus === "online"
                  ? "Synapsee Edge · fontes"
                  : "Instalar Edge · GitHub / ClickUp"}
              </h2>
              <EdgeInstallPanel
                dockerRun={dockerRun}
                dockerCompose={dockerCompose}
                edgeStatus={project.edgeStatus}
                edgeLastSeen={project.edgeLastSeen}
                edgeVersion={project.edgeVersion}
                edgeResourceCount={project.edgeResourceCount}
                edgeLastError={project.edgeLastError}
                online={project.edgeStatus === "online"}
                tokenPlaintext={edgeToken}
                onGenerateToken={regenerateToken}
                generating={generatingToken}
                variant="engineering"
              />
            </div>
          )}
        </>
      ) : (
        <>
          <ProjectTabs tabs={bizTabs} active={bizTab} onChange={setBizTab} />

          {bizTab === "missions" && (
            <div className="mb-6">
              <MissionPanel project={project} />
            </div>
          )}

          {bizTab === "capabilities" && (
            <div className="mb-6">
              <CapabilitiesPanel
                project={project}
                onProjectUpdate={onCapabilitiesUpdated}
              />
            </div>
          )}

          {bizTab === "settings" && (
            <div className="mb-6">
              <LlmConfigPanel
                project={project}
                onProjectUpdate={(p) => setProject(p)}
              />
            </div>
          )}

          {bizTab === "agent" && (
            <div className="mb-6 space-y-4">
              <div className="rounded-2xl border border-border bg-surface-card p-4 card-glow sm:p-5">
                <div className="mb-3">
                  <p className="text-xs font-medium uppercase tracking-widest text-cyan">
                    Agente
                  </p>
                  <h2 className="mt-1 text-sm font-semibold text-white">
                    Conectar Cursor / Claude / ChatGPT
                  </h2>
                  <p className="mt-1 text-xs text-slate-500">
                    Ative capabilities e use{" "}
                    <code className="text-slate-400">run_mission</code> (ex.:
                    cobrar inadimplentes) para o Mission Package.
                  </p>
                </div>
                {project.exposedResources.length > 0 ? (
                  <McpConnectPanel
                    url={mcpManifest?.url ?? api.mcpUrl(project.id)}
                    apiKey={mcpDevKey ?? "<MCP_DEV_KEY>"}
                    serverId={`synapsee-${project.id.slice(0, 8)}`}
                    clients={mcpManifest?.clients}
                    claudeDesktopStdio={mcpManifest?.claudeDesktopStdio}
                  />
                ) : (
                  <p className="rounded-lg border border-dashed border-border px-3 py-6 text-center text-xs text-slate-500">
                    Exponha recursos no wizard e ative capabilities antes de
                    conectar o MCP.
                  </p>
                )}
              </div>
              {project.exposedResources.length > 0 && (
                <McpDevKeysPanel
                  projectId={project.id}
                  onActiveKey={setMcpDevKey}
                />
              )}
            </div>
          )}

          {bizTab === "data" && (
            <div className="mb-6 space-y-6">
              <div className="grid gap-4 md:grid-cols-3">
                <div className="rounded-2xl border border-border bg-surface-card p-4 card-glow md:col-span-2">
                  <p className="text-xs font-medium uppercase tracking-widest text-slate-500">
                    REST Base URL
                  </p>
                  <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center">
                    <code className="min-w-0 flex-1 break-all rounded-lg border border-border bg-surface px-3 py-2 font-mono text-xs text-cyan sm:text-sm">
                      /p/{project.id}
                    </code>
                    <button
                      type="button"
                      onClick={() => copyText("base", `/p/${project.id}`)}
                      className="shrink-0 rounded-lg border border-border px-3 py-2 text-xs text-slate-300 hover:text-white"
                    >
                      {copied === "base" ? "Copiado" : "Copiar"}
                    </button>
                  </div>
                  <p className="mt-2 break-words text-[11px] text-slate-600">
                    Modo: {isEdge ? "Edge" : "Cloud"} · Somente leitura:{" "}
                    {project.readOnly ? "sim" : "não"} · Expostos:{" "}
                    {project.exposedResources.join(", ") || "—"}
                  </p>
                </div>
                <div className="rounded-2xl border border-border bg-surface-card p-4 card-glow">
                  <p className="text-xs font-medium uppercase tracking-widest text-slate-500">
                    Schema
                  </p>
                  <p className="mt-2 text-2xl font-semibold text-white">
                    {schema?.resources.length ??
                      project.edgeResourceCount ??
                      "—"}
                  </p>
                  <p className="text-xs text-slate-500">recursos detectados</p>
                </div>
              </div>

              <div className="grid gap-6 lg:grid-cols-2">
                <div className="rounded-2xl border border-border bg-surface-card p-5 card-glow">
                  <h2 className="mb-3 text-sm font-semibold text-white">
                    Recursos
                  </h2>
                  <div className="max-h-72 space-y-1 overflow-auto">
                    {schema?.resources.map((r) => (
                      <div
                        key={r.name}
                        className="flex items-center justify-between rounded-lg px-2 py-1.5 text-xs"
                      >
                        <span className="font-mono text-slate-300">
                          {r.name}
                        </span>
                        <span
                          className={
                            project.exposedResources.includes(r.name)
                              ? "text-green"
                              : "text-slate-600"
                          }
                        >
                          {project.exposedResources.includes(r.name)
                            ? "exposto"
                            : "oculto"}
                        </span>
                      </div>
                    ))}
                    {!schema && (
                      <p className="text-xs text-slate-500">
                        {isEdge && project.edgeStatus !== "online"
                          ? "Aguardando Edge online para carregar schema."
                          : "Sem schema carregado."}
                      </p>
                    )}
                  </div>
                </div>

                <div className="rounded-2xl border border-border bg-surface-card p-5 card-glow">
                  <h2 className="mb-3 text-sm font-semibold text-white">
                    Playground REST
                  </h2>
                  <ApiPlayground
                    projectId={project.id}
                    resources={project.exposedResources}
                  />
                </div>
              </div>
            </div>
          )}

          {bizTab === "edge" && isEdge && (
            <div className="mb-6 rounded-2xl border border-border bg-surface-card p-4 card-glow sm:p-5">
              <h2 className="mb-3 text-sm font-semibold text-white">
                {project.edgeStatus === "online"
                  ? "Synapsee Edge · banco"
                  : "Instalar Synapsee Edge"}
              </h2>
              <EdgeInstallPanel
                dockerRun={dockerRun}
                dockerCompose={dockerCompose}
                edgeStatus={project.edgeStatus}
                edgeLastSeen={project.edgeLastSeen}
                edgeVersion={project.edgeVersion}
                edgeResourceCount={project.edgeResourceCount}
                edgeLastError={project.edgeLastError}
                online={project.edgeStatus === "online"}
                tokenPlaintext={edgeToken}
                onGenerateToken={regenerateToken}
                generating={generatingToken}
                variant="business"
              />
            </div>
          )}
        </>
      )}
    </div>
  );
}
