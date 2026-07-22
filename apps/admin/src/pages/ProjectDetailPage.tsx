import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api, getApiKey } from "../lib/api";
import type { McpManifest, Project, SchemaSnapshot } from "../lib/types";
import { StatusBadge } from "../components/StatusBadge";
import { ApiPlayground } from "../components/ApiPlayground";
import { CapabilitiesPanel } from "../components/CapabilitiesPanel";
import { McpConnectPanel } from "../components/McpConnectPanel";
import { EdgeInstallPanel } from "../components/EdgeInstallPanel";

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
        if (p.connectionMode === "edge") {
          try {
            const install = await api.getEdgeInstall(p.id);
            setDockerRun(install.dockerRunTemplate);
            setDockerCompose(install.dockerComposeTemplate);
          } catch {
            /* ignore */
          }
        }
        if (p.connectionMode !== "edge" || p.edgeStatus === "online") {
          try {
            const snap = await api.getSchema(id);
            setSchema(snap);
          } catch (err) {
            setError(err instanceof Error ? err.message : "Falha ao carregar schema");
          }
        }
        if (p.exposedResources.length) {
          const manifest = await api.fetchMcpManifest(id);
          setMcpManifest(manifest);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Erro ao carregar");
      } finally {
        setLoading(false);
      }
    })();
  }, [id, navigate]);

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

  if (loading) return <p className="text-sm text-slate-500">Carregando...</p>;
  if (!project) return null;

  const isEdge = project.connectionMode === "edge";

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link to="/projects" className="text-xs text-slate-500 hover:text-cyan">
            ← Seus Sistemas
          </Link>
          <h1 className="mt-2 break-words text-xl font-bold text-white sm:text-2xl">
            {project.name}
          </h1>
          <p className="mt-1 break-all font-mono text-xs text-slate-500">
            {isEdge
              ? `${project.engine} · modo Edge`
              : `${project.engine} · ${project.host}:${project.port}/${project.database}`}
            {isEdge && project.edgeResourceCount != null
              ? ` · ${project.edgeResourceCount} tabelas`
              : ""}
          </p>
        </div>
        <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
          <StatusBadge status={projectBadgeStatus(project)} />
          <Link
            to={`/projects/${project.id}/wizard`}
            className="rounded-lg border border-border px-3 py-2 text-xs text-slate-300 hover:border-cyan/40 hover:text-cyan"
          >
            Abrir wizard
          </Link>
        </div>
      </div>

      {error && <p className="mb-4 text-sm text-red-400">{error}</p>}

      {isEdge && (
        <div className="mb-6 rounded-2xl border border-border bg-surface-card p-4 card-glow sm:p-5">
          <h2 className="mb-3 text-sm font-semibold text-white">
            {project.edgeStatus === "online" ? "Synapsee Edge" : "Instalar Synapsee Edge"}
          </h2>
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
        </div>
      )}

      <div className="mb-6 grid gap-4 md:grid-cols-3">
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
          <p className="text-xs font-medium uppercase tracking-widest text-slate-500">Schema</p>
          <p className="mt-2 text-2xl font-semibold text-white">
            {schema?.resources.length ?? project.edgeResourceCount ?? "—"}
          </p>
          <p className="text-xs text-slate-500">recursos detectados</p>
        </div>
      </div>

      {project.exposedResources.length > 0 && (
        <div className="mb-6 rounded-2xl border border-border bg-surface-card p-4 card-glow sm:p-5">
          <div className="mb-1 flex justify-end">
            <StatusBadge status="ok" />
          </div>
          <McpConnectPanel
            url={mcpManifest?.url ?? api.mcpUrl(project.id)}
            apiKey={getApiKey() ?? "dev-key"}
            serverId={`synapsee-${project.id.slice(0, 8)}`}
            clients={mcpManifest?.clients}
            claudeDesktopStdio={mcpManifest?.claudeDesktopStdio}
            tools={mcpManifest?.tools}
          />
        </div>
      )}

      <div className="mb-6">
        <CapabilitiesPanel
          project={project}
          onProjectUpdate={async (updated) => {
            setProject(updated);
            if (updated.exposedResources.length) {
              try {
                const manifest = await api.fetchMcpManifest(updated.id);
                setMcpManifest(manifest);
              } catch {
                // keep previous manifest
              }
            }
          }}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-2xl border border-border bg-surface-card p-5 card-glow">
          <h2 className="mb-3 text-sm font-semibold text-white">Recursos</h2>
          <div className="max-h-72 space-y-1 overflow-auto">
            {schema?.resources.map((r) => (
              <div
                key={r.name}
                className="flex items-center justify-between rounded-lg px-2 py-1.5 text-xs"
              >
                <span className="font-mono text-slate-300">{r.name}</span>
                <span
                  className={
                    project.exposedResources.includes(r.name)
                      ? "text-green"
                      : "text-slate-600"
                  }
                >
                  {project.exposedResources.includes(r.name) ? "exposto" : "oculto"}
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
          <h2 className="mb-3 text-sm font-semibold text-white">Playground REST</h2>
          <ApiPlayground projectId={project.id} resources={project.exposedResources} />
        </div>
      </div>
    </div>
  );
}
