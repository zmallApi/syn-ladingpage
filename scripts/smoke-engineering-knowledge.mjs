/**
 * Engineering Knowledge smoke (linker + discovery template, no external APIs).
 * Run from repo root: npx tsx scripts/smoke-engineering-knowledge.mjs
 */
import {
  discoverStory,
  entityId,
  linkTasksToCode,
  refineStory,
  impactStory,
  planStory,
  executeContext,
  parseApiEndpoints,
  extractGithubRepo,
  scoreTaskMatch,
} from "../packages/core/src/knowledge/index.ts";
import {
  ENGINEERING_STORY_OS_CAPABILITIES,
  STORY_OS_STAGES,
  resolveCapabilityId,
  getTemplate,
} from "../packages/core/src/capabilities/index.ts";
import {
  listMissions,
  runMission,
  missionPackageFromExecute,
} from "../packages/core/src/missions/index.ts";

const assert = (cond, msg) => {
  if (!cond) throw new Error(msg);
};

// --- Task resolution: [P1c] must not pick [P1] playbooks ---
{
  const p1 = {
    id: entityId("clickup", "Task", "p1"),
    type: "Task",
    source: "clickup",
    externalId: "86e200kcz",
    title: "[P1] Cadastro de playbooks e acoes de retencao",
    text: "playbooks",
    payload: {},
  };
  const p1c = {
    id: entityId("clickup", "Task", "p1c"),
    type: "Task",
    source: "clickup",
    externalId: "86e200p1c",
    title: "[P1c] Regra de qual playbook aplicar",
    text: "regra playbook",
    payload: {},
  };
  const q = "[P1c] Regra de qual playbook aplicar";
  assert(
    scoreTaskMatch(q, p1c) > scoreTaskMatch(q, p1),
    `P1c query must prefer P1c task (${scoreTaskMatch(q, p1c)} vs ${scoreTaskMatch(q, p1)})`,
  );
  assert(
    scoreTaskMatch(q, p1) < 0,
    `P1c query must reject P1 when keys differ (score=${scoreTaskMatch(q, p1)})`,
  );
}

const task = {
  id: entityId("clickup", "Task", "abc123"),
  type: "Task",
  source: "clickup",
  externalId: "abc123",
  title: "Implementar login Google OAuth",
  text: "Implementar login Google OAuth CU-452\nCritérios ainda vagos",
  payload: {},
};

const pr = {
  id: entityId("github", "PullRequest", "acme/app#385"),
  type: "PullRequest",
  source: "github",
  externalId: "acme/app#385",
  title: "feat: login-google CU-452",
  text: "feat: login-google CU-452\nsrc/auth/OAuthService.ts",
  url: "https://github.com/acme/app/pull/385",
  payload: { branch: "feature/CU-452-google-login", number: 385 },
};

const unrelatedPr = {
  id: entityId("github", "PullRequest", "acme/app#15"),
  type: "PullRequest",
  source: "github",
  externalId: "acme/app#15",
  title: "Criação do endpoint para alterar slog e inativar a empresa",
  text: "docs/README.md\nsrc/modules/db/config.ts",
  url: "https://github.com/acme/app/pull/15",
  payload: { branch: "fix/slug", number: 15 },
};

const commit = {
  id: entityId("github", "Commit", "deadbeef"),
  type: "Commit",
  source: "github",
  externalId: "deadbeef",
  title: "Add OAuthService for Google",
  text: "Add OAuthService for Google\nCU-452\nsrc/auth/OAuthService.ts",
  url: "https://github.com/acme/app/commit/deadbeef",
  payload: { files: ["src/auth/OAuthService.ts"], repository: "acme/app" },
};

const mod = {
  id: entityId("inferred", "Module", "Auth"),
  type: "Module",
  source: "inferred",
  externalId: "Auth",
  title: "Auth",
  text: "Auth",
  payload: {},
};

const entities = [task, pr, unrelatedPr, commit, mod];
const structuralEdges = [
  {
    fromId: pr.id,
    toId: commit.id,
    rel: "contains",
    evidence: { via: "test" },
  },
  {
    fromId: pr.id,
    toId: mod.id,
    rel: "touches",
    evidence: { via: "path_heuristic" },
  },
];

