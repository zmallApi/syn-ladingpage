import { useEffect, useState } from "react";
import { api } from "../lib/api";
import type {
  BusinessProfile,
  CapabilitiesAnalyzeResult,
  CapabilitySuggestion,
  Project,
} from "../lib/types";

const ROLE_OPTIONS = [
  "party",
  "event",
  "ledger",
  "catalog_item",
  "transaction",
  "line_item",
  "survey",
  "risk_snapshot",
  "location",
  "staff",
  "subscription",
  "lead",
  "contact",
  "unknown",
] as const;

export function CapabilitiesPanel({
  project,
  onProjectUpdate,
}: {
  project: Project;
  onProjectUpdate: (p: Project) => void | Promise<void>;
}) {
  const [profile, setProfile] = useState<BusinessProfile | null>(null);
  const [suggestions, setSuggestions] = useState<CapabilitySuggestion[]>([]);
  const [selected, setSelected] = useState<string[]>(project.activeCapabilities ?? []);
  const [analyzing, setAnalyzing] = useState(false);
  const [activating, setActivating] = useState(false);
  const [savingRoles, setSavingRoles] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [llmUsed, setLlmUsed] = useState(false);
  const [analyzed, setAnalyzed] = useState(false);
  const [draftOverrides, setDraftOverrides] = useState<Record<string, string>>(
    project.roleOverrides ?? {},
  );
  const [showRoles, setShowRoles] = useState(false);
  const [pack, setPack] = useState<CapabilitiesAnalyzeResult["suggestedPack"]>(null);
  const [previewCapId, setPreviewCapId] = useState<string | null>(null);
  const [previewJson, setPreviewJson] = useState<string | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);

  useEffect(() => {
    setSelected(project.activeCapabilities ?? []);
  }, [project.activeCapabilities]);

  useEffect(() => {
    setDraftOverrides(project.roleOverrides ?? {});
  }, [project.roleOverrides]);

  async function analyze() {
    setAnalyzing(true);
    setError(null);
    setSuccess(null);
    try {
      const result = await api.analyzeCapabilities(project.id);
      setProfile(result.profile);
      setSuggestions(result.suggestions);
      setLlmUsed(result.llmUsed);
      setAnalyzed(true);
      setPack(result.suggestedPack ?? null);
      setPreviewJson(null);
      setDraftOverrides(result.roleOverrides ?? project.roleOverrides ?? {});
      const availableIds = result.suggestions
        .filter((s) => s.available)
        .map((s) => s.id);
      const preferred = (project.activeCapabilities ?? []).filter((id) =>
        availableIds.includes(id),
      );
      setSelected(
        preferred.length
          ? preferred
          : result.suggestedPack?.capabilityIds?.length
            ? result.suggestedPack.capabilityIds
            : result.suggestions.filter((s) => s.available).slice(0, 4).map((s) => s.id),
      );
      setPickerOpen(true);
      setShowRoles(false);
      setPreviewJson(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha na análise");
    } finally {
      setAnalyzing(false);
    }
  }

  function toggle(id: string, available: boolean) {
    if (!available) return;
    setSuccess(null);
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  async function activate() {
    setActivating(true);
    setError(null);
    setSuccess(null);
    try {
      const updated = await api.setCapabilities(project.id, selected);
      await onProjectUpdate(updated);
      const names = (updated.activeCapabilities ?? []).map((id) => `cap_${id}`);
      setSuccess(
        names.length
          ? `Ativadas no MCP: ${names.join(", ")}`
          : "Nenhuma capacidade ativa (seleção vazia salva).",
      );
      setPickerOpen(false);
      setShowRoles(false);
      setPreviewJson(null);
      setPreviewCapId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao ativar");
    } finally {
      setActivating(false);
    }
  }

  async function saveRoleOverrides() {
    setSavingRoles(true);
    setError(null);
    setSuccess(null);
    try {
      const cleaned: Record<string, string> = {};
      for (const [resource, role] of Object.entries(draftOverrides)) {
        if (role && role !== "unknown") cleaned[resource] = role;
      }
      const result = await api.setRoleOverrides(project.id, cleaned);
      await onProjectUpdate(result.project);
      setProfile(result.profile);
      setSuggestions(result.suggestions);
      setAnalyzed(true);
      setSuccess("Papéis atualizados — sugestões recalculadas.");
      setPickerOpen(true);
      setShowRoles(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao salvar papéis");
    } finally {
      setSavingRoles(false);
    }
  }

  async function applyPack() {
    if (!pack?.capabilityIds?.length) return;
    setSelected(pack.capabilityIds);
    setSuccess(`Pack “${pack.title}” selecionado — clique em Ativar para publicar no MCP.`);
  }

  async function preview(capId: string) {
    setPreviewing(true);
    setPreviewCapId(capId);
    setError(null);
    try {
      const res = await api.previewCapability(project.id, capId);
      setPreviewJson(JSON.stringify(res.result, null, 2));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha no preview");
      setPreviewJson(null);
    } finally {
      setPreviewing(false);
    }
  }

  const busy = analyzing || activating || savingRoles || previewing;
  const activeSet = new Set(project.activeCapabilities ?? []);
  const selectionMatchesActive =
    selected.length === activeSet.size &&
    selected.every((id) => activeSet.has(id));

  const roleRows =
    profile?.resourceRoles
      ?.filter((r) => r.confidence > 0 || draftOverrides[r.resource])
      .slice()
      .sort((a, b) => a.resource.localeCompare(b.resource)) ?? [];

  if (!project.exposedResources.length) {
    return (
      <div className="rounded-2xl border border-dashed border-border bg-surface-card/50 p-5">
        <p className="text-xs font-medium uppercase tracking-widest text-cyan">
          Ferramentas de IA
        </p>
        <p className="mt-2 text-sm text-slate-400">
          Exponha recursos no wizard antes de analisar o negócio e ativar tools.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-border bg-surface-card p-4 card-glow sm:p-5">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-widest text-cyan">
            Ferramentas de IA
          </p>
          <h2 className="mt-1 text-sm font-semibold text-white">
            Capacidades de negócio
          </h2>
          <p className="mt-1 text-xs text-slate-500">
            Papéis genéricos (party, event, ledger…) — você confirma o que entra no MCP.
          </p>
        </div>
        <button
          type="button"
          disabled={busy}
          onClick={analyze}
          className="rounded-xl cyan-gradient px-4 py-2 text-xs font-semibold text-surface disabled:opacity-50"
        >
          {analyzing
            ? "Analisando..."
            : analyzed
              ? "Reanalisar negócio"
              : "Analisar negócio"}
        </button>
      </div>

      {error && (
        <p className="mb-3 rounded-lg border border-red-500/20 bg-red-500/5 px-3 py-2 text-xs text-red-400">
          {error}
        </p>
      )}

      {success && (
        <p className="mb-3 rounded-lg border border-green/30 bg-green/10 px-3 py-2 text-xs text-green">
          {success}
        </p>
      )}

      {(project.activeCapabilities?.length ?? 0) > 0 && !pickerOpen && (
        <div className="mb-3">
          <p className="text-xs text-slate-400">
            Já ativas no MCP:{" "}
            <span className="font-mono text-cyan">
              {project.activeCapabilities.map((id) => `cap_${id}`).join(", ")}
            </span>
          </p>
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              if (suggestions.length > 0) setPickerOpen(true);
              else void analyze();
            }}
            className="mt-2 text-xs text-cyan hover:underline disabled:opacity-50"
          >
            Alterar capacidades →
          </button>
        </div>
      )}

      {profile && pickerOpen && (
        <div className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-border bg-surface px-3 py-2 text-xs">
          <span className="text-slate-500">Domínio</span>
          <span className="font-mono text-cyan">{profile.domain}</span>
          <span className="text-slate-600">·</span>
          <span className="text-slate-500">confiança</span>
          <span className="font-mono text-slate-300">
            {Math.round(profile.confidence * 100)}%
          </span>
          {llmUsed && (
            <span className="rounded border border-green/30 bg-green/10 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-green">
              LLM
            </span>
          )}
          <button
            type="button"
            className="ml-auto text-[11px] text-cyan hover:underline"
            onClick={() => setShowRoles((v) => !v)}
          >
            {showRoles ? "Ocultar papéis" : "Corrigir papéis"}
          </button>
        </div>
      )}

      {pack && analyzed && pickerOpen && (
        <div className="mb-4 rounded-xl border border-cyan/30 bg-cyan/5 px-3 py-3">
          <p className="text-xs font-medium text-cyan">Pack sugerido</p>
          <p className="mt-1 text-sm font-semibold text-white">{pack.title}</p>
          <p className="mt-0.5 text-xs text-slate-400">{pack.description}</p>
          <p className="mt-1 text-[11px] text-slate-500">{pack.reason}</p>
          <p className="mt-1 font-mono text-[10px] text-slate-500">
            {pack.capabilityIds.map((id) => `cap_${id}`).join(", ")}
          </p>
          <button
            type="button"
            disabled={busy}
            onClick={applyPack}
            className="mt-2 rounded-lg border border-cyan/40 px-3 py-1.5 text-xs font-semibold text-cyan hover:bg-cyan/10 disabled:opacity-50"
          >
            Selecionar pack
          </button>
        </div>
      )}

      {profile && showRoles && pickerOpen && (
        <div className="mb-4 rounded-xl border border-border bg-surface p-3">
          <p className="mb-2 text-[11px] text-slate-500">
            Override manual por tabela (genérico — não amarra a um cliente).
          </p>
          <div className="max-h-56 space-y-1.5 overflow-auto">
            {roleRows.map((r) => {
              const value = draftOverrides[r.resource] ?? r.role;
              return (
                <div
                  key={r.resource}
                  className="flex flex-wrap items-center gap-2 text-xs"
                >
                  <span className="min-w-0 flex-1 font-mono text-slate-300">
                    {r.resource}
                  </span>
                  <span className="text-[10px] text-slate-600">
                    {r.inferred === false
                      ? "manual"
                      : `${Math.round(r.confidence * 100)}%`}
                  </span>
                  <select
                    className="rounded-lg border border-border bg-surface-card px-2 py-1 text-[11px] text-slate-200"
                    value={value}
                    disabled={busy}
                    onChange={(e) => {
                      const next = e.target.value;
                      setDraftOverrides((prev) => {
                        const copy = { ...prev };
                        if (next === r.role && r.inferred !== false) {
                          delete copy[r.resource];
                        } else {
                          copy[r.resource] = next;
                        }
                        return copy;
                      });
                    }}
                  >
                    {ROLE_OPTIONS.map((opt) => (
                      <option key={opt} value={opt}>
                        {opt}
                      </option>
                    ))}
                  </select>
                </div>
              );
            })}
          </div>
          <button
            type="button"
            disabled={busy}
            onClick={saveRoleOverrides}
            className="mt-3 w-full rounded-xl border border-cyan/40 py-2 text-xs font-semibold text-cyan hover:bg-cyan/10 disabled:opacity-50"
          >
            {savingRoles ? "Salvando papéis..." : "Salvar papéis e recalcular"}
          </button>
        </div>
      )}

      {suggestions.length > 0 && pickerOpen && (
        <div className="space-y-2">
          {suggestions.map((s) => {
            const checked = selected.includes(s.id);
            const isActive = activeSet.has(s.id);
            return (
              <label
                key={s.id}
                className={`flex cursor-pointer items-start gap-3 rounded-xl border px-3 py-2.5 transition ${
                  !s.available
                    ? "border-border opacity-50"
                    : checked
                      ? "border-cyan/40 bg-cyan/10"
                      : "border-border bg-surface hover:border-border-bright"
                }`}
              >
                <input
                  type="checkbox"
                  className="mt-1"
                  disabled={!s.available || busy}
                  checked={checked}
                  onChange={() => toggle(s.id, s.available)}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-medium text-white">{s.title}</p>
                    <span className="font-mono text-[10px] text-slate-500">
                      cap_{s.id}
                    </span>
                    {isActive && (
                      <span className="rounded border border-green/30 bg-green/10 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-green">
                        Ativa
                      </span>
                    )}
                    {s.kind === "playbook" && (
                      <span className="rounded border border-cyan/30 bg-cyan/10 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-cyan">
                        Playbook
                      </span>
                    )}
                    {!s.available && (
                      <span className="rounded border border-border bg-surface px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-slate-500">
                        Indisponível
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 text-xs text-slate-400">{s.description}</p>
                  {s.reason && (
                    <p className="mt-1 text-[11px] text-amber">{s.reason}</p>
                  )}
                  {s.available && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        void preview(s.id);
                      }}
                      className="mt-1 text-[11px] text-cyan hover:underline disabled:opacity-50"
                    >
                      {previewing && previewCapId === s.id
                        ? "Preview..."
                        : "Preview"}
                    </button>
                  )}
                </div>
              </label>
            );
          })}

          {previewJson && (
            <div className="mt-3 rounded-xl border border-border bg-surface p-3">
              <div className="mb-1 flex items-center justify-between gap-2">
                <p className="text-[11px] uppercase tracking-widest text-slate-500">
                  Preview {previewCapId ? `cap_${previewCapId}` : ""}
                </p>
                <button
                  type="button"
                  className="text-[11px] text-slate-500 hover:text-slate-300"
                  onClick={() => setPreviewJson(null)}
                >
                  Fechar
                </button>
              </div>
              <pre className="max-h-48 overflow-auto font-mono text-[11px] leading-relaxed text-slate-300 whitespace-pre-wrap break-words">
                {previewJson}
              </pre>
            </div>
          )}

          <button
            type="button"
            disabled={busy || selected.length === 0}
            onClick={activate}
            className="mt-3 w-full rounded-xl cyan-gradient py-2.5 text-sm font-semibold text-surface disabled:opacity-50"
          >
            {activating
              ? "Ativando..."
              : selectionMatchesActive
                ? `Já ativas — salvar de novo (${selected.length})`
                : `Ativar selecionadas (${selected.length})`}
          </button>
        </div>
      )}
    </div>
  );
}
