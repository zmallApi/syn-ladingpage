import { useEffect, useMemo, useState, type MouseEvent } from "react";
import { api } from "../lib/api";
import type { Project } from "../lib/types";

type MissionDef = {
  id: string;
  title: string;
  intent: string;
  description: string;
  capabilities: string[];
  paramSchema: Array<{
    name: string;
    type: string;
    required?: boolean;
    description: string;
  }>;
};

type PartyCard = {
  partyId?: string;
  name: string;
  daysOverdue?: number;
  amount?: number;
  score?: number;
  lastContactDays?: number;
  reasons?: string[];
  rank?: number;
};

type MissionPackageView = {
  role?: string;
  missionId?: string;
  missionTitle?: string;
  intent?: string;
  objective?: string;
  agentBrief?: string;
  ready?: boolean;
  warnings?: string[];
  plan?: string[];
  risks?: string[];
  checklist?: string[];
  statusSteps?: string[];
  discoveries?: string[];
  explanation?: string;
  recommendation?: string[];
  availableActions?: string[];
  restrictions?: string[];
  partyCards?: PartyCard[];
  context?: Record<string, unknown>;
  [key: string]: unknown;
};

type MissionRunRow = {
  id: string;
  missionId: string;
  ready: boolean;
  createdAt: string;
  package: MissionPackageView;
  params?: Record<string, unknown>;
};

/** Prefer story/objective title over generic mission catalog name. */
function storyTitleOf(row: MissionRunRow): string {
  const obj = String(row.package?.objective ?? "").trim();
  if (obj) return obj;
  const ctx = row.package?.context;
  if (ctx && typeof ctx === "object") {
    const taskRef = (ctx as Record<string, unknown>).taskRef;
    if (typeof taskRef === "string" && taskRef.trim()) return taskRef.trim();
  }
  const paramRef = row.params?.taskRef;
  if (typeof paramRef === "string" && paramRef.trim()) return paramRef.trim();
  const missionTitle = String(row.package?.missionTitle ?? "").trim();
  if (missionTitle) return missionTitle;
  return row.missionId;
}

const CAP_CHIP: Record<string, string> = {
  eng_understand_story: "Understand",
  eng_refine_story: "Refine",
  eng_impact_analysis: "Impact",
  eng_implementation_plan: "Plan",
  eng_execute_context: "Package",
  overdue_ledger: "Inadimplência",
  attention_queue: "Fila de atenção",
  list_at_risk: "Risco",
};

const PARAM_LABEL: Record<string, string> = {
  taskRef: "História (ClickUp / título)",
  incidentRef: "Incidente / Task",
  limit: "Limite",
  minDelayDays: "Dias mínimos de atraso",
};

function missionTitleOf(id: string, missions: MissionDef[]): string {
  return missions.find((m) => m.id === id)?.title ?? id;
}

function chipsFor(caps: string[]): string[] {
  return caps.map((c) => CAP_CHIP[c] ?? c.replace(/^eng_/, "").replace(/_/g, " "));
}