const linked = linkTasksToCode(entities);
assert(linked.length >= 1, `expected Task→PR link, got ${linked.length}`);
assert(
  linked.some((e) => e.fromId === task.id && e.toId === pr.id && e.rel === "implements"),
  "missing implements edge Task→PR",
);
assert(
  !linked.some((e) => e.toId === unrelatedPr.id),
  "false positive: unrelated PR must not link",
);

const rejectKey = `${task.id}|implements|${pr.id}`;
const linkedSkip = linkTasksToCode(entities, {
  rejectKeys: new Set([rejectKey]),
});
assert(
  !linkedSkip.some((e) => e.toId === pr.id),
  "rejected pair must be skipped on re-link",
);

const result = discoverStory({
  task,
  related: entities,
  edges: [...structuralEdges, ...linked],
});

assert(result.objective.includes("login Google"), `objective=${result.objective}`);
assert(result.affectedModules.includes("Auth"), `modules=${result.affectedModules}`);
assert(result.similarPullRequests.some((p) => p.id === pr.id), "expected linked PR");
assert(
  !result.similarPullRequests.some((p) => p.id === unrelatedPr.id),
  "unrelated PR must not appear as similar",
);
assert(
  result.linkConfidence === "high" || result.linkConfidence === "medium",
  "expected link confidence",
);
assert(result.openQuestions.length >= 1, "expected open questions");
assert(result.checklist.length >= 1, "expected checklist");
assert(result.evidenceIds.includes(task.id), "task missing from evidence");

// --- Greenfield: retention/playbook with no linked code ---
const greenTask = {
  id: entityId("clickup", "Task", "86e200kcz"),
  type: "Task",
  source: "clickup",
  externalId: "86e200kcz",
  title: "[P1] Cadastro de playbooks e acoes de retencao",
  text: "Cadastro de playbooks e acoes de retencao\nSem implementacao ainda",
  payload: {},
};

const similarRetentionPr = {
  id: entityId("github", "PullRequest", "acme/app#99"),
  type: "PullRequest",
  source: "github",
  externalId: "acme/app#99",
  title: "feat: churn playbook WhatsApp actions",
  text: "feat: churn playbook",
  url: "https://github.com/acme/app/pull/99",
  payload: { number: 99 },
};

const candidateMod = {
  id: entityId("inferred", "Module", "Retention"),
  type: "Module",
  source: "inferred",
  externalId: "Retention",
  title: "Retention",
  text: "Retention",
  payload: {},
};

const green = discoverStory({
  task: greenTask,
  related: [greenTask, similarRetentionPr, unrelatedPr, candidateMod],
  edges: [],
});

assert(green.linkConfidence === "none" || green.linkConfidence === "low", `green conf=${green.linkConfidence}`);
assert(green.risks.length >= 1, `expected greenfield risks, got ${green.risks.length}`);
assert(
  green.openQuestions.some((q) => /reten|playbook|gatilho/i.test(q)),
  "expected retention open questions",
);
assert(
  green.whatAlreadyExists.some((w) => /história nova|sem implementação/i.test(w)),
  "expected greenfield whatAlreadyExists copy",
);
assert(
  green.dependencies.some((d) => /candidato:/i.test(d)),
  "expected candidate dependencies",
);
assert(
  green.similarPullRequests.some(
    (p) => p.id === similarRetentionPr.id && p.linked === false,
  ),
  "expected soft-similar retention PR as unlinked",
);
assert(
  !green.similarPullRequests.some((p) => p.id === unrelatedPr.id),
  "unrelated PR must not soft-match greenfield",
);
assert(
  !green.similarPullRequests.some((p) => p.linked === true),
  "greenfield must not invent linked PRs",
);

