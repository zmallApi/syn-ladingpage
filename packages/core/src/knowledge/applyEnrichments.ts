import type { DiscoveryResult } from "./discovery.js";
import type { KnowledgeEnrichment } from "./enrichment.js";

/**
 * Prefer confirmed (then proposed) semantic summaries from the Knowledge Layer
 * over calling the LLM again for Discovery polish.
 */
export function applyEnrichmentsToDiscovery(
  base: DiscoveryResult,
  enrichments: KnowledgeEnrichment[],
): {
  result: DiscoveryResult;
  enrichmentsHit: number;
  skipLlmRefine: boolean;
} {
  const usable = enrichments.filter(
    (e) =>
      (e.status === "confirmed" || e.status === "proposed") &&
      e.kind === "semantic_summary",
  );
  if (!usable.length) {
    return { result: base, enrichmentsHit: 0, skipLlmRefine: false };
  }

  // Prefer confirmed
  usable.sort((a, b) => {
    if (a.status === b.status) return b.confidence - a.confidence;
    return a.status === "confirmed" ? -1 : 1;
  });

  const summaries = usable
    .map((e) => {
      const summary = String(e.payload.summary ?? "").trim();
      const title = String(e.evidence.title ?? e.subjectId);
      if (!summary) return null;
      return { title, summary, responsibilities: e.payload.responsibilities };
    })
    .filter(Boolean) as Array<{
    title: string;
    summary: string;
    responsibilities: unknown;
  }>;

  if (!summaries.length) {
    return { result: base, enrichmentsHit: 0, skipLlmRefine: false };
  }

  const knowledgeLines = summaries.map(
    (s) => `${s.title}: ${s.summary}`,
  );

  const whatAlreadyExists = [
    ...knowledgeLines.map((l) => `[KL] ${l}`),
    ...base.whatAlreadyExists.filter(
      (w) => !knowledgeLines.some((k) => w.includes(k.slice(0, 40))),
    ),
  ].slice(0, 24);

  const confirmedCount = usable.filter((e) => e.status === "confirmed").length;
  // Skip LLM refine when we have enough durable knowledge covering affected modules
  const skipLlmRefine =
    confirmedCount >= 1 ||
    (usable.length >= 2 &&
      base.affectedModules.some((m) =>
        usable.some((e) =>
          String(e.evidence.title ?? "")
            .toLowerCase()
            .includes(m.toLowerCase().slice(0, 12)),
        ),
      ));

  return {
    result: {
      ...base,
      whatAlreadyExists,
      summary: base.summary,
    },
    enrichmentsHit: usable.length,
    skipLlmRefine,
  };
}
