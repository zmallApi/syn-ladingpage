import type { CanonicalEdge, CanonicalEntity } from "./types.js";
import { isSoftSimilarPr } from "./similarity.js";
import { parseStoryBody, type ParsedStoryBody } from "./storyBody.js";
import { repoFromEntity } from "./impactParse.js";

export interface DiscoveryInput {
  task: CanonicalEntity;
  related: CanonicalEntity[];
  edges: CanonicalEdge[];
}

export interface DiscoveryResult {
  summary: string;
  objective: string;
  whatAlreadyExists: string[];
  dependencies: string[];
  affectedModules: string[];
  similarPullRequests: Array<{
    id: string;
    title: string;
    url?: string;
    score?: number;
    linked?: boolean;
  }>;
  similarCommits: Array<{ id: string; title: string; url?: string }>;
  relatedDocuments: Array<{ id: string; title: string; url?: string }>;
  risks: string[];
  technicalDebt: string[];
  checklist: string[];
  openQuestions: string[];
  evidenceIds: string[];
  linkConfidence: "none" | "low" | "medium" | "high";
  /** Structured sections parsed from the task body (for LLM / UI). */
  storySections?: ParsedStoryBody["sections"];
  /** Which KL task was resolved from taskRef (set by Context Engine). */
  resolvedTask?: {
    id: string;
    title: string;
    externalId: string;
    url?: string;
    matchScore?: number;
  };
  /**
   * Repos inferred from related KL entities (PR/Commit/Repository).
   * Used by Impact when URLs are missing but canonical ids carry owner/repo.
   */
  candidateRepositories?: Array<{
    repository: string;
    url?: string;
    via: string;
    confidence: "linked" | "evidence" | "inferred";
  }>;
  /** Repositories synced on the project (GitHub Projection). */
  projectRepositories?: Array<{
    id: string;
    name: string;
    url?: string;
  }>;
}

const NOISE_MODULES = new Set([
  "docs",
  "doc",
  "tests",
  "test",
  "config",
  "db",
  "src",
  "lib",
  "app",
  "apps",
  "dist",
  "build",
  "node",
  "modules",
  "workflows",
  "workflow",
  "terraform",
  "migrations",
  "migration",
  "scripts",
  "script",
  "public",
  "assets",
  "types",
  "utils",
  "helpers",
  "common",
  "shared",
]);

function connected(
  taskId: string,
  edges: CanonicalEdge[],
  type: CanonicalEntity["type"],
  byId: Map<string, CanonicalEntity>,
  minScore = 0,
): CanonicalEntity[] {
  const out: CanonicalEntity[] = [];
  for (const e of edges) {
    if ((e.score ?? 1) < minScore) continue;
    const other =
      e.fromId === taskId ? e.toId : e.toId === taskId ? e.fromId : null;
    if (!other) continue;
    const ent = byId.get(other);
    if (ent?.type === type) out.push(ent);
  }
  return [...new Map(out.map((e) => [e.id, e])).values()];
}

function textHints(task: CanonicalEntity) {
  const t = `${task.title}\n${task.text}`.toLowerCase();
  return {
    auth: /\b(auth|oauth|login|sso|jwt)\b/.test(t),
    payment: /\b(pay|billing|invoice|stripe)\b/.test(t),
    migration: /(migrat|schema|database|\bsql\b|migration)/i.test(t),
    api: /\b(api|endpoint|rest|graphql|crud|swagger|openapi)\b/.test(t),
    ui: /\b(ui|frontend|react|page|screen)\b/.test(t),
    retention: /(reten|churn|cancel|playbook)/i.test(t),
    crud: /(cadastro|crud|\bcriar\b|\beditar\b|\blistar\b)/i.test(t),
    messaging: /(whatsapp|sms|email|notif|mensagem|canal)/i.test(t),
  };
}

function isUsefulModule(name: string) {
  return !NOISE_MODULES.has(name.toLowerCase());
}

function entityMentionsSymbol(ent: CanonicalEntity, symbols: string[]): boolean {
  const hay = `${ent.title}\n${ent.text}`.toLowerCase();
  return symbols.some((s) => hay.includes(s.toLowerCase()));
}

/**
 * Template-based Discovery (no LLM) — facts + story body → structured briefing.
 */
