import { extractCodeSymbols } from "./storyBody.js";
import type { DiscoveryResult } from "./discovery.js";
import type { RefineResult } from "./refine.js";
import {
  extractGithubRepo,
  parseApiEndpoints,
  parseDataModelNames,
  serviceKindFromRepo,
  shortServiceName,
  type ParsedApiRow,
} from "./impactParse.js";

export type ModuleImpactConfidence =
  | "linked"
  | "candidate"
  | "as_is"
  | "inferred";

export interface ModuleImpact {
  name: string;
  confidence: ModuleImpactConfidence;
  reason: string;
}

export interface ApiImpact extends ParsedApiRow {
  source: "story" | "dependency" | "inferred";
  /** Display line: "GET /api/v1/playbooks" */
  surface: string;
}

export type ServiceConfidence = "linked" | "evidence" | "inferred";

/** Microservice / deployable unit affected by the story. */
export interface AffectedService {
  /** Stable id — usually owner/repo */
  id: string;
  /** Human name (repo short name) */
  name: string;
  repository: string;
  kind: "api" | "web" | "worker" | "unknown";
  confidence: ServiceConfidence;
  reason: string;
  url?: string;
  /** Areas inside the service (files, symbols, domain folders) */
  areas: string[];
}

export interface ImpactResult {
  capabilityId: "eng_impact_analysis";
  stage: "impact";
  summary: string;
  /**
   * Primary answer: which microservices / repos will be touched.
   * Prefer this over inferred module labels.
   */
  affectedServices: AffectedService[];
  /** Typed blast radius for Plan/Execute. */
  blastRadius: {
    modules: ModuleImpact[];
    apis: ApiImpact[];
    dataModel: string[];
    asIsSymbols: string[];
    filesTouched: string[];
    repositories: string[];
  };
  similarPullRequests: DiscoveryResult["similarPullRequests"];
  similarCommits: DiscoveryResult["similarCommits"];
  driftRisks: string[];
  technicalDebt: string[];
  touchPoints: string[];
  /** True when there is enough signal to order work items. */
  readyForPlan: boolean;
  warnings: string[];
  mvp: string;
  refine: RefineResult;
}

function isFilePath(s: string): boolean {
  return /[\\/]|\.(ts|tsx|js|jsx|mjs|cjs|py|go|java|kt|cs|sql)$/i.test(s);
}

function apiSurface(row: ParsedApiRow): string {
  return row.method ? `${row.method} ${row.path}` : row.path;
}

function collectRepos(understand: DiscoveryResult): Map<
  string,
  { url?: string; from: string[]; confidence: ServiceConfidence }
> {
  const map = new Map<
    string,
    { url?: string; from: string[]; confidence: ServiceConfidence }
  >();

  const add = (
    repo: string | null,
    url: string | undefined,
    via: string,
    confidence: ServiceConfidence,
  ) => {
    if (!repo) return;
    const cur = map.get(repo) ?? { url, from: [], confidence };
    if (url && !cur.url) cur.url = url;
    if (!cur.from.includes(via)) cur.from.push(via);
    const rank = { linked: 0, evidence: 1, inferred: 2 };
    if (rank[confidence] < rank[cur.confidence]) cur.confidence = confidence;
    map.set(repo, cur);
  };

  for (const c of understand.similarCommits) {
    add(
      extractGithubRepo(c.url) ?? extractGithubRepo(c.id),
      c.url?.replace(/\/commit\/.*$/i, "") ?? undefined,
      `commit:${c.title}`,
      "evidence",
    );
  }
  // Only linked PRs here — soft-similar repos come via candidateRepositories (dominant only)
  for (const p of understand.similarPullRequests) {
    if (!p.linked) continue;
    add(
      extractGithubRepo(p.url) ?? extractGithubRepo(p.id),
      p.url?.replace(/\/pull\/\d+.*$/i, "") ?? undefined,
      `pr-linked:${p.title}`,
      "linked",
    );
  }
  for (const r of understand.candidateRepositories ?? []) {
    add(r.repository, r.url, r.via, r.confidence);
  }

  // Fallback ONLY when zero evidence and exactly one synced repo
  if (map.size === 0 && understand.projectRepositories?.length === 1) {
    const r = understand.projectRepositories[0]!;
    const repository =
      extractGithubRepo(r.url) ??
      extractGithubRepo(r.name) ??
      extractGithubRepo(r.id) ??
      (r.name.includes("/") ? r.name : null);
    add(
      repository,
      r.url,
      "project-sync:único repositório na KL",
      "inferred",
    );
  }

  return map;
}

/**
 * Story OS Impact — blast radius + affected microservices from Refine/Understand.
 * Deterministic. Does not invent Task↔PR links or extra repos.
 */
