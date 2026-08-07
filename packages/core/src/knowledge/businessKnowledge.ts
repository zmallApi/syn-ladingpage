import type { KnowledgeLayerPort } from "./context.js";
import {
  projectDomainSubjectId,
  schemaSubjectId,
  type KnowledgeEnrichment,
} from "./enrichment.js";

export type BusinessRoleKnowledge = {
  resource: string;
  role: string;
  status: "proposed" | "confirmed";
  confidence: number;
  subjectId: string;
};

export type BusinessDomainKnowledge = {
  domain: string;
  confidence: number;
  status: "proposed" | "confirmed";
};

export type BusinessKnowledgeSnapshot = {
  domain?: BusinessDomainKnowledge;
  roles: BusinessRoleKnowledge[];
  enrichmentsHit: number;
  /** Human-readable lines for Mission Package brief */
  briefLines: string[];
};

/**
 * Load durable business enrichments (domain + schema roles) for Mission Engine.
 * Prefers confirmed; includes proposed when no confirmed peer exists for that subject.
 */
export function loadBusinessKnowledge(
  kl: KnowledgeLayerPort | undefined,
  projectId: string,
  resourceHints?: string[],
): BusinessKnowledgeSnapshot {
  const empty: BusinessKnowledgeSnapshot = {
    roles: [],
    enrichmentsHit: 0,
    briefLines: [],
  };
  if (!kl?.enrichments) return empty;

  const subjectIds = new Set<string>([projectDomainSubjectId(projectId)]);
  for (const r of resourceHints ?? []) {
    if (r.trim()) subjectIds.add(schemaSubjectId(r.trim()));
  }

  // Also pull any schema:* entity_role / domain we know about (broader list)
  const listed = kl.enrichments.list({
    limit: 200,
  });
  for (const e of listed) {
    if (
      e.kind === "entity_role" ||
      e.kind === "domain_tag" ||
      e.kind === "relationship"
    ) {
      subjectIds.add(e.subjectId);
    }
  }

  const rows = kl.enrichments.listBySubjects([...subjectIds], {
    status: ["confirmed", "proposed"],
    kinds: ["entity_role", "domain_tag"],
  });

  const bySubjectKind = new Map<string, KnowledgeEnrichment>();
  for (const e of rows) {
    const key = `${e.subjectId}|${e.kind}`;
    const prev = bySubjectKind.get(key);
    if (!prev) {
      bySubjectKind.set(key, e);
      continue;
    }
    // Prefer confirmed, then higher confidence
    if (e.status === "confirmed" && prev.status !== "confirmed") {
      bySubjectKind.set(key, e);
    } else if (
      e.status === prev.status &&
      e.confidence > prev.confidence
    ) {
      bySubjectKind.set(key, e);
    }
  }

  const chosen = [...bySubjectKind.values()];
  let domain: BusinessDomainKnowledge | undefined;
  const roles: BusinessRoleKnowledge[] = [];

  for (const e of chosen) {
    if (e.kind === "domain_tag") {
      const d = String(e.payload.domain ?? "").trim();
      if (d) {
        domain = {
          domain: d,
          confidence: e.confidence,
          status: e.status === "confirmed" ? "confirmed" : "proposed",
        };
      }
    }
    if (e.kind === "entity_role") {
      const resource = String(
        e.evidence.resource ??
          e.payload.label ??
          e.subjectId.replace(/^schema:/, ""),
      );
      const role = String(
        e.payload.businessRole ?? e.payload.proposedType ?? "",
      );
      if (resource && role) {
        roles.push({
          resource,
          role,
          status: e.status === "confirmed" ? "confirmed" : "proposed",
          confidence: e.confidence,
          subjectId: e.subjectId,
        });
      }
    }
  }

  const briefLines: string[] = [];
  if (domain) {
    briefLines.push(
      `Domínio de negócio (${domain.status}): ${domain.domain} (${Math.round(domain.confidence * 100)}%)`,
    );
  }
  const party = roles.find((r) => r.role === "party");
  const ledger = roles.find((r) => r.role === "ledger");
  if (party) {
    briefLines.push(
      `Party (${party.status}): tabela \`${party.resource}\` — pessoas/empresas que podem comprar, cancelar e receber cobrança`,
    );
  }
  if (ledger) {
    briefLines.push(
      `Ledger (${ledger.status}): tabela \`${ledger.resource}\` — títulos/financeiro relacionados à Party`,
    );
  }
  for (const r of roles) {
    if (r.role === "party" || r.role === "ledger") continue;
    briefLines.push(
      `${r.role} (${r.status}): \`${r.resource}\``,
    );
  }

  return {
    domain,
    roles,
    enrichmentsHit: chosen.length,
    briefLines,
  };
}