// --- Story body: rich ClickUp description drives briefing ---
const richText = `
User story
Como gestor de retenção do tenant
Quero cadastrar e editar playbooks com N ações
Para definir a estratégia sem deploy

AS-IS
- 14 ações fixas em actionTemplatesFor / recommendedActionFor (alunos.service.js).
- action_plan_actions é instância por aluno, mas template vem do código.

TO-BE
- Tabelas playbooks + playbook_actions.
- CRUD REST por tenant.
- Playbook nativo "Retenção padrão" no seed.

Modelo de dados
- playbooks
- playbook_actions

API
- GET /api/v1/playbooks
- POST /api/v1/playbooks
- [table-embed:1:1 Método| 1:2 Path| 1:3 Permissão| 1:4 Descrição| 2:1 GET| 2:2 /api/v1/playbooks/:id | 2:3 view| 2:4 Detalhe| 3:1 PATCH| 3:2 /api/v1/playbooks/:id | 3:3 manage| 3:4 Edita|]

Critérios de aceite
- Migration playbooks + playbook_actions
- CRUD completo com validação Zod
- Playbook nativo seedado por tenant demo
- Não alterar geração de plano ainda (P1b)

Fora de escopo
- Instanciar plano no aluno (P1b)
- Disparo automático (G2, C1)

Testes
- CRUD happy path
- Bloqueio delete playbook nativa
- Duplicate gera novo id e tipo customizada
`;

const richTask = {
  id: entityId("clickup", "Task", "86e200kcz-rich"),
  type: "Task",
  source: "clickup",
  externalId: "86e200kcz-rich",
  title: "[P1] Cadastro de playbooks e acoes de retencao",
  text: richText,
  payload: {},
};

const asIsCommit = {
  id: entityId("github", "Commit", "aabbccdd"),
  type: "Commit",
  source: "github",
  externalId: "aabbccdd",
  title: "refactor alunos.service actionTemplatesFor",
  text: "Move helpers in alunos.service.js including actionTemplatesFor",
  url: "https://github.com/axprofittness/pfit-app-saas-api/commit/aabbccdd",
  payload: {
    files: ["src/alunos.service.js"],
    repository: "axprofittness/pfit-app-saas-api",
  },
};

const rich = discoverStory({
  task: richTask,
  related: [richTask, asIsCommit, unrelatedPr],
  edges: [],
});

assert(
  rich.whatAlreadyExists.some((w) => /AS-IS:/i.test(w)),
  `expected AS-IS in whatAlreadyExists: ${rich.whatAlreadyExists.join(" | ")}`,
);
assert(
  rich.checklist.some((c) => /Migration playbooks|validação Zod|Playbook nativo/i.test(c)),
  `expected acceptance criteria in checklist: ${rich.checklist.join(" | ")}`,
);
assert(
  !rich.openQuestions.some((q) => /aceite estão explícitos/i.test(q)),
  "must not ask if acceptance is explicit when section exists",
);
assert(
  rich.similarCommits.some((c) => c.id === asIsCommit.id),
  "expected AS-IS symbol commit as evidence",
);
assert(
  rich.dependencies.some((d) => /TO-BE:|modelo:|API:/i.test(d)),
  `expected TO-BE/modelo/API deps: ${rich.dependencies.join(" | ")}`,
);
assert(
  rich.technicalDebt.some((t) => /actionTemplatesFor|alunos\.service/i.test(t)),
  "expected debt about hardcoded templates",
);

// --- Story OS Refine (Fase B) ---
const refinedRich = refineStory(rich);
assert(refinedRich.capabilityId === "eng_refine_story", "refine capability id");
assert(refinedRich.stage === "refine", "refine stage");
assert(refinedRich.mvp.length > 10, `mvp too short: ${refinedRich.mvp}`);
assert(
  refinedRich.readyForImpact === true,
  `rich story should be ready for impact: ${JSON.stringify({
    gaps: refinedRich.acceptanceGaps,
    open: refinedRich.openQuestions,
    scope: refinedRich.scopeGaps,
  })}`,
);
assert(
  refinedRich.resolvedQuestions.length >= 1,
  "expected resolved questions from rich body",
);
assert(
  !refinedRich.openQuestions.some((q) => /aceite estão explícitos/i.test(q)),
  "must not leave acceptance question open when section exists",
);
assert(
  refinedRich.checklist.some((c) => c.ready && /Migration playbooks|validação Zod/i.test(c.item)),
  "acceptance checklist items should be ready",
);

const refinedGreen = refineStory(green);
assert(
  refinedGreen.readyForImpact === false,
  "vague greenfield must not be ready for impact",
);
assert(
  refinedGreen.acceptanceGaps.length >= 1 || refinedGreen.openQuestions.length >= 1,
  "greenfield refine must surface gaps",
);