export function impactStory(refine: RefineResult): ImpactResult {
  const understand = refine.understand;
  const sections = understand.storySections ?? {};
  const asIsText = [sections.asIs, ...(understand.whatAlreadyExists ?? [])].join(
    "\n",
  );
  const asIsSymbols = [
    ...new Set([
      ...extractCodeSymbols(asIsText),
      ...extractCodeSymbols(sections.toBe ?? ""),
    ]),
  ].slice(0, 24);

  const repoMap = collectRepos(understand);
  const filesTouched = [
    ...new Set([
      ...asIsSymbols.filter(isFilePath),
      ...understand.similarCommits.map((c) => c.title).filter(isFilePath),
    ]),
  ].slice(0, 20);

  const areasFromSymbols = [
    ...new Set([
      ...filesTouched,
      ...asIsSymbols.filter((s) => /service|controller|handler|route/i.test(s)),
    ]),
  ].slice(0, 12);

  const affectedServices: AffectedService[] = [];
  for (const [repository, meta] of repoMap) {
    affectedServices.push({
      id: repository,
      name: shortServiceName(repository),
      repository,
      kind: serviceKindFromRepo(repository),
      confidence: meta.confidence,
      reason: meta.from.some((f) => f.startsWith("pr-linked:"))
        ? `PR vinculado na Knowledge Layer (${meta.from.filter((f) => f.startsWith("pr-linked:")).length} evidência(s))`
        : meta.from.some((f) => f.startsWith("repo-inventory:"))
          ? `Candidato por inventário de repos (confirmar): ${meta.from
              .filter((f) => f.startsWith("repo-inventory:"))
              .map((f) => f.replace(/^repo-inventory:/, ""))
              .join("; ")}`
          : meta.from.some((f) => f.startsWith("project-sync:"))
            ? meta.from[0]!.replace(/^project-sync:/, "Repositório do projeto (sync GitHub): ")
            : `Evidência na KL: ${meta.from
                .map((f) =>
                  f
                    .replace(/^(commit|pr-similar|pr-linked|commit-as-is|pr-as-is|related|repo-entity|repo-inventory):/, "")
                    .slice(0, 60),
                )
                .slice(0, 2)
                .join("; ")}`,
      url: meta.url ?? `https://github.com/${repository}`,
      areas: areasFromSymbols,
    });
  }

  // Prefer evidence order: linked → evidence → inferred
  affectedServices.sort((a, b) => {
    const rank = { linked: 0, evidence: 1, inferred: 2 };
    return rank[a.confidence] - rank[b.confidence] || a.name.localeCompare(b.name);
  });

  const modules: ModuleImpact[] = [];
  const seenMods = new Set<string>();

  for (const raw of understand.affectedModules) {
    const candidate = /^candidato:(.+)$/i.exec(raw);
    const name = (candidate?.[1] ?? raw).trim();
    if (!name || seenMods.has(name.toLowerCase())) continue;
    seenMods.add(name.toLowerCase());
    modules.push({
      name,
      confidence: candidate ? "candidate" : "linked",
      reason: candidate
        ? "Módulo candidato por palavra-chave (sem vínculo Task↔código confirmado)"
        : "Módulo via PR/commit vinculado na Knowledge Layer",
    });
  }

  for (const sym of asIsSymbols) {
    if (!isFilePath(sym)) continue;
    const base = sym.replace(/\\/g, "/").split("/").pop() ?? sym;
    const serviceArea = base.replace(/\.(js|ts|tsx|jsx)$/i, "");
    if (
      serviceArea &&
      !seenMods.has(serviceArea.toLowerCase()) &&
      /service|controller|handler/i.test(serviceArea)
    ) {
      seenMods.add(serviceArea.toLowerCase());
      modules.push({
        name: serviceArea,
        confidence: "as_is",
        reason: `Arquivo/símbolo AS-IS “${sym}”`,
      });
    }
    const parts = sym.replace(/\\/g, "/").split("/");
    const folder = parts.length > 1 ? parts[parts.length - 2]! : "";
    if (
      folder &&
      folder.length > 1 &&
      !/^(src|lib|app|apps|dist|test|tests)$/i.test(folder) &&
      !seenMods.has(folder.toLowerCase())
    ) {
      seenMods.add(folder.toLowerCase());
      modules.push({
        name: folder,
        confidence: "as_is",
        reason: `Derivado do caminho AS-IS “${sym}”`,
      });
    }
  }

  // Domain label only if we have zero services — never pretend it is an MS
  if (
    !affectedServices.length &&
    /reten|playbook|churn/i.test(understand.objective) &&
    !seenMods.has("retention")
  ) {
    modules.push({
      name: "Retention",
      confidence: "inferred",
      reason:
        "Domínio da história (não é microserviço) — confirme o repositório na KL",
    });
  }

  const apis: ApiImpact[] = [];
  const seenApi = new Set<string>();
  const pushApi = (
    row: ParsedApiRow,
    source: ApiImpact["source"],
  ) => {
    const surface = apiSurface(row);
    if (seenApi.has(surface)) return;
    seenApi.add(surface);
    apis.push({ ...row, surface, source });
  };

  for (const row of parseApiEndpoints(sections.api)) {
    pushApi(row, "story");
  }
  for (const d of understand.dependencies) {
    const m = /^API:\s*(.+)$/i.exec(d);
    if (!m) continue;
    const parsed = parseApiEndpoints(m[1]);
    if (parsed.length) {
      for (const row of parsed) pushApi(row, "dependency");
    } else if (!/table-embed/i.test(m[1]!)) {
      const pathMatch = m[1]!.match(/\/api\/[^\s|]+/);
      if (pathMatch) pushApi({ path: pathMatch[0]! }, "dependency");
    }
  }
  if (
    !apis.length &&
    /api|endpoint|rest|crud|swagger/i.test(
      `${understand.objective}\n${sections.toBe ?? ""}`,
    )
  ) {
    pushApi(
      { path: "/api/v1/…", description: "CRUD a detalhar no Plan a partir do TO-BE" },
      "inferred",
    );
  }

  const dataModelUnique = [
    ...new Set([
      ...parseDataModelNames(sections.dataModel),
      ...understand.dependencies
        .filter((d) => /^modelo:/i.test(d))
        .map((d) => d.replace(/^modelo:\s*/i, "").trim())
        .filter((t) => t && !/table-embed/i.test(t) && t.length < 80),
    ]),
  ].slice(0, 16);

  const driftRisks: string[] = [];
  for (const r of understand.risks) {
    if (/drift|hardcoded|migra|schema|diverg|legado|templates/i.test(r)) {
      driftRisks.push(r);
    }
  }
  if (asIsSymbols.length && sections.toBe) {
    driftRisks.push(
      "AS-IS com símbolos no código + TO-BE novo — risco de dois caminhos coexistirem até o cutover.",
    );
  }
  if (
    understand.similarPullRequests.some((p) => p.linked === false) &&
    (understand.linkConfidence === "none" || understand.linkConfidence === "low")
  ) {
    driftRisks.push(
      "PRs similares não vinculados — confirmar/rejeitar links antes de copiar padrões.",
    );
  }
  if (!refine.readyForImpact) {
    driftRisks.push(
      "Refine ainda incompleto — blast radius é preliminar até fechar aceite/escopo.",
    );
  }

  const technicalDebt = [...understand.technicalDebt];
  if (asIsSymbols.some((s) => /TemplatesFor|hardcoded/i.test(s))) {
    technicalDebt.push(
      "Templates/helpers citados no AS-IS precisam de boundary claro vs novo modelo de dados.",
    );
  }

  const repositories = affectedServices.map((s) => s.repository);

  const touchPoints = [
    ...affectedServices.map(
      (s) => `ms:${s.name} (${s.confidence}/${s.kind})`,
    ),
    ...apis.slice(0, 8).map((a) => `api:${a.surface}`),
    ...modules.slice(0, 6).map((m) => `módulo:${m.name} (${m.confidence})`),
    ...asIsSymbols.slice(0, 6).map((s) => `símbolo:${s}`),
    ...dataModelUnique.slice(0, 6).map((d) => `modelo:${d}`),
  ];

  const warnings: string[] = [];
  if (!affectedServices.length) {
    warnings.push(
      "Nenhum microserviço/repositório identificado nas evidências — rode sync GitHub ou confirme links Task↔PR.",
    );
  }
  if (!modules.length && !affectedServices.length) {
    warnings.push("Nenhum módulo identificado — Plan deve partir só do TO-BE/aceite.");
  }
  if (!refine.readyForImpact) {
    warnings.push(...refine.acceptanceGaps, ...refine.scopeGaps.slice(0, 2));
  }
  if (understand.linkConfidence === "none") {
    const fromInventory = affectedServices.some((s) =>
      s.reason.includes("inventário de repos"),
    );
    warnings.push(
      fromInventory
        ? "Sem vínculo Task↔código — MS alvo por inventário de repos (confirmar antes do PR)."
        : "Sem vínculo Task↔código — serviços listados só por evidência AS-IS/similaridade.",
    );
  }

  const readyForPlan =
    (affectedServices.length > 0 ||
      apis.some((a) => a.source !== "inferred") ||
      dataModelUnique.length > 0) &&
    Boolean(refine.mvp) &&
    (refine.readyForImpact ||
      Boolean(sections.toBe || sections.acceptance));

  const msNames = affectedServices.map((s) => s.name).join(", ");
  const summary = affectedServices.length
    ? `Impact: MS afetado(s): ${msNames}. ${apis.length} endpoint(s), ${dataModelUnique.length} tabela(s), ${asIsSymbols.length} símbolo(s) AS-IS.`
    : readyForPlan
      ? `Impact: sem repositório na KL — ${apis.length} API(s) e ${dataModelUnique.length} tabela(s) a partir da história; confirme o MS no sync GitHub.`
      : `Impact preliminar: sinal fraco — ${warnings.length} aviso(s).`;

  return {
    capabilityId: "eng_impact_analysis",
    stage: "impact",
    summary,
    affectedServices,
    blastRadius: {
      modules,
      apis,
      dataModel: dataModelUnique,
      asIsSymbols,
      filesTouched,
      repositories,
    },
    similarPullRequests: understand.similarPullRequests,
    similarCommits: understand.similarCommits,
    driftRisks: [...new Set(driftRisks)],
    technicalDebt: [...new Set(technicalDebt)],
    touchPoints,
    readyForPlan,
    warnings: [...new Set(warnings.filter(Boolean))],
    mvp: refine.mvp,
    refine,
  };
}
