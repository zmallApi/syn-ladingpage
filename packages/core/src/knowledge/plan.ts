import type { ImpactResult } from "./impact.js";

export type WorkItemKind =
  | "migration"
  | "seed"
  | "api"
  | "domain"
  | "rbac"
  | "cutover"
  | "test"
  | "docs"
  | "observability"
  | "flag"
  | "other";

export interface WorkItem {
  id: string;
  order: number;
  kind: WorkItemKind;
  title: string;
  description: string;
  /** Microservice / repo short name when known */
  service?: string;
  dependsOn: string[];
  acceptanceHints: string[];
}

export interface PlanResult {
  capabilityId: "eng_implementation_plan";
  stage: "plan";
  summary: string;
  mvp: string;
  workItems: WorkItem[];
  /** Ordered id list for agents */
  sequence: string[];
  outOfScope: string[];
  assumptions: string[];
  openQuestions: string[];
  /** Enough ordered work to hand off to Execute */
  readyForExecute: boolean;
  warnings: string[];
  /** Snapshot of Impact consumed */
  impact: ImpactResult;
}

function lineBullets(text: string | undefined, n = 8): string[] {
  if (!text) return [];
  return text
    .split(/\n/)
    .map((l) => l.replace(/^[-*•]\s*/, "").trim())
    .filter(Boolean)
    .slice(0, n);
}

function primaryService(impact: ImpactResult): string | undefined {
  return impact.affectedServices[0]?.name;
}

/**
 * Story OS Plan — ordered work items from Impact + Refine/Understand sections.
 * Deterministic. Does not invent Task↔PR links or write code.
 */
