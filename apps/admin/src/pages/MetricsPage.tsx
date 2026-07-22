import { useEffect, useState } from "react";
import { api } from "../lib/api";
import type { ProductMetrics } from "../lib/types";

function formatDuration(ms: number | null): string {
  if (ms == null) return "—";
  if (ms < 1000) return `${ms} ms`;
  const sec = ms / 1000;
  if (sec < 60) return `${sec.toFixed(1)} s`;
  const min = sec / 60;
  if (min < 60) return `${min.toFixed(1)} min`;
  const h = min / 60;
  return `${h.toFixed(1)} h`;
}

export function MetricsPage() {
  const [metrics, setMetrics] = useState<ProductMetrics | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        const data = await api.getMetrics();
        if (!cancelled) {
          setMetrics(data);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Falha ao carregar métricas");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="mx-auto max-w-3xl">
      <p className="text-xs font-medium uppercase tracking-widest text-cyan">Prova de produto</p>
      <h1 className="mt-1 text-2xl font-bold text-white">Métricas</h1>
      <p className="mt-2 max-w-xl text-sm text-slate-400">
        Conexão é infra. Estas métricas medem se projetos chegam a packs/playbooks úteis.
      </p>

      {loading && <p className="mt-8 text-sm text-slate-500">Carregando…</p>}
      {error && (
        <p className="mt-8 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
          {error}
        </p>
      )}

      {metrics && !loading && (
        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          <MetricCard
            label="% com capability ativa"
            value={`${metrics.pctWithActiveCapabilities}%`}
            hint={`${metrics.projectsWithActiveCapabilities} de ${metrics.projectsTotal} projetos`}
          />
          <MetricCard
            label="Média de capabilities"
            value={String(metrics.avgActiveCapabilities)}
            hint="por projeto (inclui zeros)"
          />
          <MetricCard
            label="Overrides / 7 dias"
            value={String(metrics.overridesLast7Days)}
            hint="correções humanas de papel"
          />
          <MetricCard
            label="Tempo até 1ª pergunta útil"
            value={formatDuration(metrics.timeToFirstUseful.medianMs)}
            hint={
              metrics.timeToFirstUseful.sampleSize
                ? `mediana · n=${metrics.timeToFirstUseful.sampleSize} · p90 ${formatDuration(metrics.timeToFirstUseful.p90Ms)}`
                : "ainda sem preview/MCP cap_*"
            }
          />
        </div>
      )}

      {metrics && metrics.eventsLast7Days.length > 0 && (
        <div className="mt-8">
          <h2 className="text-sm font-medium text-slate-300">Eventos (7 dias)</h2>
          <ul className="mt-3 space-y-2">
            {metrics.eventsLast7Days.map((e) => (
              <li
                key={e.type}
                className="flex items-center justify-between border-b border-border py-2 text-sm"
              >
                <span className="font-mono text-slate-400">{e.type}</span>
                <span className="text-white">{e.count}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function MetricCard(props: { label: string; value: string; hint: string }) {
  return (
    <div className="rounded-2xl border border-border bg-surface-card p-5">
      <p className="text-xs uppercase tracking-wider text-slate-500">{props.label}</p>
      <p className="mt-2 text-3xl font-semibold text-white">{props.value}</p>
      <p className="mt-1 text-xs text-slate-500">{props.hint}</p>
    </div>
  );
}