function formatBrl(n: number): string {
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

type PackageTab =
  | "mission"
  | "evidence"
  | "recommendation"
  | "actions"
  | "brief"
  | "plan"
  | "risks"
  | "checklist";

function isBusinessCollections(pkg: MissionPackageView | null): boolean {
  if (!pkg) return false;
  if (pkg.missionId === "collect_overdue") return true;
  if (Array.isArray(pkg.partyCards) && pkg.partyCards.length > 0) return true;
  return pkg.context?.presentation === "business_collections_v2";
}

export function MissionPanel({ project }: { project: Project }) {
  const [missions, setMissions] = useState<MissionDef[]>([]);
  const [selected, setSelected] = useState<string>("");
  const [params, setParams] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pkg, setPkg] = useState<MissionPackageView | null>(null);
  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  const [tab, setTab] = useState<PackageTab>("mission");
  const [runs, setRuns] = useState<MissionRunRow[]>([]);

  useEffect(() => {
    void (async () => {
      try {
        const res = await api.listMissions(project.id);
        setMissions(res.missions);
        const first = res.missions[0]?.id ?? "";
        setSelected(first);
        const history = await api.listMissionRuns(project.id, 12);
        setRuns(
          history.runs.map((r) => ({
            id: r.id,
            missionId: r.missionId,
            ready: r.ready,
            createdAt: r.createdAt,
            package: (r.package ?? {}) as MissionPackageView,
            params: r.params,
          })),
        );
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Falha ao carregar missões",
        );
      }
    })();
  }, [project.id]);

  const current = missions.find((m) => m.id === selected);
  const pipeline = useMemo(
    () => (current ? chipsFor(current.capabilities) : []),
    [current],
  );

  async function run() {
    if (!selected) return;
    setBusy(true);
    setError(null);
    setPkg(null);
    setActiveRunId(null);
    try {
      const body: Record<string, unknown> = {};
      for (const field of current?.paramSchema ?? []) {
        const raw = params[field.name]?.trim();
        if (!raw) continue;
        body[field.name] = field.type === "number" ? Number(raw) : raw;
      }
      const res = await api.runMission(project.id, selected, body);
      setPkg(res.package);
      setActiveRunId(res.runId);
      setTab(
        res.package?.missionId === "collect_overdue" ||
          (Array.isArray(res.package?.partyCards) &&
            res.package.partyCards.length > 0)
          ? "mission"
          : "brief",
      );
      const history = await api.listMissionRuns(project.id, 12);
      setRuns(
        history.runs.map((r) => ({
          id: r.id,
          missionId: r.missionId,
          ready: r.ready,
          createdAt: r.createdAt,
          package: (r.package ?? {}) as MissionPackageView,
          params: r.params,
        })),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha na missão");
    } finally {
      setBusy(false);
    }
  }

  async function copyBrief() {
    const text = String(pkg?.agentBrief ?? "");
    if (!text) return;
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  function openRun(row: MissionRunRow) {
    setActiveRunId(row.id);
    setPkg(row.package);
    setSelected(row.missionId);
    setTab(isBusinessCollections(row.package) ? "mission" : "brief");
    setError(null);
  }

  async function deleteRun(row: MissionRunRow, e: MouseEvent) {
    e.stopPropagation();
    e.preventDefault();
    if (!window.confirm(`Excluir run “${storyTitleOf(row)}”?`)) return;
    try {
      await api.deleteMissionRun(project.id, row.id);
      setRuns((prev) => prev.filter((r) => r.id !== row.id));
      if (activeRunId === row.id) {
        setPkg(null);
        setActiveRunId(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao excluir run");
    }
  }

  function closePackage() {
    setPkg(null);
    setActiveRunId(null);
    setTab("brief");
    setCopied(false);
  }

  const ready = pkg?.ready === true;
  const planItems = Array.isArray(pkg?.plan) ? pkg.plan : [];
  const riskItems = Array.isArray(pkg?.risks) ? pkg.risks : [];
  const checklistItems = Array.isArray(pkg?.checklist) ? pkg.checklist : [];
  const businessPkg = isBusinessCollections(pkg);
  const partyCards = Array.isArray(pkg?.partyCards) ? pkg.partyCards : [];
  const discoveries = Array.isArray(pkg?.discoveries) ? pkg.discoveries : [];
  const statusSteps = Array.isArray(pkg?.statusSteps) ? pkg.statusSteps : [];
  const recommendation = Array.isArray(pkg?.recommendation)
    ? pkg.recommendation
    : planItems;
  const availableActions = Array.isArray(pkg?.availableActions)
    ? pkg.availableActions
    : [];
  const restrictions = Array.isArray(pkg?.restrictions) ? pkg.restrictions : [];

  return (
    <section className="rounded-2xl border border-border bg-surface-card p-5 card-glow sm:p-6">
      <div className="mb-5">
        <p className="text-xs font-medium uppercase tracking-widest text-cyan">
          Missões
        </p>
        <h2 className="mt-1 text-lg font-semibold text-white">
          Preparar Mission Package
        </h2>
        <p className="mt-1 max-w-2xl text-sm text-slate-400">
          Você chama um objetivo. O Synapsee orquestra as capabilities e entrega
          o pacote para o agente executar.
        </p>
      </div>

      {error && (
        <p className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">
          {error}
        </p>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {missions.map((m) => {
          const active = selected === m.id;
          return (
            <button
              key={m.id}
              type="button"
              onClick={() => {
                setSelected(m.id);
                setParams({});
                setPkg(null);
                setActiveRunId(null);
              }}
              className={`rounded-xl border p-4 text-left transition ${
                active
                  ? "border-cyan/50 bg-cyan/10 shadow-[0_0_0_1px_rgba(34,211,238,0.15)]"
                  : "border-border bg-surface hover:border-slate-600"
              }`}
            >
              <p className="text-sm font-semibold text-white">{m.title}</p>
              <p className="mt-1 text-xs leading-relaxed text-slate-400">
                {m.intent}
              </p>
              <div className="mt-3 flex flex-wrap gap-1">
                {chipsFor(m.capabilities).map((chip) => (
                  <span
                    key={chip}
                    className="rounded-md border border-border/80 bg-surface-card px-1.5 py-0.5 text-[10px] text-slate-400"
                  >
                    {chip}
                  </span>
                ))}
              </div>
            </button>
          );
        })}
      </div>

      {current && (
        <div className="mt-5 rounded-xl border border-border bg-surface p-4">
          <p className="text-[11px] uppercase tracking-widest text-slate-500">
            Pipeline
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {pipeline.map((chip, i) => (
              <span key={`${chip}-${i}`} className="flex items-center gap-1.5">
                {i > 0 && (
                  <span className="text-slate-600" aria-hidden>
                    →
                  </span>
                )}
                <span
                  className={`rounded-lg px-2.5 py-1 text-[11px] font-medium ${
                    busy
                      ? "bg-cyan/10 text-cyan animate-pulse"
                      : "bg-cyan/15 text-cyan"
                  }`}
                >
                  {chip}
                </span>
              </span>
            ))}
          </div>
          <p className="mt-2 text-xs text-slate-500">{current.description}</p>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {current.paramSchema.map((field) => (
              <label key={field.name} className="block text-sm text-slate-300">
                {PARAM_LABEL[field.name] ?? field.name}
                {field.required ? " *" : ""}
                <input
                  className="mt-1 w-full rounded-lg border border-border bg-surface-card px-3 py-2 text-sm text-white placeholder:text-slate-600"
                  placeholder={field.description}
                  value={params[field.name] ?? ""}
                  onChange={(e) =>
                    setParams((p) => ({ ...p, [field.name]: e.target.value }))
                  }
                />
              </label>
            ))}
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={busy || !selected}
              onClick={() => void run()}
              className="rounded-xl cyan-gradient px-4 py-2.5 text-sm font-semibold text-surface disabled:opacity-50"
            >
              {busy ? "Preparando…" : "Preparar Mission Package"}
            </button>
            {busy && (
              <span className="text-xs text-slate-500">
                Orquestrando pipeline…
              </span>
            )}
          </div>
        </div>
      )}

      {pkg && (
        <div className="mt-5 rounded-xl border border-cyan/30 bg-cyan/5 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[10px] font-medium uppercase tracking-widest text-cyan">
                Mission Package
              </p>
              <h3 className="mt-1 text-lg font-semibold text-white">
                {String(pkg.missionTitle || current?.title || "Missão")}
              </h3>
              <p className="mt-1 max-w-xl text-sm leading-relaxed text-slate-300">
                {String(pkg.objective || "")}
              </p>
              <p className="mt-1 text-[11px] text-slate-500">
                {activeRunId ? `run ${activeRunId.slice(0, 8)}` : ""}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={`rounded-lg px-2.5 py-1 text-xs font-medium ${
                  ready
                    ? "bg-emerald-500/15 text-emerald-300"
                    : "bg-amber-500/15 text-amber-200"
                }`}
              >
                {ready ? "Pronto para execução" : "Rascunho"}
              </span>
              <button
                type="button"
                onClick={() => void copyBrief()}
                className="rounded-lg border border-border bg-surface px-3 py-1.5 text-xs text-slate-200 hover:border-cyan/40"
              >
                {copied ? "Copiado" : "Copiar prompt"}
              </button>
              <button
                type="button"
                onClick={closePackage}
                className="rounded-lg border border-border bg-surface px-3 py-1.5 text-xs text-slate-400 hover:border-slate-500 hover:text-slate-200"
                aria-label="Fechar Mission Package"
              >
                Fechar
              </button>
            </div>
          </div>

          {businessPkg ? (
            <>
              <div className="mt-4 flex flex-wrap gap-1">
                {(
                  [
                    ["mission", "Missão"],
                    [
                      "evidence",
                      `Evidências${partyCards.length ? ` (${partyCards.length})` : ""}`,
                    ],
                    ["recommendation", "Recomendação"],
                    ["actions", "Ações"],
                    ["brief", "Prompt"],
                  ] as const
                ).map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setTab(id)}
                    className={`rounded-lg px-2.5 py-1 text-[11px] font-medium ${
                      tab === id
                        ? "bg-cyan/20 text-cyan"
                        : "text-slate-500 hover:text-slate-300"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              <div className="mt-3 max-h-[28rem] space-y-4 overflow-auto rounded-lg border border-border bg-surface p-4">
                {tab === "mission" && (
                  <>
                    {statusSteps.length > 0 && (
                      <div>
                        <p className="text-[11px] font-medium uppercase tracking-widest text-slate-500">
                          Status
                        </p>
                        <ul className="mt-2 space-y-1.5 text-sm text-slate-200">
                          {statusSteps.map((s) => (
                            <li key={s} className="flex gap-2">
                              <span className="text-emerald-400">✓</span>
                              <span>{s}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {discoveries.length > 0 && (
                      <div>
                        <p className="text-[11px] font-medium uppercase tracking-widest text-slate-500">
                          Descobertas
                        </p>
                        <div className="mt-2 space-y-2 text-sm leading-relaxed text-slate-300">
                          {discoveries.map((d, i) => (
                            <p key={i}>{d}</p>
                          ))}
                        </div>
                      </div>
                    )}
                    {pkg.explanation && (
                      <div>
                        <p className="text-[11px] font-medium uppercase tracking-widest text-slate-500">
                          Explicação
                        </p>
                        <pre className="mt-2 whitespace-pre-wrap font-sans text-sm leading-relaxed text-slate-300">
                          {String(pkg.explanation)}
                        </pre>
                      </div>
                    )}
                  </>
                )}

                {tab === "evidence" && (
                  <div className="space-y-3">
                    {partyCards.length === 0 && (
                      <p className="text-sm text-slate-600">
                        Sem evidências de clientes nesta missão.
                      </p>
                    )}
                    {partyCards.map((p) => (
                      <article
                        key={`${p.rank}-${p.partyId ?? p.name}`}
                        className="rounded-xl border border-border bg-surface-card px-3 py-3"
                      >
                        <p className="text-[10px] uppercase tracking-widest text-slate-500">
                          Party {p.rank != null ? `· #${p.rank}` : ""}
                        </p>
                        <h4 className="mt-0.5 text-sm font-semibold text-white">
                          {p.name}
                        </h4>
                        <ul className="mt-2 space-y-1 text-xs text-slate-300">
                          {p.daysOverdue != null && (
                            <li>• {p.daysOverdue} dias em atraso</li>
                          )}
                          {p.amount != null && (
                            <li>• {formatBrl(p.amount)}</li>
                          )}
                          {p.score != null && (
                            <li>• Score / prioridade: {p.score}</li>
                          )}
                          {p.lastContactDays != null && (
                            <li>• Último contato: {p.lastContactDays} dias</li>
                          )}
                          {(p.reasons ?? []).slice(0, 3).map((r) => (
                            <li key={r} className="text-slate-500">
                              • {r}
                            </li>
                          ))}
                        </ul>
                      </article>
                    ))}
                  </div>
                )}

                {tab === "recommendation" && (
                  <ul className="space-y-2 text-sm text-slate-300">
                    {recommendation.map((item, i) => (
                      <li key={i} className="flex gap-2">
                        <span className="text-cyan">→</span>
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                )}

                {tab === "actions" && (
                  <div className="space-y-4">
                    <div>
                      <p className="text-[11px] font-medium uppercase tracking-widest text-slate-500">
                        O agente pode
                      </p>
                      <ul className="mt-2 space-y-1.5 text-sm text-slate-300">
                        {availableActions.map((a) => (
                          <li key={a} className="flex gap-2">
                            <span className="text-emerald-400">✓</span>
                            <span>{a}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                    <div>
                      <p className="text-[11px] font-medium uppercase tracking-widest text-slate-500">
                        O agente NÃO pode
                      </p>
                      <ul className="mt-2 space-y-1.5 text-sm text-slate-300">
                        {restrictions.map((r) => (
                          <li key={r} className="flex gap-2">
                            <span className="text-red-400">•</span>
                            <span>{r}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                    {riskItems.length > 0 && (
                      <div>
                        <p className="text-[11px] font-medium uppercase tracking-widest text-slate-500">
                          Riscos
                        </p>
                        <ul className="mt-2 space-y-1.5 text-sm text-slate-300">
                          {riskItems.map((r, i) => (
                            <li key={i} className="flex gap-2">
                              <span className="text-amber-400">•</span>
                              <span>{r}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                )}

                {tab === "brief" && (
                  <pre className="whitespace-pre-wrap font-mono text-[11px] leading-relaxed text-slate-300">
                    {String(pkg.agentBrief ?? "—")}
                  </pre>
                )}
              </div>
            </>
          ) : (
            <>
              <div className="mt-3 flex flex-wrap gap-1">
                {(
                  [
                    ["brief", "Brief"],
                    ["plan", `Plano${planItems.length ? ` (${planItems.length})` : ""}`],
                    ["risks", `Riscos${riskItems.length ? ` (${riskItems.length})` : ""}`],
                    [
                      "checklist",
                      `Checklist${checklistItems.length ? ` (${checklistItems.length})` : ""}`,
                    ],
                  ] as const
                ).map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setTab(id)}
                    className={`rounded-lg px-2.5 py-1 text-[11px] font-medium ${
                      tab === id
                        ? "bg-cyan/20 text-cyan"
                        : "text-slate-500 hover:text-slate-300"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              <div className="mt-3 max-h-80 overflow-auto rounded-lg border border-border bg-surface p-3">
                {tab === "brief" && (
                  <pre className="whitespace-pre-wrap font-mono text-[11px] leading-relaxed text-slate-300">
                    {String(pkg.agentBrief ?? "—")}
                  </pre>
                )}
                {tab === "plan" && (
                  <ul className="space-y-1.5 text-xs text-slate-300">
                    {planItems.length === 0 && (
                      <li className="text-slate-600">Sem itens de plano.</li>
                    )}
                    {planItems.map((item, i) => (
                      <li key={i} className="flex gap-2">
                        <span className="text-cyan">{i + 1}.</span>
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                )}
                {tab === "risks" && (
                  <ul className="space-y-1.5 text-xs text-slate-300">
                    {riskItems.length === 0 && (
                      <li className="text-slate-600">Nenhum risco listado.</li>
                    )}
                    {riskItems.map((item, i) => (
                      <li key={i} className="flex gap-2">
                        <span className="text-amber-400">•</span>
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                )}
                {tab === "checklist" && (
                  <ul className="space-y-1.5 text-xs text-slate-300">
                    {checklistItems.length === 0 && (
                      <li className="text-slate-600">Checklist vazio.</li>
                    )}
                    {checklistItems.map((item, i) => (
                      <li key={i} className="flex gap-2">
                        <span className="text-slate-500">☐</span>
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </>
          )}

          {Array.isArray(pkg.warnings) && pkg.warnings.length > 0 && (
            <ul className="mt-3 space-y-1 text-[11px] text-amber-200/90">
              {pkg.warnings.map((w, i) => (
                <li key={i}>⚠ {String(w)}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      {runs.length > 0 && (
        <div className="mt-5 border-t border-border pt-4">
          <p className="text-[11px] font-medium uppercase tracking-widest text-slate-500">
            Runs recentes
          </p>
          <ul className="mt-2 divide-y divide-border/60">
            {runs.map((r) => {
              const active = activeRunId === r.id;
              const story = storyTitleOf(r);
              const missionLabel = missionTitleOf(r.missionId, missions);
              return (
                <li key={r.id}>
                  <div
                    className={`flex w-full items-center gap-2 px-2 py-2.5 transition ${
                      active ? "bg-cyan/5" : "hover:bg-surface"
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => openRun(r)}
                      className="min-w-0 flex-1 text-left"
                    >
                      <p className="truncate text-xs font-medium text-slate-200">
                        {story}
                      </p>
                      <p className="mt-0.5 truncate text-[11px] text-slate-500">
                        {missionLabel} ·{" "}
                        {new Date(r.createdAt).toLocaleString()}
                      </p>
                    </button>
                    <span
                      className={`shrink-0 rounded-md px-2 py-0.5 text-[10px] font-medium ${
                        r.ready
                          ? "bg-emerald-500/15 text-emerald-300"
                          : "bg-amber-500/15 text-amber-200"
                      }`}
                    >
                      {r.ready ? "Pronto" : "Rascunho"}
                    </span>
                    <button
                      type="button"
                      title="Excluir run"
                      aria-label="Excluir run"
                      onClick={(e) => void deleteRun(r, e)}
                      className="shrink-0 rounded-md px-2 py-1 text-[10px] font-medium text-slate-500 transition hover:bg-red-500/10 hover:text-red-300"
                    >
                      Excluir
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </section>
  );
}