export function planStory(impact: ImpactResult): PlanResult {
  const refine = impact.refine;
  const understand = refine.understand;
  const sections = understand.storySections ?? {};
  const service = primaryService(impact);
  const tables = impact.blastRadius.dataModel.filter((t) => !/table-embed/i.test(t));
  const apis = impact.blastRadius.apis.filter((a) => a.source !== "inferred");
  const asIs = impact.blastRadius.asIsSymbols;
  const files = impact.blastRadius.filesTouched;

  const draft: Array<Omit<WorkItem, "order" | "id"> & { kind: WorkItemKind }> =
    [];

  const push = (
    kind: WorkItemKind,
    title: string,
    description: string,
    opts?: {
      dependsOn?: string[];
      acceptanceHints?: string[];
      service?: string;
    },
  ) => {
    draft.push({
      kind,
      title,
      description,
      service: opts?.service ?? service,
      dependsOn: opts?.dependsOn ?? [],
      acceptanceHints: opts?.acceptanceHints ?? [],
    });
  };

  // 1. Migration / schema
  if (tables.length || /migrat|schema|tabela/i.test(refine.mvp + (sections.toBe ?? ""))) {
    const tableList = tables.length ? tables.join(", ") : "schema do TO-BE";
    push(
      "migration",
      `Migration: ${tableList}`,
      `Criar/alterar tabelas (${tableList}) com tenant isolation, PKs e FKs alinhados ao modelo da história.`,
      {
        acceptanceHints: refine.checklist
          .filter((c) => /migrat/i.test(c.item) && c.ready)
          .map((c) => c.item)
          .slice(0, 3),
      },
    );
  }

  // 2. Seed
  const seedLines = [
    ...lineBullets(sections.seed),
    ...understand.dependencies
      .filter((d) => /^seed:/i.test(d))
      .map((d) => d.replace(/^seed:\s*/i, "")),
  ];
  if (seedLines.length || /seed|nativ/i.test(refine.mvp)) {
    push(
      "seed",
      "Seed do playbook/dados nativos",
      seedLines.length
        ? `Popular dados iniciais: ${seedLines.slice(0, 4).join(" · ")}`
        : "Seedar conteúdo nativo/demo a partir do AS-IS (ex.: templates hardcoded → dados).",
      {
        dependsOn: draft.some((d) => d.kind === "migration") ? ["__migration__"] : [],
        acceptanceHints: refine.checklist
          .filter((c) => /seed|nativ/i.test(c.item) && c.ready)
          .map((c) => c.item)
          .slice(0, 3),
      },
    );
  }

  // 3. Domain / AS-IS boundary (before or with API if symbols exist)
  if (asIs.length || files.length) {
    push(
      "domain",
      "Boundary AS-IS → dados",
      `Isolar/migrar lógica citada no AS-IS (${[...asIs, ...files]
        .slice(0, 6)
        .join(", ")}) para ler do novo modelo sem deixar o caminho antigo divergir.`,
      {
        dependsOn: draft.some((d) => d.kind === "migration")
          ? ["__migration__"]
          : [],
        acceptanceHints: impact.driftRisks.slice(0, 2),
      },
    );
  }

  // 4. API / CRUD
  if (apis.length || /crud|api|rest/i.test(refine.mvp + (sections.toBe ?? ""))) {
    const endpointList =
      apis.length > 0
        ? apis
            .slice(0, 8)
            .map((a) => a.surface)
            .join("; ")
        : "CRUD REST por tenant (paths no TO-BE/aceite)";
    push(
      "api",
      "CRUD / endpoints",
      `Implementar endpoints: ${endpointList}. Validação (Zod etc.) e multi-tenant.`,
      {
        dependsOn: [
          ...(draft.some((d) => d.kind === "migration") ? ["__migration__"] : []),
          ...(draft.some((d) => d.kind === "seed") ? ["__seed__"] : []),
        ],
        acceptanceHints: refine.checklist
          .filter((c) => /crud|zod|api|swagger|404|403/i.test(c.item) && c.ready)
          .map((c) => c.item)
          .slice(0, 5),
      },
    );
  }

  // 5. RBAC
  const rbacHints = refine.checklist
    .filter((c) => /rbac|permiss|menu\.|skills\./i.test(c.item))
    .map((c) => c.item);
  if (rbacHints.length || /rbac|permiss/i.test(sections.acceptance ?? "")) {
    push(
      "rbac",
      "RBAC / permissões",
      rbacHints[0] ??
        "Aplicar permissões view/manage no menu e nas rotas (404/403 cross-tenant).",
      {
        dependsOn: draft.some((d) => d.kind === "api") ? ["__api__"] : [],
        acceptanceHints: rbacHints.slice(0, 4),
      },
    );
  }

  // 6. Docs / Swagger
  if (
    refine.checklist.some((c) => /swagger|openapi|docs/i.test(c.item)) ||
    /swagger|\/api\/v1\/docs/i.test(sections.acceptance ?? "")
  ) {
    push(
      "docs",
      "Swagger / docs da API",
      "Documentar endpoints novos em /api/v1/docs (ou OpenAPI do serviço).",
      {
        dependsOn: draft.some((d) => d.kind === "api") ? ["__api__"] : [],
      },
    );
  }

  // 7. Feature flag if open
  if (refine.openQuestions.some((q) => /feature flag/i.test(q))) {
    push(
      "flag",
      "Feature flag",
      "Definir flag de liberação do CRUD/novo caminho; default off até validar seed + RBAC.",
      {
        dependsOn: draft.some((d) => d.kind === "api") ? ["__api__"] : [],
      },
    );
  }

  // 8. Cutover / drift
  if (impact.driftRisks.length && (asIs.length || files.length)) {
    push(
      "cutover",
      "Cutover sem drift",
      "Garantir um único caminho ativo: novo modelo alimenta runtime; remover ou isolar templates hardcoded após paridade.",
      {
        dependsOn: [
          ...(draft.some((d) => d.kind === "api") ? ["__api__"] : []),
          ...(draft.some((d) => d.kind === "domain") ? ["__domain__"] : []),
        ],
        acceptanceHints: impact.driftRisks.slice(0, 3),
      },
    );
  }

  // 9. Tests
  const testHints = [
    ...lineBullets(sections.tests),
    ...refine.checklist
      .filter((c) => /^Teste:/i.test(c.item) || /^testes$/i.test(c.item))
      .map((c) => c.item.replace(/^Teste:\s*/i, "")),
  ].filter((t) => !/list:|space:/i.test(t));

  if (testHints.length || draft.some((d) => d.kind === "api")) {
    push(
      "test",
      "Testes",
      testHints.length
        ? `Cobrir: ${[...new Set(testHints)].slice(0, 6).join(" · ")}`
        : "Testes de CRUD happy path, multi-tenant e regras nativa vs customizada.",
      {
        dependsOn: draft.some((d) => d.kind === "api") ? ["__api__"] : [],
        acceptanceHints: [...new Set(testHints)].slice(0, 6),
      },
    );
  }

  // 10. Observability
  if (
    refine.checklist.some((c) => /observab/i.test(c.item)) ||
    refine.resolvedQuestions.some((q) => /observab/i.test(q.question))
  ) {
    push(
      "observability",
      "Observabilidade",
      "Logs/métricas nos endpoints novos e no cutover (erros de seed, 403 cross-tenant, latência CRUD).",
      {
        dependsOn: draft.some((d) => d.kind === "api") ? ["__api__"] : [],
      },
    );
  }

  // Fallback if somehow empty but we have MVP
  if (!draft.length) {
    push(
      "other",
      "Implementar MVP",
      refine.mvp || understand.objective,
      { acceptanceHints: refine.checklist.filter((c) => c.ready).map((c) => c.item).slice(0, 5) },
    );
  }

  // Resolve placeholder dependsOn → real ids after numbering
  const kindFirstId = new Map<WorkItemKind, string>();
  const workItems: WorkItem[] = draft.map((item, i) => {
    const id = `W${i + 1}`;
    if (!kindFirstId.has(item.kind)) kindFirstId.set(item.kind, id);
    return {
      id,
      order: i + 1,
      kind: item.kind,
      title: item.title,
      description: item.description,
      service: item.service,
      dependsOn: [],
      acceptanceHints: item.acceptanceHints,
    };
  });

  const kindAlias: Record<string, WorkItemKind> = {
    __migration__: "migration",
    __seed__: "seed",
    __api__: "api",
    __domain__: "domain",
  };

  draft.forEach((item, i) => {
    const deps = (item.dependsOn ?? [])
      .map((d) => {
        const kind = kindAlias[d];
        return kind ? kindFirstId.get(kind) : d;
      })
      .filter((d): d is string => Boolean(d) && d !== workItems[i]!.id);
    workItems[i]!.dependsOn = [...new Set(deps)];
  });

  const outOfScope = lineBullets(sections.outOfScope, 8);
  const assumptions: string[] = [];
  if (service) {
    assumptions.push(
      `Trabalho concentrado no serviço/repositório “${service}” (${impact.affectedServices[0]?.repository}).`,
    );
  } else {
    assumptions.push(
      "Repositório/MS não confirmado na KL — Plan usa só TO-BE/aceite; valide o alvo no Execute.",
    );
  }
  if (!impact.readyForPlan) {
    assumptions.push(
      "Impact preliminar — sequência pode mudar após fechar links Task↔código.",
    );
  }
  for (const q of refine.openQuestions.slice(0, 3)) {
    assumptions.push(`Pendente do Refine: ${q}`);
  }

  const warnings: string[] = [...impact.warnings];
  if (!impact.affectedServices.length) {
    warnings.push("Plan sem MS alvo explícito — agente deve confirmar o repositório.");
  }

  const readyForExecute =
    workItems.length >= 2 &&
    Boolean(refine.mvp) &&
    (impact.readyForPlan || Boolean(sections.acceptance || sections.toBe));

  const summary = readyForExecute
    ? `Plan: ${workItems.length} work item(s) ordenados` +
      (service ? ` para ${service}` : "") +
      ` (migration→…→tests). Pronto para Execute.`
    : `Plan preliminar: ${workItems.length} item(s) — reforçar Impact/Refine antes do Execute.`;

  return {
    capabilityId: "eng_implementation_plan",
    stage: "plan",
    summary,
    mvp: refine.mvp,
    workItems,
    sequence: workItems.map((w) => w.id),
    outOfScope,
    assumptions,
    openQuestions: refine.openQuestions,
    readyForExecute,
    warnings: [...new Set(warnings.filter(Boolean))],
    impact,
  };
}