// --- Story OS Impact (Fase C) — MS / repos / APIs limpas ---
assert(
  extractGithubRepo(
    "https://github.com/axprofittness/pfit-app-saas-api/commit/abc",
  ) === "axprofittness/pfit-app-saas-api",
  "extractGithubRepo from commit url",
);
assert(
  extractGithubRepo("github:PullRequest:axprofittness/pfit-app-saas-api#42") ===
    "axprofittness/pfit-app-saas-api",
  "extractGithubRepo from canonical PR id",
);
assert(
  extractGithubRepo("axprofittness/pfit-app-saas-api#99") ===
    "axprofittness/pfit-app-saas-api",
  "extractGithubRepo from owner/repo#n",
);
const embedParsed = parseApiEndpoints(
  "[table-embed:1:1 Método| 1:2 Path| 1:3 Permissão| 1:4 Descrição| 2:1 GET| 2:2 /api/v1/playbooks | 2:3 view| 2:4 Lista| 3:1 POST| 3:2 /api/v1/playbooks/:id/actions | 3:3 manage| 3:4 Add|]",
);
assert(
  embedParsed.some((a) => a.method === "GET" && a.path === "/api/v1/playbooks"),
  `table-embed parse failed: ${JSON.stringify(embedParsed)}`,
);

const impactRich = impactStory(refinedRich);
assert(impactRich.capabilityId === "eng_impact_analysis", "impact capability id");
assert(impactRich.stage === "impact", "impact stage");
assert(
  impactRich.readyForPlan === true,
  `rich impact should be ready for plan: ${impactRich.summary}`,
);
assert(
  impactRich.affectedServices.some(
    (s) =>
      s.repository === "axprofittness/pfit-app-saas-api" &&
      s.name === "pfit-app-saas-api" &&
      s.kind === "api",
  ),
  `expected MS pfit-app-saas-api: ${JSON.stringify(impactRich.affectedServices)}`,
);

// Greenfield / id-only PR (no url) must still yield repository
{
  const softOnly = discoverStory({
    task: {
      id: entityId("clickup", "Task", "p1c"),
      type: "Task",
      source: "clickup",
      externalId: "p1c",
      title: "[P1c] Regra de qual playbook aplicar",
      text: "Definir qual playbook aplicar por gatilho",
      payload: {},
    },
    related: [
      {
        id: "github:PullRequest:axprofittness/pfit-app-saas-api#77",
        type: "PullRequest",
        source: "github",
        externalId: "axprofittness/pfit-app-saas-api#77",
        title: "feat: playbook selection rules",
        text: "playbook",
        // no url on purpose
        payload: { repository: "axprofittness/pfit-app-saas-api", number: 77 },
      },
      {
        id: entityId("github", "Repository", "axprofittness/pfit-app-saas-api"),
        type: "Repository",
        source: "github",
        externalId: "axprofittness/pfit-app-saas-api",
        title: "axprofittness/pfit-app-saas-api",
        text: "api",
        url: "https://github.com/axprofittness/pfit-app-saas-api",
        payload: {},
      },
    ],
    edges: [],
  });
  softOnly.projectRepositories = [
    {
      id: entityId("github", "Repository", "axprofittness/pfit-app-saas-api"),
      name: "axprofittness/pfit-app-saas-api",
      url: "https://github.com/axprofittness/pfit-app-saas-api",
    },
    {
      id: entityId("github", "Repository", "axprofittness/other-app"),
      name: "axprofittness/other-app",
      url: "https://github.com/axprofittness/other-app",
    },
  ];
  const impactP1c = impactStory(refineStory(softOnly));
  assert(
    impactP1c.affectedServices.some(
      (s) => s.repository === "axprofittness/pfit-app-saas-api",
    ),
    `P1c must resolve repo without PR url: ${JSON.stringify(impactP1c.affectedServices)}`,
  );
  assert(
    !impactP1c.affectedServices.some((s) => s.repository === "axprofittness/other-app"),
    `must not dump unrelated synced repos: ${JSON.stringify(impactP1c.affectedServices)}`,
  );
  assert(
    impactP1c.affectedServices.length <= 2,
    `too many services (expected focused): ${impactP1c.affectedServices.length}`,
  );
}
assert(
  impactRich.blastRadius.apis.some((a) =>
    /\/api\/v1\/playbooks/.test(a.path || a.surface),
  ),
  `expected clean playbooks APIs: ${JSON.stringify(impactRich.blastRadius.apis)}`,
);
assert(
  !impactRich.blastRadius.apis.some((a) => /table-embed/i.test(a.surface)),
  "APIs must not leak table-embed markup",
);
assert(
  impactRich.blastRadius.asIsSymbols.some((s) =>
    /actionTemplatesFor|alunos\.service|playbook_actions/i.test(s),
  ),
  `expected AS-IS symbols: ${impactRich.blastRadius.asIsSymbols.join(", ")}`,
);
assert(
  impactRich.blastRadius.dataModel.some((d) => /playbook/i.test(d)),
  "expected data model tables",
);
assert(
  impactRich.driftRisks.length >= 1,
  "expected drift risks for AS-IS→TO-BE",
);

