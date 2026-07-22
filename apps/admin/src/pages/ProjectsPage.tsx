import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import type { Project } from "../lib/types";
import { StatusBadge } from "../components/StatusBadge";

export function ProjectsPage() {
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

  async function remove(id: string) {
    if (!confirm("Remover este sistema?")) return;
    try {
      await api.deleteProject(id);
      setProjects((prev) => prev.filter((p) => p.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao remover");
    }
  }

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-widest text-cyan">Seus Sistemas</p>
          <h1 className="mt-1 text-xl font-bold text-white sm:text-2xl">Conexões de banco</h1>
          <p className="mt-1 text-sm text-slate-400">
            Conecte, introspecte e exponha recursos sem importar dados.
          </p>
        </div>
        <Link
          to="/projects/new"
          className="w-full rounded-xl cyan-gradient px-5 py-2.5 text-center text-sm font-semibold text-surface shadow-lg shadow-cyan/10 sm:w-auto"
        >
          Novo sistema
        </Link>
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
        {projects.map((p) => (
          <div
            key={p.id}
            className="rounded-2xl border border-border bg-surface-card p-5 card-glow transition"
          >
            <div className="mb-3 flex items-start justify-between gap-2">
              <div>
                <h2 className="font-semibold text-white">{p.name}</h2>
                <p className="mt-0.5 break-all font-mono text-[11px] text-slate-500">
                  {p.connectionMode === "edge"
                    ? `${p.engine} · Edge`
                    : `${p.engine} · ${p.host}:${p.port}/${p.database}`}
                </p>
              </div>
              <StatusBadge
                status={
                  p.connectionMode === "edge"
                    ? p.edgeStatus === "online"
                      ? "online"
                      : p.edgeStatus === "offline"
                        ? "offline"
                        : p.edgeStatus === "error"
                          ? "error"
                          : "pending"
                    : p.status === "connected"
                      ? "connected"
                      : p.status === "pending"
                        ? "pending"
                        : "error"
                }
              />
            </div>
            <p className="mb-4 text-xs text-slate-500">
              {p.exposedResources.length
                ? `${p.exposedResources.length} recurso(s) exposto(s)`
                : "Nenhum recurso exposto"}
            </p>
            <div className="flex flex-wrap gap-2">
              <Link
                to={`/projects/${p.id}`}
                className="min-w-[5.5rem] flex-1 rounded-lg border border-border px-3 py-2 text-center text-xs font-medium text-slate-300 transition hover:border-cyan/40 hover:text-cyan"
              >
                Abrir
              </Link>
              <Link
                to={`/projects/${p.id}/wizard`}
                className="min-w-[5.5rem] flex-1 rounded-lg border border-border px-3 py-2 text-center text-xs font-medium text-slate-300 transition hover:border-border-bright hover:text-white"
              >
                Wizard
              </Link>
              <button
                type="button"
                onClick={() => remove(p.id)}
                className="rounded-lg border border-border px-3 py-2 text-xs text-slate-500 hover:border-red-500/40 hover:text-red-400"
              >
                Remover
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