export function discoverStory(input: DiscoveryInput): DiscoveryResult {
  const byId = new Map(input.related.map((e) => [e.id, e]));
  byId.set(input.task.id, input.task);

  const story = parseStoryBody(input.task.text);
  const implementsEdges = input.edges.filter(
    (e) => e.rel === "implements" && e.status !== "rejected",
  );
  const prs = connected(input.task.id, implementsEdges, "PullRequest", byId, 0.5);
  const commits = connected(
    input.task.id,
    input.edges.filter(
      (e) => e.rel === "related_to" && e.status !== "rejected",
    ),
    "Commit",
    byId,
    0.5,
  ).slice(0, 15);

  const greenfield = prs.length === 0 && commits.length === 0;

  const linkedModuleIds = new Set(
    [
      ...connected(input.task.id, input.edges, "Module", byId),
      ...prs.flatMap((pr) => connected(pr.id, input.edges, "Module", byId)),
      ...commits.flatMap((c) => connected(c.id, input.edges, "Module", byId)),
    ]
      .filter((m) => isUsefulModule(m.title))
      .map((m) => m.id),
  );

  const modulesRaw = [
    ...connected(input.task.id, input.edges, "Module", byId),
    ...prs.flatMap((pr) => connected(pr.id, input.edges, "Module", byId)),
    ...commits.flatMap((c) => connected(c.id, input.edges, "Module", byId)),
  ].filter((m) => isUsefulModule(m.title));
  const uniqueModules = [
    ...new Map(modulesRaw.map((m) => [m.id, m])).values(),
  ].slice(0, 8);

  const candidateModules = greenfield
    ? input.related
        .filter(
          (e) =>
            e.type === "Module" &&
            isUsefulModule(e.title) &&
            !linkedModuleIds.has(e.id),
        )
        .slice(0, 6)
    : [];

  const docs = input.related.filter((e) => e.type === "Document");

  const similarPrs = input.related
    .filter((e) => e.type === "PullRequest" && !prs.some((p) => p.id === e.id))
    .map((pr) => {
      const soft = isSoftSimilarPr(input.task.title, pr.title, greenfield);
      return { pr, score: soft.score, hits: soft.hits, ok: soft.ok };
    })
    .filter((x) => x.ok)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);

  const asIsEvidence = input.related
    .filter(
      (e) =>
        (e.type === "Commit" || e.type === "PullRequest" || e.type === "Module") &&
        story.codeSymbols.length > 0 &&
        entityMentionsSymbol(e, story.codeSymbols) &&
        !prs.some((p) => p.id === e.id) &&
        !commits.some((c) => c.id === e.id),
    )
    .slice(0, 8);

  const hints = textHints(input.task);
  const whatAlreadyExists: string[] = [];

  if (story.sections.userStory) {
    const us =
      story.bullets.userStory?.slice(0, 3).join(" · ") ||
      story.sections.userStory.split(/\n/).filter(Boolean).slice(0, 3).join(" · ");
    if (us) whatAlreadyExists.push(`User story: ${us}`);
  }

  for (const b of story.bullets.asIs ?? []) {
    whatAlreadyExists.push(`AS-IS: ${b}`);
  }
  if (!story.bullets.asIs?.length && story.sections.asIs) {
    whatAlreadyExists.push(
      `AS-IS: ${story.sections.asIs.split(/\n/).filter(Boolean)[0]!.slice(0, 180)}`,
    );
  }

  if (prs.length) {
    whatAlreadyExists.push(
      `${prs.length} PR(s) com evidência de vínculo: ${prs.map((p) => p.title).join("; ")}`,
    );
  }
  if (commits.length) {
    whatAlreadyExists.push(
      `${commits.length} commit(s) citando o ID/chave da task`,
    );
  }
  if (uniqueModules.length) {
    whatAlreadyExists.push(
      `Módulos via PRs/commits vinculados: ${uniqueModules.map((m) => m.title).join(", ")}`,
    );
  }

  if (asIsEvidence.length) {
    whatAlreadyExists.push(
      `Evidência KL para símbolos do AS-IS (${story.codeSymbols.slice(0, 4).join(", ")}): ${asIsEvidence
        .map((e) => e.title)
        .join("; ")}`,
    );
  }

  if (greenfield && !story.hasStructuredBody) {
    whatAlreadyExists.push(
      "História nova / sem implementação vinculada na Knowledge Layer — use este briefing para refinar aceite, escopo e riscos antes de executar.",
    );
  } else if (greenfield && story.hasStructuredBody) {
    whatAlreadyExists.push(
      "Sem PR/commit vinculado à task — briefing montado a partir do corpo da história (+ evidência KL dos símbolos AS-IS, se houver).",
    );
  }

  if (similarPrs.length) {
    whatAlreadyExists.push(
      `${similarPrs.length} PR(s) com similaridade de domínio (não vinculados) — inspecionar e confirmar na UI se forem relevantes.`,
    );
  }
  if (candidateModules.length) {
    whatAlreadyExists.push(
      `Módulos candidatos por palavra-chave (hipótese): ${candidateModules.map((m) => m.title).join(", ")}`,
    );
  }

  if (!whatAlreadyExists.length) {
    whatAlreadyExists.push(
      "Nenhum PR/commit com vínculo confiável. Use o ID da task no branch/título/commit (ex.: 86e200kcz ou CU-123).",
    );
  }

  const risks: string[] = [];
  const technicalDebt: string[] = [];
  const openQuestions: string[] = [];
  const checklist: string[] = ["Observabilidade"];
  const candidateDeps: string[] = [];

  const hasAcceptance = Boolean(
    story.sections.acceptance || story.bullets.acceptance?.length,
  );
  const hasTests = Boolean(story.sections.tests || story.bullets.tests?.length);
  const hasApi = Boolean(story.sections.api || story.bullets.api?.length);
  const hasOutOfScope = Boolean(
    story.sections.outOfScope || story.bullets.outOfScope?.length,
  );

  if (hasAcceptance) {
    for (const b of story.bullets.acceptance ?? []) {
      checklist.push(b);
    }
  } else {
    checklist.push("Critérios de aceite");
  }
  if (hasTests) {
    for (const b of story.bullets.tests ?? []) {
      checklist.push(`Teste: ${b}`);
    }
  } else {
    checklist.push("Testes");
  }

  for (const b of story.bullets.toBe ?? []) {
    candidateDeps.push(`TO-BE: ${b}`);
  }
  for (const b of story.bullets.dataModel ?? []) {
    candidateDeps.push(`modelo: ${b}`);
  }
  for (const b of story.bullets.api ?? []) {
    candidateDeps.push(`API: ${b}`);
  }
  for (const b of story.bullets.seed ?? []) {
    candidateDeps.push(`seed: ${b}`);
  }
  for (const b of story.bullets.rules ?? []) {
    checklist.push(`Regra: ${b}`);
  }
  if (story.sections.outOfScope) {
    whatAlreadyExists.push(
      `Fora de escopo: ${(story.bullets.outOfScope ?? story.sections.outOfScope.split(/\n/).filter(Boolean).slice(0, 4)).join("; ")}`,
    );
  }

  if (story.codeSymbols.length) {
    technicalDebt.push(
      `AS-IS cita lógica/templates no código (${story.codeSymbols.slice(0, 5).join(", ")}) — migrar para dados sem deixar o caminho antigo divergir.`,
    );
    risks.push(
      "Risco de drift: templates ainda hardcoded enquanto o CRUD de playbooks sobe.",
    );
  }

  if (hints.auth) {
    risks.push("Mudança em autenticação pode impactar sessões existentes.");
    if (!story.sections.api) {
      openQuestions.push("Qual o provedor OAuth e escopos necessários?");
    }
    checklist.push("Segurança / autenticação");
    if (greenfield) {
      candidateDeps.push("candidato: serviço de autenticação / sessão");
    }
  }
  if (hints.migration || /migration|playbooks|playbook_actions/i.test(input.task.text)) {
    if (!risks.some((r) => /migração|schema/i.test(r))) {
      risks.push("Pode exigir migração de schema ou backfill.");
    }
    if (!hasAcceptance) {
      openQuestions.push("Estratégia de migração e rollback?");
    }
    checklist.push("Migração");
  }
  if (hints.payment) {
    risks.push("Fluxo financeiro sensível — validar idempotência e reconciliação.");
    checklist.push("Feature Flag");
  }
  if (hints.api || hasApi) {
    if (!hasApi) {
      openQuestions.push("Contrato da API (request/response) está documentado?");
    }
    checklist.push("APIs");
  }
  if (hints.ui) {
    openQuestions.push("Existem estados de loading/erro/empty definidos?");
  }
  if (hints.crud && !story.sections.dataModel) {
    checklist.push("Modelo de dados / CRUD");
    openQuestions.push("Quais entidades e campos mínimos do cadastro?");
    if (greenfield) {
      candidateDeps.push("candidato: API de persistência / store do domínio");
    }
  }
  if (hints.messaging) {
    risks.push("Falha ou duplicidade no canal de mensagem pode gerar spam ou perda de ação.");
    checklist.push("Canal de comunicação");
  }
  if (hints.retention) {
    checklist.push("Regras de negócio / playbook");
    if (!story.hasStructuredBody) {
      openQuestions.push("Quais gatilhos disparam o playbook de retenção?");
      openQuestions.push("Quais ações são automáticas vs manuais?");
    }
    if (greenfield && !story.codeSymbols.length) {
      risks.push(
        "Ação automática de retenção mal configurada pode contatar aluno/cliente indevidamente.",
      );
      technicalDebt.push(
        "Playbooks hardcoded vs motor de regras — decidir boundary antes de espalhar ifs no código.",
      );
    }
  }

  if (!prs.length && !asIsEvidence.length) {
    openQuestions.push("Já existe implementação parcial em outro repositório?");
  }
  if (!hasAcceptance) {
    openQuestions.push("Critérios de aceite estão explícitos na história?");
  }
  if (greenfield && !story.hasStructuredBody) {
    openQuestions.push("Qual o menor incremento entregável (MVP) desta história?");
    openQuestions.push("Quem valida o aceite de negócio antes do merge?");
  }
  if (!hasOutOfScope && story.hasStructuredBody) {
    openQuestions.push("O fora de escopo (P1b/P1c etc.) está alinhado com o time?");
  }

  if (!story.sections.seed && /seed|retenção padrão/i.test(input.task.text)) {
    openQuestions.push("O seed do playbook nativo cobre as 14 ações atuais?");
  }

  openQuestions.push("Estratégia de rollback?");
  openQuestions.push("Feature Flag necessária?");
  openQuestions.push("Observabilidade (logs/métricas/traces)?");

  if (uniqueModules.length > 5) {
    technicalDebt.push(
      "Histórico vinculado toca muitos módulos — revisar boundary antes de implementar.",
    );
  }
  if (similarPrs.length && greenfield) {
    technicalDebt.push(
      "Há PRs com similaridade de domínio sem vínculo — confirme ou rejeite na UI de links antes de executar.",
    );
  }

  const linkConfidence =
    prs.length >= 1 || commits.length >= 1
      ? prs.some((p) =>
          implementsEdges.some(
            (e) =>
              (e.fromId === input.task.id && e.toId === p.id) ||
              (e.toId === input.task.id && e.fromId === p.id),
          ) &&
          (implementsEdges.find((e) => e.toId === p.id || e.fromId === p.id)
            ?.score ?? 0) >= 0.9,
        )
        ? "high"
        : "medium"
      : similarPrs.length || asIsEvidence.length
        ? "low"
        : "none";

  const shownModules = greenfield
    ? [
        ...uniqueModules,
        ...candidateModules.filter((m) => !uniqueModules.some((u) => u.id === m.id)),
      ].slice(0, 8)
    : uniqueModules;

  const asIsCommits = asIsEvidence.filter((e) => e.type === "Commit");
  const asIsPrs = asIsEvidence.filter((e) => e.type === "PullRequest");

  const evidenceIds = [
    ...new Set([
      input.task.id,
      ...prs.map((p) => p.id),
      ...commits.map((c) => c.id),
      ...shownModules.map((m) => m.id),
      ...similarPrs.map((s) => s.pr.id),
      ...asIsEvidence.map((e) => e.id),
    ]),
  ];

  const dependencies = [
    ...uniqueModules.map((m) => `Módulo ${m.title}`),
    ...prs.map((p) => `PR ${p.title}`),
    ...candidateDeps,
    ...(greenfield
      ? candidateModules.map((m) => `candidato: módulo ${m.title}`)
      : []),
  ];

  const sectionCount = Object.keys(story.sections).length;

  return {
    summary: story.hasStructuredBody
      ? `Discovery de “${input.task.title}”: ${sectionCount} seção(ões) da história, ${prs.length} PR(s) vinculados, ${asIsEvidence.length} evidência(s) AS-IS na KL, confiança ${linkConfidence}.`
      : greenfield
        ? `Discovery greenfield de “${input.task.title}”: sem código vinculado, ${similarPrs.length} PR(s) similares, ${shownModules.length} módulo(s) candidato(s), ${openQuestions.length} perguntas para refinar.`
        : `Discovery de “${input.task.title}”: ${prs.length} PR(s) vinculados, ${uniqueModules.length} módulo(s), confiança ${linkConfidence}, ${openQuestions.length} perguntas em aberto.`,
    objective: input.task.title,
    whatAlreadyExists: [...new Set(whatAlreadyExists)],
    dependencies: [...new Set(dependencies)],
    affectedModules: greenfield
      ? shownModules.map((m) =>
          linkedModuleIds.has(m.id) ? m.title : `candidato:${m.title}`,
        )
      : uniqueModules.map((m) => m.title),
    similarPullRequests: [
      ...prs.map((p) => ({
        id: p.id,
        title: p.title,
        url: p.url,
        score: 1,
        linked: true,
      })),
      ...asIsPrs.map((p) => ({
        id: p.id,
        title: p.title,
        url: p.url,
        score: 0.4,
        linked: false,
      })),
      ...similarPrs
        .filter((s) => !asIsPrs.some((p) => p.id === s.pr.id))
        .map(({ pr, score }) => ({
          id: pr.id,
          title: pr.title,
          url: pr.url,
          score,
          linked: false,
        })),
    ],
    similarCommits: [
      ...commits.map((c) => ({
        id: c.id,
        title: c.title,
        url: c.url,
      })),
      ...asIsCommits.map((c) => ({
        id: c.id,
        title: c.title,
        url: c.url,
      })),
    ],
    relatedDocuments: docs.map((d) => ({
      id: d.id,
      title: d.title,
      url: d.url,
    })),
    risks: [...new Set(risks)],
    technicalDebt: [...new Set(technicalDebt)],
    checklist: [...new Set(checklist)],
    openQuestions: [...new Set(openQuestions)],
    evidenceIds,
    linkConfidence,
    storySections: story.sections,
    candidateRepositories: buildCandidateRepos({
      task: input.task,
      related: input.related,
      linkedPrs: prs,
      linkedCommits: commits,
      softPrs: similarPrs.map((s) => s.pr),
      asIsEvidence,
    }),
  };
}

