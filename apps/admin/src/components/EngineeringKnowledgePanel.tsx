import { useEffect, useState } from "react";
import { api } from "../lib/api";
import type { Project } from "../lib/types";

type LinkRow = {
  id: string;
  fromId: string;
  toId: string;
  rel: string;
  score: number | null;
  status: "inferred" | "confirmed" | "rejected";
  fromTitle: string;
  toTitle: string;
  fromType: string;
  toType: string;
  fromUrl?: string;
  toUrl?: string;
};

const STORY_OS_STAGES = [
  { id: "understand", label: "Understand", ready: true },
  { id: "refine", label: "Refine", ready: true },
  { id: "impact", label: "Impact", ready: true },
  { id: "plan", label: "Plan", ready: true },
  { id: "execute", label: "Execute", ready: true },
] as const;

type StoryOsStageId = (typeof STORY_OS_STAGES)[number]["id"];
type FontesTab = "sync" | "links" | "enrichments" | "debug";

type EnrichmentRow = {
  id: string;
  subjectId: string;
  kind: string;
  payload: Record<string, unknown>;
  confidence: number;
  status: "proposed" | "confirmed" | "rejected";
  provider: string;
  model: string;
  evidence: Record<string, unknown>;
  updatedAt: string;
};

export function EngineeringKnowledgePanel({
  project,
  onProjectUpdate,
}: {
  project: Project;
  onProjectUpdate?: (p: Project) => void;
}) {
  const [stats, setStats] = useState<{
    entities: number;
    edges: number;
    enrichments?: number;
    sync: Array<{
      projection: string;
      lastSyncAt: string | null;
      cursor?: string | null;
      entityCount: number;
      edgeCount: number;
      lastError: string | null;
    }>;
  } | null>(null);
  const [githubToken, setGithubToken] = useState("");
  const [clickupToken, setClickupToken] = useState("");
  const [githubRepos, setGithubRepos] = useState("");
  const [fullSync, setFullSync] = useState(false);
  const [taskRef, setTaskRef] = useState("");
  const [stage, setStage] = useState<StoryOsStageId>("understand");
  const [discovery, setDiscovery] = useState<Record<string, unknown> | null>(
    null,
  );
  const [refine, setRefine] = useState<Record<string, unknown> | null>(null);
  const [impact, setImpact] = useState<Record<string, unknown> | null>(null);
  const [plan, setPlan] = useState<Record<string, unknown> | null>(null);
  const [execute, setExecute] = useState<Record<string, unknown> | null>(null);
  const [links, setLinks] = useState<LinkRow[]>([]);
  const [linkFilter, setLinkFilter] = useState<
    "inferred" | "confirmed" | "rejected" | "all"
  >("inferred");
  const [enrichments, setEnrichments] = useState<EnrichmentRow[]>([]);
  const [enrichFilter, setEnrichFilter] = useState<
    "proposed" | "confirmed" | "rejected" | "all"
  >("proposed");
  const [enrichReport, setEnrichReport] = useState<{
    used: boolean;
    note: string;
    created: number;
    skipped: number;
    processed: number;
  } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fontesTab, setFontesTab] = useState<FontesTab>("sync");

  useEffect(() => {
    setDiscovery(null);
    setRefine(null);
    setImpact(null);
    setPlan(null);
    setExecute(null);
    setError(null);
  }, [taskRef]);

  async function refresh() {
    const s = await api.knowledgeStats(project.id);
    setStats(s);
    const status = linkFilter === "all" ? undefined : linkFilter;
    const { links: rows } = await api.listKnowledgeLinks(project.id, {
      status,
      limit: 40,
    });
    setLinks(rows);
    const enStatus = enrichFilter === "all" ? undefined : enrichFilter;
    const { enrichments: enRows } = await api.listKnowledgeEnrichments(
      project.id,
      { status: enStatus, limit: 40 },
    );
    setEnrichments(enRows);
  }

  useEffect(() => {
    void refresh().catch((err) =>
      setError(err instanceof Error ? err.message : "Falha ao carregar"),
    );
  }, [project.id, linkFilter, enrichFilter]);

  async function sync(kind: "github" | "clickup" | "confluence") {
    setBusy(kind);
    setError(null);
    try {
      const token =
        kind === "github"
          ? githubToken.trim()
          : kind === "clickup"
            ? clickupToken.trim()
            : "";
      const scopes =
        kind === "github" && githubRepos.trim()
          ? githubRepos
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean)
          : undefined;
      await api.syncKnowledge(project.id, {
        kind,
        ...(token ? { token } : {}),
        scopes,
        full: fullSync,
      });
      await refresh();
      onProjectUpdate?.(project);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sync falhou");
    } finally {
      setBusy(null);
    }
  }

  async function relink() {
    setBusy("link");
    setError(null);
    try {
      await api.linkKnowledge(project.id);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Re-link falhou");
    } finally {
      setBusy(null);
    }
  }

  async function runUnderstand() {
    setBusy("understand");
    setError(null);
    setDiscovery(null);
    try {
      const result = await api.understandStory(project.id, taskRef.trim());
      setDiscovery(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Understand falhou");
    } finally {
      setBusy(null);
    }
  }

  async function runRefine() {
    setBusy("refine");
    setError(null);
    setRefine(null);
    try {
      const result = await api.refineStory(project.id, taskRef.trim());
      setRefine(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Refine falhou");
    } finally {
      setBusy(null);
    }
  }

  async function runImpact() {
    setBusy("impact");
    setError(null);
    setImpact(null);
    try {
      const result = await api.impactStory(project.id, taskRef.trim());
      setImpact(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Impact falhou");
    } finally {
      setBusy(null);
    }
  }

  async function runPlan() {
    setBusy("plan");
    setError(null);
    setPlan(null);
    try {
      const result = await api.planStory(project.id, taskRef.trim());
      setPlan(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Plan falhou");
    } finally {
      setBusy(null);
    }
  }

  async function runExecute() {
    setBusy("execute");
    setError(null);
    setExecute(null);
    try {
      const result = await api.executeContext(project.id, taskRef.trim());
      setExecute(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Execute falhou");
    } finally {
      setBusy(null);
    }
  }

  async function confirmLink(row: LinkRow) {
    setBusy(`confirm:${row.id}`);
    setError(null);
    try {
      await api.confirmKnowledgeLink(project.id, {
        fromId: row.fromId,
        toId: row.toId,
        rel: row.rel as "implements" | "related_to",
      });
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Confirmar falhou");
    } finally {
      setBusy(null);
    }
  }

  async function rejectLink(row: LinkRow) {
    setBusy(`reject:${row.id}`);
    setError(null);
    try {
      await api.rejectKnowledgeLink(project.id, {
        fromId: row.fromId,
        toId: row.toId,
        rel: row.rel as "implements" | "related_to",
      });
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Rejeitar falhou");
    } finally {
      setBusy(null);
    }
  }

  async function runEnrich() {
    setBusy("enrich");
    setError(null);
    setEnrichReport(null);
    try {
      const result = await api.enrichKnowledge(project.id, { limit: 40 });
      setEnrichReport({
        used: result.llm.used,
        note: result.llm.note,
        created: result.created,
        skipped: result.skipped,
        processed: result.processed,
      });
      setFontesTab("enrichments");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Enrich falhou");
    } finally {
      setBusy(null);
    }
  }

  async function confirmEnrichment(row: EnrichmentRow) {
    setBusy(`en-confirm:${row.id}`);
    setError(null);
    try {
      await api.confirmKnowledgeEnrichment(project.id, { id: row.id });
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Confirmar falhou");
    } finally {
      setBusy(null);
    }
  }

  async function rejectEnrichment(row: EnrichmentRow) {
    setBusy(`en-reject:${row.id}`);
    setError(null);
    try {
      await api.rejectKnowledgeEnrichment(project.id, { id: row.id });
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Rejeitar falhou");
    } finally {
      setBusy(null);
    }
  }

  const resolvedTaskBanner = (() => {
    const fromDiscovery = discovery?.resolvedTask as
      | { title?: string; externalId?: string }
      | undefined;
    const fromRefine = (
      refine?.understand as
        | { resolvedTask?: { title?: string; externalId?: string } }
        | undefined
    )?.resolvedTask;
    const fromImpact = (
      impact as {
        refine?: {
          understand?: { resolvedTask?: { title?: string; externalId?: string } };
        };
      }
    )?.refine?.understand?.resolvedTask;
    const rt = fromDiscovery ?? fromRefine ?? fromImpact;
    if (!rt?.title) {
      const obj = (execute as { context?: { objective?: string } } | null)
        ?.context?.objective;
      if (!obj) return null;
      return { title: obj, externalId: "" };
    }
    return { title: rt.title, externalId: rt.externalId ?? "" };
  })();

  const isEdge = project.connectionMode === "edge";
  const syncRows = stats?.sync ?? [];
  const githubSync = syncRows.find((s) => s.projection === "github");
  const clickupSync = syncRows.find((s) => s.projection === "clickup");

  return (
    <div className="rounded-2xl border border-border bg-surface-card p-5 card-glow sm:p-6">
      <div className="mb-4">
        <h2 className="text-lg font-semibold text-white">Knowledge Layer</h2>
        <p className="mt-1 text-sm text-slate-400">
          Sincronize fontes, revise links Task ↔ código e confirme enriquecimentos
          do Knowledge Builder. Tokens ficam na aba Edge
          {isEdge ? "." : " (ou cole no Sync em modo local)."}
        </p>
      </div>

      {stats && (
        <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-5">
          <div className="rounded-xl border border-border bg-surface px-3 py-2.5">
            <p className="text-[10px] uppercase tracking-widest text-slate-500">
              Fatos
            </p>
            <p className="mt-1 text-xl font-semibold text-white">
              {stats.entities}
            </p>
          </div>
          <div className="rounded-xl border border-border bg-surface px-3 py-2.5">
            <p className="text-[10px] uppercase tracking-widest text-slate-500">
              Relações
            </p>
            <p className="mt-1 text-xl font-semibold text-white">{stats.edges}</p>
          </div>
          <div className="rounded-xl border border-border bg-surface px-3 py-2.5">
            <p className="text-[10px] uppercase tracking-widest text-slate-500">
              Enrichments
            </p>
            <p className="mt-1 text-xl font-semibold text-white">
              {stats.enrichments ?? 0}
            </p>
          </div>
          <div className="rounded-xl border border-border bg-surface px-3 py-2.5">
            <p className="text-[10px] uppercase tracking-widest text-slate-500">
              GitHub
            </p>
            <p className="mt-1 text-xs text-slate-300">
              {githubSync?.lastSyncAt
                ? new Date(githubSync.lastSyncAt).toLocaleString()
                : "nunca"}
            </p>
          </div>
          <div className="rounded-xl border border-border bg-surface px-3 py-2.5">
            <p className="text-[10px] uppercase tracking-widest text-slate-500">
              ClickUp
            </p>
            <p className="mt-1 text-xs text-slate-300">
              {clickupSync?.lastSyncAt
                ? new Date(clickupSync.lastSyncAt).toLocaleString()
                : "nunca"}
            </p>
          </div>
        </div>
      )}

      <div className="mb-4 border-b border-border">
        <nav className="-mb-px flex flex-wrap gap-1">
          {(
            [
              ["sync", "Sync"],
              ["links", "Links"],
              ["enrichments", "Conhecimento"],
              ["debug", "Debug"],
            ] as const
          ).map(([id, label]) => {
            const active = fontesTab === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => setFontesTab(id)}
                className={`relative rounded-t-lg px-3 py-2 text-sm font-medium ${
                  active ? "text-cyan" : "text-slate-500 hover:text-slate-300"
                }`}
              >
                {label}
                {active && (
                  <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-cyan" />
                )}
              </button>
            );
          })}
        </nav>
      </div>

      {error && (
        <p className="mb-4 rounded-lg border border-red-500/20 bg-red-500/5 px-3 py-2 text-xs text-red-400">
          {error}
        </p>
      )}

      {fontesTab === "sync" && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-slate-500">
              {isEdge
                ? "Com Edge online, Sync usa os tokens do agente."
                : "Cole o token abaixo ou use o Edge."}
            </p>
            <label className="flex items-center gap-2 text-xs text-slate-400">
              <input
                type="checkbox"
                checked={fullSync}
                onChange={(e) => setFullSync(e.target.checked)}
                className="rounded border-border"
              />
              Full sync
            </label>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-xl border border-border bg-surface p-4">
              <p className="text-sm font-medium text-white">GitHub</p>
              <p className="mt-0.5 text-[11px] text-slate-500">
                Repos, PRs, commits → fatos
              </p>
              {!isEdge && (
                <input
                  type="password"
                  placeholder="ghp_…"
                  value={githubToken}
                  onChange={(e) => setGithubToken(e.target.value)}
                  className="mt-3 w-full rounded-lg border border-border bg-surface-card px-3 py-2 text-xs text-white"
                />
              )}
              <input
                placeholder="repos: org/a,org/b (opcional)"
                value={githubRepos}
                onChange={(e) => setGithubRepos(e.target.value)}
                className="mt-2 w-full rounded-lg border border-border bg-surface-card px-3 py-2 text-xs text-white"
              />
              {isEdge && (
                <details className="mt-2">
                  <summary className="cursor-pointer text-[11px] text-slate-500 hover:text-slate-300">
                    Token local (só se Edge não tiver)
                  </summary>
                  <input
                    type="password"
                    placeholder="ghp_…"
                    value={githubToken}
                    onChange={(e) => setGithubToken(e.target.value)}
                    className="mt-2 w-full rounded-lg border border-border bg-surface-card px-3 py-2 text-xs text-white"
                  />
                </details>
              )}
              {githubSync?.lastError && (
                <p className="mt-2 text-[11px] text-red-400">
                  {githubSync.lastError.slice(0, 120)}
                </p>
              )}
              <button
                type="button"
                disabled={busy === "github"}
                onClick={() => void sync("github")}
                className="mt-3 rounded-lg cyan-gradient px-3 py-2 text-xs font-semibold text-surface disabled:opacity-50"
              >
                {busy === "github" ? "Sincronizando…" : "Sync GitHub"}
              </button>
            </div>

            <div className="rounded-xl border border-border bg-surface p-4">
              <p className="text-sm font-medium text-white">ClickUp</p>
              <p className="mt-0.5 text-[11px] text-slate-500">
                Tasks / stories → fatos
              </p>
              {!isEdge && (
                <input
                  type="password"
                  placeholder="pk_…"
                  value={clickupToken}
                  onChange={(e) => setClickupToken(e.target.value)}
                  className="mt-3 w-full rounded-lg border border-border bg-surface-card px-3 py-2 text-xs text-white"
                />
              )}
              {isEdge && (
                <details className="mt-3">
                  <summary className="cursor-pointer text-[11px] text-slate-500 hover:text-slate-300">
                    Token local (só se Edge não tiver)
                  </summary>
                  <input
                    type="password"
                    placeholder="pk_…"
                    value={clickupToken}
                    onChange={(e) => setClickupToken(e.target.value)}
                    className="mt-2 w-full rounded-lg border border-border bg-surface-card px-3 py-2 text-xs text-white"
                  />
                </details>
              )}
              {clickupSync?.lastError && (
                <p className="mt-2 text-[11px] text-red-400">
                  {clickupSync.lastError.slice(0, 120)}
                </p>
              )}
              <button
                type="button"
                disabled={busy === "clickup"}
                onClick={() => void sync("clickup")}
                className="mt-3 rounded-lg cyan-gradient px-3 py-2 text-xs font-semibold text-surface disabled:opacity-50"
              >
                {busy === "clickup" ? "Sincronizando…" : "Sync ClickUp"}
              </button>
            </div>
          </div>
        </div>
      )}

      {fontesTab === "enrichments" && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-slate-500">
              Knowledge Builder: resumos e papéis propostos pelo LLM (ou
              heurística). Confirmados entram na Knowledge Layer e economizam
              tokens nas missões.
            </p>
            <div className="flex flex-wrap gap-1">
              {(
                ["proposed", "confirmed", "rejected", "all"] as const
              ).map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setEnrichFilter(f)}
                  className={`rounded px-2 py-1 text-[10px] uppercase tracking-wide ${
                    enrichFilter === f
                      ? "bg-cyan/20 text-cyan"
                      : "text-slate-500 hover:text-slate-300"
                  }`}
                >
                  {f === "proposed"
                    ? "pendentes"
                    : f === "confirmed"
                      ? "ok"
                      : f === "rejected"
                        ? "rejeitados"
                        : "todos"}
                </button>
              ))}
              <button
                type="button"
                disabled={busy === "enrich"}
                onClick={() => void runEnrich()}
                className="rounded-lg border border-border px-2 py-1 text-[10px] text-slate-300 hover:bg-surface disabled:opacity-50"
              >
                {busy === "enrich" ? "…" : "Enriquecer"}
              </button>
            </div>
          </div>

          <p className="text-[11px] text-slate-500">
            LLM do projeto:{" "}
            {project.llmConfig?.enabled === false ? (
              <span className="text-slate-400">desconectada</span>
            ) : (
              <>
                <span className="text-slate-300">
                  {project.llmConfig?.provider ?? "openai"}
                  {project.llmConfig?.model
                    ? ` / ${project.llmConfig.model}`
                    : ""}
                </span>
                {" · "}
                {project.llmConfig?.hasApiKey ? (
                  <span className="text-emerald-400">API key configurada</span>
                ) : (
                  <span className="text-amber-400">
                    sem key no projeto (usa .env da API, se houver)
                  </span>
                )}
              </>
            )}
            {" · "}
            configure em <span className="text-slate-400">Configuração</span>
          </p>

          {enrichReport && (
            <div
              className={`rounded-lg border px-3 py-2 text-xs ${
                enrichReport.used
                  ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-200"
                  : "border-amber-500/30 bg-amber-500/10 text-amber-100"
              }`}
            >
              <p className="font-medium">
                {enrichReport.used
                  ? "LLM usada nesta execução"
                  : "LLM não usada nesta execução"}
              </p>
              <p className="mt-1 opacity-90">{enrichReport.note}</p>
              <p className="mt-1 text-[11px] opacity-70">
                processados {enrichReport.processed} · criados{" "}
                {enrichReport.created} · ignorados {enrichReport.skipped}
              </p>
              <p className="mt-1 text-[11px] opacity-70">
                Em cada card: provider <code>openai</code>/… = API;{" "}
                <code>heuristic</code> = sem LLM.
              </p>
            </div>
          )}
          <div className="max-h-80 space-y-2 overflow-auto">
            {enrichments.length === 0 && (
              <p className="rounded-lg border border-dashed border-border px-3 py-6 text-center text-xs text-slate-600">
                Nenhum enrichment neste filtro. Rode Sync ou Enriquecer.
              </p>
            )}
            {enrichments.map((row) => {
              const summary =
                typeof row.payload.summary === "string"
                  ? row.payload.summary
                  : typeof row.payload.label === "string"
                    ? row.payload.label
                    : JSON.stringify(row.payload).slice(0, 160);
              const title = String(
                row.evidence.title ?? row.payload.label ?? row.subjectId,
              );
              return (
                <div
                  key={row.id}
                  className="rounded-lg border border-border bg-surface px-3 py-2"
                >
                  <p className="text-xs text-slate-200">{title}</p>
                  <p className="mt-0.5 text-[11px] text-slate-500">
                    {row.kind} · {row.status} · {row.provider}
                    {row.model && row.model !== "none" ? `/${row.model}` : ""} ·{" "}
                    {(row.confidence * 100).toFixed(0)}%
                  </p>
                  <p className="mt-1 text-xs text-slate-300">{summary}</p>
                  {row.status === "proposed" && (
                    <div className="mt-2 flex gap-2">
                      <button
                        type="button"
                        disabled={busy === `en-confirm:${row.id}`}
                        onClick={() => void confirmEnrichment(row)}
                        className="rounded bg-emerald-500/15 px-2 py-1 text-[11px] text-emerald-400 disabled:opacity-50"
                      >
                        Confirmar
                      </button>
                      <button
                        type="button"
                        disabled={busy === `en-reject:${row.id}`}
                        onClick={() => void rejectEnrichment(row)}
                        className="rounded bg-red-500/10 px-2 py-1 text-[11px] text-red-400 disabled:opacity-50"
                      >
                        Rejeitar
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {fontesTab === "links" && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-slate-500">
              Confirme ou rejeite vínculos. Rejeitados não voltam no Re-link.
            </p>
            <div className="flex flex-wrap gap-1">
              {(["inferred", "confirmed", "rejected", "all"] as const).map(
                (f) => (
                  <button
                    key={f}
                    type="button"
                    onClick={() => setLinkFilter(f)}
                    className={`rounded px-2 py-1 text-[10px] uppercase tracking-wide ${
                      linkFilter === f
                        ? "bg-cyan/20 text-cyan"
                        : "text-slate-500 hover:text-slate-300"
                    }`}
                  >
                    {f === "inferred"
                      ? "pendentes"
                      : f === "confirmed"
                        ? "ok"
                        : f === "rejected"
                          ? "rejeitados"
                          : "todos"}
                  </button>
                ),
              )}
              <button
                type="button"
                disabled={busy === "link"}
                onClick={() => void relink()}
                className="rounded-lg border border-border px-2 py-1 text-[10px] text-slate-300 hover:bg-surface disabled:opacity-50"
              >
                {busy === "link" ? "…" : "Re-link"}
              </button>
            </div>
          </div>
          <div className="max-h-80 space-y-2 overflow-auto">
            {links.length === 0 && (
              <p className="rounded-lg border border-dashed border-border px-3 py-6 text-center text-xs text-slate-600">
                Nenhum link neste filtro.
              </p>
            )}
            {links.map((row) => (
              <div
                key={row.id}
                className="rounded-lg border border-border bg-surface px-3 py-2"
              >
                <p className="text-xs text-slate-200">
                  <span className="text-slate-500">{row.fromType}</span>{" "}
                  {row.fromTitle}
                </p>
                <p className="mt-0.5 text-[11px] text-slate-500">
                  {row.rel}
                  {row.score != null ? ` · ${row.score.toFixed(2)}` : ""} ·{" "}
                  {row.status}
                </p>
                <p className="mt-0.5 text-xs text-slate-300">
                  <span className="text-slate-500">{row.toType}</span>{" "}
                  {row.toUrl ? (
                    <a
                      href={row.toUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-cyan hover:underline"
                    >
                      {row.toTitle}
                    </a>
                  ) : (
                    row.toTitle
                  )}
                </p>
                {row.status === "inferred" && (
                  <div className="mt-2 flex gap-2">
                    <button
                      type="button"
                      disabled={busy === `confirm:${row.id}`}
                      onClick={() => void confirmLink(row)}
                      className="rounded bg-emerald-500/15 px-2 py-1 text-[11px] text-emerald-400 disabled:opacity-50"
                    >
                      Confirmar
                    </button>
                    <button
                      type="button"
                      disabled={busy === `reject:${row.id}`}
                      onClick={() => void rejectLink(row)}
                      className="rounded bg-red-500/10 px-2 py-1 text-[11px] text-red-400 disabled:opacity-50"
                    >
                      Rejeitar
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {fontesTab === "debug" && (
        <div className="space-y-3">
          <p className="text-xs text-slate-500">
            Capability isolada. Para o pacote completo, use a aba{" "}
            <span className="text-cyan">Missões</span>.
          </p>
          <div className="flex flex-wrap gap-1.5">
            {STORY_OS_STAGES.map((s) => {
              const active = stage === s.id;
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setStage(s.id)}
                  className={`rounded-lg px-2.5 py-1.5 text-[11px] font-medium transition-colors ${
                    active
                      ? "bg-cyan/20 text-cyan"
                      : "text-slate-400 hover:bg-surface hover:text-slate-200"
                  }`}
                >
                  {s.label}
                </button>
              );
            })}
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            <input
              placeholder="História (ClickUp / título)"
              value={taskRef}
              onChange={(e) => setTaskRef(e.target.value)}
              className="min-w-0 flex-1 rounded-lg border border-border bg-surface px-3 py-2 text-xs text-white"
            />
            {stage === "understand" ? (
              <button
                type="button"
                disabled={!taskRef.trim() || busy === "understand"}
                onClick={() => void runUnderstand()}
                className="rounded-lg bg-white px-3 py-2 text-xs font-medium text-surface disabled:opacity-50"
              >
                {busy === "understand" ? "Analisando…" : "Rodar Understand"}
              </button>
            ) : stage === "refine" ? (
              <button
                type="button"
                disabled={!taskRef.trim() || busy === "refine"}
                onClick={() => void runRefine()}
                className="rounded-lg bg-white px-3 py-2 text-xs font-medium text-surface disabled:opacity-50"
              >
                {busy === "refine" ? "Refinando…" : "Rodar Refine"}
              </button>
            ) : stage === "impact" ? (
              <button
                type="button"
                disabled={!taskRef.trim() || busy === "impact"}
                onClick={() => void runImpact()}
                className="rounded-lg bg-white px-3 py-2 text-xs font-medium text-surface disabled:opacity-50"
              >
                {busy === "impact" ? "Analisando impacto…" : "Rodar Impact"}
              </button>
            ) : stage === "plan" ? (
              <button
                type="button"
                disabled={!taskRef.trim() || busy === "plan"}
                onClick={() => void runPlan()}
                className="rounded-lg bg-white px-3 py-2 text-xs font-medium text-surface disabled:opacity-50"
              >
                {busy === "plan" ? "Montando plano…" : "Rodar Plan"}
              </button>
            ) : (
              <button
                type="button"
                disabled={!taskRef.trim() || busy === "execute"}
                onClick={() => void runExecute()}
                className="rounded-lg bg-white px-3 py-2 text-xs font-medium text-surface disabled:opacity-50"
              >
                {busy === "execute" ? "Empacotando…" : "Rodar Execute"}
              </button>
            )}
          </div>

          {resolvedTaskBanner && (
            <p className="rounded-lg border border-border bg-surface px-3 py-2 text-[11px] text-slate-400">
              Task resolvida:{" "}
              <span className="text-slate-200">{resolvedTaskBanner.title}</span>
              {resolvedTaskBanner.externalId ? (
                <span className="text-slate-500">
                  {" "}
                  · {resolvedTaskBanner.externalId}
                </span>
              ) : null}
            </p>
          )}

          {stage === "understand" && discovery && (
            <pre className="max-h-96 overflow-auto rounded-xl border border-border bg-surface p-3 font-mono text-[11px] text-slate-300">
              {JSON.stringify(discovery, null, 2)}
            </pre>
          )}
          {stage === "refine" && refine && (
            <pre className="max-h-96 overflow-auto rounded-xl border border-border bg-surface p-3 font-mono text-[11px] text-slate-300">
              {JSON.stringify(refine, null, 2)}
            </pre>
          )}
          {stage === "impact" && impact && (
            <pre className="max-h-96 overflow-auto rounded-xl border border-border bg-surface p-3 font-mono text-[11px] text-slate-300">
              {JSON.stringify(impact, null, 2)}
            </pre>
          )}
          {stage === "plan" && plan && (
            <pre className="max-h-96 overflow-auto rounded-xl border border-border bg-surface p-3 font-mono text-[11px] text-slate-300">
              {JSON.stringify(plan, null, 2)}
            </pre>
          )}
          {stage === "execute" && execute && (
            <div className="space-y-2">
              {typeof execute.agentBrief === "string" && (
                <div className="rounded-xl border border-cyan/30 bg-cyan/5 px-3 py-3">
                  <div className="flex justify-between gap-2">
                    <p className="text-[10px] font-medium uppercase tracking-widest text-cyan">
                      Agent brief
                    </p>
                    <button
                      type="button"
                      className="rounded border border-border px-2 py-0.5 text-[10px] text-slate-300"
                      onClick={() => {
                        void navigator.clipboard.writeText(
                          String(execute.agentBrief),
                        );
                      }}
                    >
                      Copiar
                    </button>
                  </div>
                  <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap font-mono text-[11px] text-slate-300">
                    {String(execute.agentBrief)}
                  </pre>
                </div>
              )}
              <pre className="max-h-64 overflow-auto rounded-xl border border-border bg-surface p-3 font-mono text-[11px] text-slate-300">
                {JSON.stringify(execute, null, 2)}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