const impactLinked = impactStory(refineStory(result));
assert(
  impactLinked.affectedServices.some(
    (s) => s.repository === "acme/app" && s.confidence === "linked",
  ),
  `expected linked MS acme/app: ${JSON.stringify(impactLinked.affectedServices)}`,
);
assert(
  impactLinked.blastRadius.modules.some(
    (m) => m.name === "Auth" && m.confidence === "linked",
  ),
  `expected linked Auth module: ${JSON.stringify(impactLinked.blastRadius.modules)}`,
);

// --- Story OS Plan (Fase D) ---
const planRich = planStory(impactRich);
assert(planRich.capabilityId === "eng_implementation_plan", "plan capability id");
assert(planRich.stage === "plan", "plan stage");
assert(
  planRich.readyForExecute === true,
  `rich plan should be ready for execute: ${planRich.summary}`,
);
assert(planRich.workItems.length >= 3, `expected >=3 work items, got ${planRich.workItems.length}`);
assert(
  planRich.workItems.some((w) => w.kind === "migration"),
  `expected migration item: ${planRich.workItems.map((w) => w.kind).join(",")}`,
);
assert(
  planRich.workItems.some((w) => w.kind === "api"),
  "expected api work item",
);
assert(
  planRich.workItems.some((w) => w.kind === "test"),
  "expected test work item",
);
const migIdx = planRich.workItems.findIndex((w) => w.kind === "migration");
const apiIdx = planRich.workItems.findIndex((w) => w.kind === "api");
assert(migIdx >= 0 && apiIdx > migIdx, "migration must precede api");
assert(
  planRich.workItems.some((w) => w.service === "pfit-app-saas-api"),
  `work items should target MS: ${JSON.stringify(planRich.workItems.map((w) => w.service))}`,
);
assert(
  planRich.outOfScope.some((o) => /P1b|Instanciar plano/i.test(o)),
  `expected out of scope: ${planRich.outOfScope.join(" | ")}`,
);

// --- Story OS Execute (Fase E) ---
const execRich = executeContext(planRich);
assert(execRich.capabilityId === "eng_execute_context", "execute capability id");
assert(execRich.stage === "execute", "execute stage");
assert(execRich.role === "mission_package", "must emit Mission Package");
assert(execRich.missionPackage?.role === "mission_package", "nested package role");
assert(execRich.missionPackage?.agentBrief?.length > 0, "package brief");
assert(
  execRich.readyToImplement === true,
  `rich execute should be ready: ${execRich.summary}`,
);
assert(
  execRich.agentBrief.includes("Synapsee") &&
    execRich.agentBrief.includes("não") &&
    /work items|W1/i.test(execRich.agentBrief),
  "agentBrief must instruct agent and list work",
);
assert(
  !/status": "not_implemented"|escreve o código da aplicação/i.test(
    JSON.stringify(execRich.context),
  ),
  "execute must not claim to write app code in context",
);
assert(
  execRich.context.services.some(
    (s) => s.repository === "axprofittness/pfit-app-saas-api",
  ),
  `execute pack must include MS: ${JSON.stringify(execRich.context.services)}`,
);
assert(
  execRich.context.workItems.length === planRich.workItems.length,
  "execute must carry plan work items",
);
assert(
  execRich.handoff.suggestedFirstWorkItemId === planRich.workItems[0].id,
  "handoff should start at W1",
);
assert(
  execRich.context.outOfScope.length >= 1,
  "out of scope must remain in pack",
);