function buildCandidateRepos(opts: {
  task: CanonicalEntity;
  related: CanonicalEntity[];
  linkedPrs: CanonicalEntity[];
  linkedCommits: CanonicalEntity[];
  softPrs: CanonicalEntity[];
  asIsEvidence: CanonicalEntity[];
}): NonNullable<DiscoveryResult["candidateRepositories"]> {
  const out = new Map<
    string,
    NonNullable<DiscoveryResult["candidateRepositories"]>[number]
  >();

  const add = (
    ent: CanonicalEntity,
    confidence: "linked" | "evidence" | "inferred",
    via: string,
  ) => {
    const repository = repoFromEntity(ent);
    if (!repository) return;
    const prev = out.get(repository);
    const rank = { linked: 0, evidence: 1, inferred: 2 };
    if (prev && rank[prev.confidence] <= rank[confidence]) return;
    out.set(repository, {
      repository,
      url:
        ent.url?.replace(/\/(pull|commit|tree|blob)\/.*$/i, "") ??
        (ent.type === "Repository" ? ent.url : undefined) ??
        `https://github.com/${repository}`,
      via,
      confidence,
    });
  };

  for (const p of opts.linkedPrs) add(p, "linked", `pr-linked:${p.title}`);
  for (const c of opts.linkedCommits) add(c, "linked", `commit-linked:${c.title}`);
  for (const e of opts.asIsEvidence) {
    add(
      e,
      "evidence",
      e.type === "Commit" ? `commit-as-is:${e.title}` : `pr-as-is:${e.title}`,
    );
  }

  // Soft-similar PRs: keep only the dominant repo (most hits), max 1
  const softRepoCounts = new Map<string, { ent: CanonicalEntity; n: number }>();
  for (const p of opts.softPrs) {
    const repository = repoFromEntity(p);
    if (!repository) continue;
    const cur = softRepoCounts.get(repository) ?? { ent: p, n: 0 };
    cur.n += 1;
    softRepoCounts.set(repository, cur);
  }
  const softRanked = [...softRepoCounts.entries()].sort(
    (a, b) => b[1].n - a[1].n,
  );
  if (softRanked[0] && !out.has(softRanked[0][0])) {
    // Only add soft repo if we don't already have linked/evidence
    const hasStrong = [...out.values()].some(
      (r) => r.confidence === "linked" || r.confidence === "evidence",
    );
    if (!hasStrong) {
      add(
        softRanked[0][1].ent,
        "inferred",
        `pr-similar:${softRanked[0][1].ent.title}`,
      );
    }
  }

  // Do NOT add bare Repository entities from related — that dumps the whole sync.

  return [...out.values()];
}
