import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api, getApiKey } from "../lib/api";
import type { McpManifest, Project } from "../lib/types";
import { StatusBadge } from "../components/StatusBadge";
import { CapabilitiesPanel } from "../components/CapabilitiesPanel";
import { McpConnectPanel } from "../components/McpConnectPanel";

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

/** Lista sistemas para escolher o MCP. */
export function AgentsMcpPage() {
  const { id } = useParams();
  if (id) return <AgentsMcpDetail projectId={id} />;
  return <AgentsMcpPicker />;
}

function AgentsMcpPicker() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const list = await api.listProjects();
        if (!cancelled) setProjects(list);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Erro ao listar");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-8">
        <p className="text-xs font-medium uppercase tracking-widest text-cyan">
          Agentes MCP
        </p>
        <h1 className="mt-1 text-xl font-bold text-white sm:text-2xl">
          Conectar agentes
        </h1>
        <p className="mt-1 text-sm text-slate-400">
          Escolha o sistema para ver o endpoint MCP e as ferramentas de negócio.
        </p>
      </div>

      {loading && <p className="text-sm text-slate-500">Carregando...</p>}
      {error && <p className="text-sm text-red-400">{error}</p>}

      {!loading && projects.length === 0 && (
        <div className="rounded-2xl border border-dashed border-border bg-surface-card/50 px-6 py-16 text-center">
          <p className="text-slate-400">Nenhum sistema ainda.</p>
          <Link to="/projects/new" className="mt-4 inline-block text-sm text-cyan hover:underline">
            Conectar primeiro banco →
          </Link>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        {projects.map((p) => {
          const ready = p.exposedResources.length > 0;
          return (
            <Link
              key={p.id}
              to={`/agents/${p.id}`}
              className="rounded-2xl border border-border bg-surface-card p-5 card-glow transition hover:border-cyan/40"
            >
              <div className="mb-3 flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <h2 className="font-semibold text-white">{p.name}</h2>
                  <p className="mt-0.5 break-all font-mono text-[11px] text-slate-500">
                    {p.connectionMode === "edge"
                      ? `${p.engine} · Edge`
                      : `${p.engine} · ${p.host}:${p.port}`}
                  </p>
                </div>
                <StatusBadge status={projectBadgeStatus(p)} />
              </div>
              <p className="text-xs text-slate-500">
                {ready
                  ? `${p.exposedResources.length} recurso(s) · ${(p.activeCapabilities ?? []).length} capacidade(s)`
                  : "Exponha recursos no wizard antes de conectar agentes"}
              </p>
              <p className="mt-3 text-xs font-medium text-cyan">
                Abrir MCP e ferramentas →
              </p>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

function AgentsMcpDetail({ projectId }: { projectId: string }) {
  const navigate = useNavigate();
  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mcpManifest, setMcpManifest] = useState<McpManifest | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const p = await api.getProject(projectId);
        if (!p) {
          navigate("/agents");
          return;
        }
        if (cancelled) return;
        setProject(p);
        if (p.exposedResources.length) {
          try {
            const manifest = await api.fetchMcpManifest(p.id);
            if (!cancelled) setMcpManifest(manifest);
          } catch {
            /* optional */
          }
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Erro ao carregar");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [projectId, navigate]);

  if (loading) return <p className="text-sm text-slate-500">Carregando...</p>;
  if (!project) return null;

  const ready = project.exposedResources.length > 0;

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link to="/agents" className="text-xs text-slate-500 hover:text-cyan">
            ← Agentes MCP
          </Link>
          <h1 className="mt-2 break-words text-xl font-bold text-white sm:text-2xl">
            {project.name}
          </h1>
          <p className="mt-1 text-sm text-slate-400">
            MCP e ferramentas de negócio deste sistema
          </p>
        </div>
        <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
          <StatusBadge status={projectBadgeStatus(project)} />
          <Link
            to={`/projects/${project.id}`}
            className="rounded-lg border border-border px-3 py-2 text-xs text-slate-300 hover:border-cyan/40 hover:text-cyan"
          >
            Detalhe completo
          </Link>
        </div>
      </div>

      {error && <p className="mb-4 text-sm text-red-400">{error}</p>}

      {!ready && (
        <div className="mb-6 rounded-2xl border border-dashed border-border bg-surface-card/50 p-5">
          <p className="text-sm text-slate-400">
            Este sistema ainda não tem recursos expostos. Conclua o wizard para
            gerar o MCP.
          </p>
          <Link
            to={`/projects/${project.id}/wizard`}
            className="mt-3 inline-block text-sm text-cyan hover:underline"
          >
            Abrir wizard →
          </Link>
        </div>
      )}

      {ready && (
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

      <CapabilitiesPanel
        project={project}
        onProjectUpdate={async (updated) => {
          setProject(updated);
          if (updated.exposedResources.length) {
            try {
              const manifest = await api.fetchMcpManifest(updated.id);
              setMcpManifest(manifest);
            } catch {
              /* keep previous */
            }
          }
        }}
      />
    </div>
  );
}
