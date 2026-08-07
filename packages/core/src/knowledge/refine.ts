import type { DiscoveryResult } from "./discovery.js";

export interface ResolvedQuestion {
  question: string;
  resolution: string;
}

export interface RefineChecklistItem {
  item: string;
  ready: boolean;
}

export interface RefineResult {
  capabilityId: "eng_refine_story";
  stage: "refine";
  summary: string;
  mvp: string;
  /** Gaps still open after refine (empty = closed). */
  acceptanceGaps: string[];
  scopeGaps: string[];
  resolvedQuestions: ResolvedQuestion[];
  /** Remaining decisions — prefer blockers only. */
  openQuestions: string[];
  checklist: RefineChecklistItem[];
  readyForImpact: boolean;
  risks: string[];
  /** Snapshot of Understand consumed (conclusions, not KL facts). */
  understand: DiscoveryResult;
}

function firstLines(text: string | undefined, n = 3): string[] {
  if (!text) return [];
  return text
    .split(/\n/)
    .map((l) => l.replace(/^[-*•]\s*/, "").trim())
    .filter(Boolean)
    .slice(0, n);
}

function deriveMvp(understand: DiscoveryResult): string {
  const sections = understand.storySections ?? {};
  const toBe = firstLines(sections.toBe, 3);
  if (toBe.length) {
    return `MVP: ${toBe.join(" · ")}`;
  }
  const acceptance = firstLines(sections.acceptance, 3);
  if (acceptance.length) {
    return `MVP (via aceite): ${acceptance.join(" · ")}`;
  }
  const deps = understand.dependencies.filter((d) => /^TO-BE:/i.test(d)).slice(0, 3);
  if (deps.length) {
    return `MVP: ${deps.map((d) => d.replace(/^TO-BE:\s*/i, "")).join(" · ")}`;
  }
  return `MVP candidato: entregar “${understand.objective}” com aceite mínimo e fora de escopo explícito.`;
}

function isPlaceholderChecklist(item: string): boolean {
  return /^(Observabilidade|Critérios de aceite|Testes|Migração|APIs|Feature Flag|Segurança \/ autenticação|Modelo de dados \/ CRUD|Canal de comunicação|Regras de negócio \/ playbook)$/i.test(
    item.trim(),
  );
}

/**
 * Story OS Refine — closes aceite/escopo/MVP gaps from Understand + story body.
 * Deterministic (no LLM). Does not invent Task↔PR links.
 */