// --- Story OS pack metadata ---
assert(
  resolveCapabilityId("discover_story") === "eng_understand_story",
  "discover_story must alias to eng_understand_story",
);
assert(
  ENGINEERING_STORY_OS_CAPABILITIES.length === 5,
  "Story OS pack must have 5 capabilities",
);
assert(
  STORY_OS_STAGES.filter((s) => s.ready).map((s) => s.id).join(",") ===
    "understand,refine,impact,plan,execute",
  "full Story OS ready in Fase E",
);
for (const id of ENGINEERING_STORY_OS_CAPABILITIES) {
  assert(getTemplate(id), `missing template for ${id}`);
}
const execTpl = getTemplate("eng_execute_context");
assert(execTpl, "eng_execute_context template missing");
const execHint = await execTpl.run(
  {
    schema: { resources: [] },
    exposedResources: [],
    bindings: {},
    list: async () => [],
    getById: async () => null,
  },
  { taskRef: "t1" },
);
assert(
  execHint.status === "use_mcp_tool",
  "Execute template should point to MCP tool",
);

// --- Mission Engine ---
{
  const missions = listMissions("engineering");
  assert(
    missions.some((m) => m.id === "implement_story"),
    "implement_story in catalog",
  );
  assert(
    missions.some((m) => m.id === "analyze_incident"),
    "analyze_incident in catalog",
  );
  const fromExec = missionPackageFromExecute(execRich, "smoke-task");
  assert(fromExec.role === "mission_package", "converter role");
  assert(fromExec.plan.length >= 1, "package has plan");

  const missionResult = await runMission(
    "implement_story",
    { taskRef: "smoke" },
    {
      runImplementStory: async () => execRich,
    },
  );
  assert(!("error" in missionResult), "runMission implement_story");
  assert(missionResult.package.missionId === "implement_story", "mission id");
  assert(missionResult.capabilityTrace.includes("eng_execute_context"), "trace");
}

console.log("smoke-engineering-knowledge OK");
console.log(
  JSON.stringify(
    {
      linked: {
        summary: result.summary,
        linkConfidence: result.linkConfidence,
        modules: result.affectedModules,
      },
      greenfield: {
        summary: green.summary,
        linkConfidence: green.linkConfidence,
        risks: green.risks.slice(0, 2),
      },
      storyBody: {
        summary: rich.summary,
        asIs: rich.whatAlreadyExists.filter((w) => /AS-IS|User story|Evidência KL/i.test(w)),
        checklist: rich.checklist.slice(0, 6),
        deps: rich.dependencies.filter((d) => /TO-BE|modelo|API/i.test(d)).slice(0, 5),
        asIsCommits: rich.similarCommits.map((c) => c.title),
      },
      refine: {
        richReady: refinedRich.readyForImpact,
        richMvp: refinedRich.mvp,
        richResolved: refinedRich.resolvedQuestions.length,
        richOpen: refinedRich.openQuestions,
        greenReady: refinedGreen.readyForImpact,
        greenGaps: refinedGreen.acceptanceGaps,
      },
      impact: {
        richReady: impactRich.readyForPlan,
        services: impactRich.affectedServices,
        apis: impactRich.blastRadius.apis.map((a) => a.surface),
        modules: impactRich.blastRadius.modules,
        asIsSymbols: impactRich.blastRadius.asIsSymbols.slice(0, 8),
        drift: impactRich.driftRisks.slice(0, 3),
        linkedServices: impactLinked.affectedServices,
        linkedAuth: impactLinked.blastRadius.modules,
      },
      plan: {
        ready: planRich.readyForExecute,
        sequence: planRich.workItems.map((w) => `${w.id}:${w.kind}:${w.title}`),
        outOfScope: planRich.outOfScope,
      },
      execute: {
        ready: execRich.readyToImplement,
        role: execRich.role,
        primaryService: execRich.handoff.primaryService,
        first: execRich.handoff.suggestedFirstWorkItemId,
        briefChars: execRich.agentBrief.length,
        briefHead: execRich.agentBrief.slice(0, 280),
      },
    },
    null,
    2,
  ),
);
process.exit(0);