export function refineStory(understand: DiscoveryResult): RefineResult {
  const sections = understand.storySections ?? {};
  const hasExplicitAcceptance = Boolean(sections.acceptance);
  const hasOutOfScope = Boolean(sections.outOfScope);
  const hasToBe = Boolean(sections.toBe);
  const hasApi = Boolean(sections.api);
  const hasDataModel = Boolean(sections.dataModel);
  const hasTests = Boolean(sections.tests);
  const structured = Object.keys(sections).length >= 2;

  const mvp = deriveMvp(understand);
  const resolved: ResolvedQuestion[] = [];
  const remaining: string[] = [];

  const resolve = (question: string, resolution: string) => {
    resolved.push({ question, resolution });
  };

  for (const q of understand.openQuestions) {
    const ql = q.toLowerCase();

    if (/critérios de aceite|aceite estão explícitos/i.test(q)) {
      if (hasExplicitAcceptance) {
        resolve(
          q,
          `Aceite na história: ${firstLines(sections.acceptance, 4).join("; ")}`,
        );
        continue;
      }
      remaining.push(q);
      continue;
    }

    if (/menor incremento|mvp/i.test(ql)) {
      if (hasToBe || hasExplicitAcceptance) {
        resolve(q, mvp);
        continue;
      }
      remaining.push(q);
      continue;
    }

    if (/fora de escopo/i.test(ql)) {
      if (hasOutOfScope) {
        resolve(
          q,
          `Fora de escopo: ${firstLines(sections.outOfScope, 4).join("; ")}`,
        );
        continue;
      }
      remaining.push(q);
      continue;
    }

    if (/contrato da api|request\/response/i.test(ql)) {
      if (hasApi) {
        resolve(
          q,
          `API na história: ${firstLines(sections.api, 4).join("; ")}`,
        );
        continue;
      }
      remaining.push(q);
      continue;
    }

    if (/entidades e campos|modelo de dados|cadastro/i.test(ql)) {
      if (hasDataModel) {
        resolve(
          q,
          `Modelo: ${firstLines(sections.dataModel, 4).join("; ")}`,
        );
        continue;
      }
      if (hasToBe) {
        resolve(q, `Inferido do TO-BE: ${firstLines(sections.toBe, 3).join("; ")}`);
        continue;
      }
      remaining.push(q);
      continue;
    }

    if (/já existe implementação parcial/i.test(ql)) {
      if (
        understand.linkConfidence === "high" ||
        understand.linkConfidence === "medium"
      ) {
        resolve(
          q,
          `Há vínculo na KL (confiança ${understand.linkConfidence}): ${understand.similarPullRequests
            .filter((p) => p.linked)
            .map((p) => p.title)
            .slice(0, 3)
            .join("; ") || understand.whatAlreadyExists.slice(0, 2).join("; ")}`,
        );
        continue;
      }
      if (
        understand.similarCommits.length ||
        understand.whatAlreadyExists.some((w) => /AS-IS|Evidência KL/i.test(w))
      ) {
        resolve(
          q,
          "Evidência AS-IS na KL sem PR vinculado — tratar como greenfield com símbolos conhecidos.",
        );
        continue;
      }
      resolve(
        q,
        "Greenfield: nenhum vínculo Task↔código confirmado — Impact deve partir do corpo da história.",
      );
      continue;
    }

    if (/provedor oauth|escopos/i.test(ql)) {
      if (hasApi || sections.toBe) {
        resolve(
          q,
          hasApi
            ? `Ver API/TO-BE: ${firstLines(sections.api ?? sections.toBe, 3).join("; ")}`
            : "Detalhar provedor/escopos no Impact se não estiver no TO-BE.",
        );
        continue;
      }
      remaining.push(q);
      continue;
    }

    if (/estratégia de migração|migração e rollback/i.test(ql)) {
      if (hasExplicitAcceptance && /migrat/i.test(sections.acceptance ?? "")) {
        resolve(
          q,
          `Coberto no aceite: ${firstLines(sections.acceptance, 2).join("; ")}`,
        );
        continue;
      }
      if (structured && hasToBe) {
        resolve(
          q,
          "Migração implícita no TO-BE/modelo — detalhar rollback no Plan (não bloqueia Impact).",
        );
        continue;
      }
      remaining.push(q);
      continue;
    }

    if (/estratégia de rollback\?/i.test(ql)) {
      resolve(
        q,
        "Padrão: revert do deploy + feature flag se risco alto. Detalhar no Plan.",
      );
      continue;
    }

    if (/feature flag necessária\?/i.test(ql)) {
      const needsFf = understand.risks.some((r) =>
        /financeir|autenticação|sessões|spam|contatar/i.test(r),
      );
      if (needsFf) {
        remaining.push(
          "Feature Flag recomendada — confirmar escopo do flag no Plan.",
        );
      } else {
        resolve(
          q,
          "Não obrigatória neste briefing; reavaliar no Plan se o blast radius for alto.",
        );
      }
      continue;
    }

    if (/observabilidade/i.test(ql)) {
      resolve(
        q,
        "Incluir logs/métricas no Plan; item já no checklist de Understand.",
      );
      continue;
    }

    if (/quem valida o aceite/i.test(ql)) {
      resolve(q, "Não bloqueia Impact — alinhar PO/QA antes do Execute.");
      continue;
    }

    if (/gatilhos disparam|ações são automáticas/i.test(ql)) {
      if (hasOutOfScope || hasExplicitAcceptance) {
        resolve(
          q,
          hasOutOfScope
            ? `Escopo fechado parcialmente pelo fora de escopo: ${firstLines(sections.outOfScope, 3).join("; ")}`
            : `Aceite delimita o P1: ${firstLines(sections.acceptance, 3).join("; ")}`,
        );
        continue;
      }
      remaining.push(q);
      continue;
    }

    if (/seed do playbook/i.test(ql)) {
      if (
        sections.seed ||
        understand.dependencies.some((d) => /^seed:/i.test(d))
      ) {
        resolve(
          q,
          `Seed na história: ${
            firstLines(sections.seed, 3).join("; ") ||
            understand.dependencies
              .filter((d) => /^seed:/i.test(d))
              .join("; ")
          }`,
        );
        continue;
      }
      if (hasExplicitAcceptance && /seed/i.test(sections.acceptance ?? "")) {
        resolve(
          q,
          `Seed citado no aceite: ${firstLines(sections.acceptance, 2).join("; ")}`,
        );
        continue;
      }
      remaining.push(q);
      continue;
    }

    if (/loading\/erro\/empty/i.test(ql)) {
      resolve(
        q,
        "UX states — detalhar no Plan de UI; não bloqueia Impact técnico.",
      );
      continue;
    }

    if (
      /aceit|escopo|mvp|entidade|campo|contrato/i.test(ql) &&
      !(hasExplicitAcceptance && hasToBe)
    ) {
      remaining.push(q);
    } else {
      resolve(
        q,
        "Adiado para Plan/Execute — não bloqueia análise de impacto.",
      );
    }
  }

  const acceptanceGaps: string[] = [];
  if (!hasExplicitAcceptance) {
    acceptanceGaps.push(
      "Critérios de aceite não estão em seção explícita — completar antes do Impact.",
    );
  }
  const scopeGaps: string[] = [];
  if (!hasOutOfScope) {
    scopeGaps.push(
      "Fora de escopo não documentado — registrar para evitar scope creep.",
    );
  }
  if (!hasToBe && !hasExplicitAcceptance) {
    scopeGaps.push("TO-BE/MVP ausente — definir o menor incremento entregável.");
  }

  const checklist: RefineChecklistItem[] = understand.checklist.map((item) => {
    if (isPlaceholderChecklist(item)) {
      if (/Critérios de aceite/i.test(item)) {
        return { item, ready: hasExplicitAcceptance };
      }
      if (/^Testes$/i.test(item)) {
        return { item, ready: hasTests };
      }
      if (/^APIs$/i.test(item)) {
        return { item, ready: hasApi };
      }
      if (/Modelo de dados/i.test(item)) {
        return { item, ready: hasDataModel || hasToBe };
      }
      return {
        item,
        ready: hasExplicitAcceptance && (hasOutOfScope || hasToBe),
      };
    }
    return { item, ready: true };
  });

  if (!checklist.some((c) => /mvp/i.test(c.item))) {
    checklist.unshift({
      item: mvp,
      ready: hasToBe || hasExplicitAcceptance,
    });
  }
  if (
    hasOutOfScope &&
    !checklist.some((c) => /fora de escopo|escopo/i.test(c.item))
  ) {
    checklist.push({
      item: `Fora de escopo: ${firstLines(sections.outOfScope, 2).join("; ")}`,
      ready: true,
    });
  }

  const blockingLeft = remaining.filter((q) =>
    /aceit|mvp|menor incremento|entidade|campo|fora de escopo|contrato da api/i.test(
      q,
    ),
  );

  const readyForImpact =
    hasExplicitAcceptance &&
    (hasToBe || hasDataModel || hasApi) &&
    blockingLeft.length === 0 &&
    acceptanceGaps.length === 0;

  const summary = readyForImpact
    ? `Refine pronto para Impact: MVP definido, aceite fechado, ${resolved.length} pergunta(s) resolvida(s), ${remaining.length} residual(is).`
    : `Refine incompleto: ${acceptanceGaps.length + scopeGaps.length} gap(s) de aceite/escopo, ${remaining.length} pergunta(s) em aberto — fechar antes do Impact.`;

  return {
    capabilityId: "eng_refine_story",
    stage: "refine",
    summary,
    mvp,
    acceptanceGaps,
    scopeGaps,
    resolvedQuestions: resolved,
    openQuestions: [...new Set(remaining)],
    checklist,
    readyForImpact,
    risks: understand.risks,
    understand,
  };
}
