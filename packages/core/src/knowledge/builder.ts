import { z } from "zod";
import {
  completeAndParse,
  getDefaultLlmProvider,
  type LlmProvider,
} from "../llm/index.js";
import type { SchemaSnapshot } from "../adapters/types.js";
import type { BusinessProfile } from "../capabilities/types.js";
import type { CanonicalEntity, CanonicalEntityType } from "./types.js";
import {
  DOMAIN_TAG_PROMPT_VERSION,
  ENTITY_ROLE_PROMPT_VERSION,
  SEMANTIC_SUMMARY_PROMPT_VERSION,
  fingerprintInput,
  projectDomainSubjectId,
  schemaSubjectId,
  type EnrichmentPort,
  type EnrichmentUpsert,
  type KnowledgeEnrichment,
} from "./enrichment.js";

const summarySchema = z.object({
  summary: z.string(),
  responsibilities: z.array(z.string()).default([]),
});

const entityRoleSchema = z.object({
  proposedType: z.enum(["Service", "API", "Module"]),
  label: z.string(),
  rationale: z.string().optional(),
});

export type EnrichBatchResult = {
  processed: number;
  created: number;
  skipped: number;
  llmCalls: number;
  enrichments: KnowledgeEnrichment[];
};

export type KnowledgeBuilderOptions = {
  provider?: LlmProvider;
  /** Max subjects to enrich per run */
  limit?: number;
};

function truncate(text: string, max = 1200): string {
  const t = text.trim();
  return t.length <= max ? t : `${t.slice(0, max)}…`;
}

function heuristicServiceType(
  title: string,
): CanonicalEntityType | null {
  const t = title.toLowerCase();
  if (/\b(api|controller|endpoint|route)\b/.test(t) || t.endsWith("api")) {
    return "API";
  }
  if (
    /\b(service|handler|use.?case|manager|gateway|client)\b/.test(t) ||
    t.endsWith("service")
  ) {
    return "Service";
  }
  return null;
}

/**
 * Knowledge Builder — LLM as motor; persists typed enrichments into the KL.
 * Never a chatbot. Idempotent on subject+kind+fingerprint.
 */
export class KnowledgeBuilder {
  constructor(
    private enrichments: EnrichmentPort,
    private opts: KnowledgeBuilderOptions = {},
  ) {}

  private provider(): LlmProvider {
    return this.opts.provider ?? getDefaultLlmProvider();
  }

  /**
   * Enrich Module (and similar) subjects with semantic_summary + entity_role.
   */
  async enrichEngineeringSubjects(
    subjects: CanonicalEntity[],
  ): Promise<EnrichBatchResult> {
    const limit = this.opts.limit ?? 40;
    const candidates = subjects
      .filter((e) => e.type === "Module" || e.type === "Service" || e.type === "API")
      .slice(0, limit);

    const out: KnowledgeEnrichment[] = [];
    let created = 0;
    let skipped = 0;
    let llmCalls = 0;

    for (const subject of candidates) {
      const summary = await this.enrichSemanticSummary(subject);
      if (summary.status === "created" && summary.row) {
        created += 1;
        if (summary.llmCalled) llmCalls += 1;
        out.push(summary.row);
      } else {
        skipped += 1;
        if (summary.row) out.push(summary.row);
      }

      const role = await this.enrichEntityRole(subject);
      if (role.status === "created" && role.row) {
        created += 1;
        if (role.llmCalled) llmCalls += 1;
        out.push(role.row);
      } else {
        skipped += 1;
        if (role.row) out.push(role.row);
      }
    }

    return {
      processed: candidates.length,
      created,
      skipped,
      llmCalls,
      enrichments: out,
    };
  }

  async enrichSemanticSummary(
    subject: CanonicalEntity,
  ): Promise<{
    status: "created" | "skipped";
    llmCalled: boolean;
    row: KnowledgeEnrichment | null;
  }> {
    const text = truncate(subject.text || subject.title);
    const fp = fingerprintInput([
      SEMANTIC_SUMMARY_PROMPT_VERSION,
      subject.id,
      subject.title,
      text,
    ]);
    const existing = this.enrichments.findFresh(
      subject.id,
      "semantic_summary",
      fp,
    );
    if (existing) {
      return { status: "skipped", llmCalled: false, row: existing };
    }

    const provider = this.provider();
    let payload: Record<string, unknown>;
    let providerName = "heuristic";
    let model = "none";
    let llmCalled = false;

    const llm = await completeAndParse(
      provider,
      {
        task: "semantic_summary",
        temperature: 0,
        messages: [
          {
            role: "system",
            content: [
              "You are a Knowledge Builder analyst for Synapsee.",
              "Explain the role of a code module/service from its name and evidence text.",
              "Reply JSON: { summary: string (PT-BR, 1-3 sentences), responsibilities: string[] }.",
              "Do not invent files, APIs, or systems not implied by the evidence.",
            ].join(" "),
          },
          {
            role: "user",
            content: JSON.stringify({
              title: subject.title,
              type: subject.type,
              evidence: text,
            }),
          },
        ],
      },
      summarySchema,
    );

    if (llm) {
      llmCalled = true;
      providerName = llm.provider;
      model = llm.model;
      payload = {
        summary: llm.data.summary.trim(),
        responsibilities: (llm.data.responsibilities ?? []).slice(0, 12),
      };
    } else {
      payload = {
        summary: `Módulo/componente: ${subject.title}`,
        responsibilities: [] as string[],
        heuristic: true,
      };
    }

    const row = this.enrichments.upsert({
      subjectId: subject.id,
      kind: "semantic_summary",
      payload,
      confidence: llmCalled ? 0.7 : 0.35,
      status: "proposed",
      provider: providerName,
      model,
      promptVersion: SEMANTIC_SUMMARY_PROMPT_VERSION,
      inputFingerprint: fp,
      evidence: {
        title: subject.title,
        type: subject.type,
        source: subject.source,
        url: subject.url,
      },
    });
    return { status: "created", llmCalled, row };
  }

  async enrichEntityRole(
    subject: CanonicalEntity,
  ): Promise<{
    status: "created" | "skipped";
    llmCalled: boolean;
    row: KnowledgeEnrichment | null;
  }> {
    const text = truncate(subject.text || subject.title, 600);
    const fp = fingerprintInput([
      ENTITY_ROLE_PROMPT_VERSION,
      subject.id,
      subject.title,
      text,
    ]);
    const existing = this.enrichments.findFresh(subject.id, "entity_role", fp);
    if (existing) {
      return { status: "skipped", llmCalled: false, row: existing };
    }

    const heuristic = heuristicServiceType(subject.title);
    const provider = this.provider();
    let proposedType: CanonicalEntityType = heuristic ?? "Module";
    let label = subject.title;
    let rationale: string | undefined = heuristic
      ? "Heuristic from module name"
      : undefined;
    let providerName = "heuristic";
    let model = "none";
    let llmCalled = false;
    let confidence = heuristic ? 0.55 : 0.3;

    if (provider.isAvailable() && (heuristic || subject.type === "Module")) {
      const llm = await completeAndParse(
        provider,
        {
          task: "entity_role",
          temperature: 0,
          messages: [
            {
              role: "system",
              content: [
                "Classify an engineering subject as Service, API, or Module.",
                "Reply JSON: { proposedType, label, rationale }.",
                "Only use evidence. Prefer Service for business logic, API for HTTP/controllers.",
              ].join(" "),
            },
            {
              role: "user",
              content: JSON.stringify({
                title: subject.title,
                type: subject.type,
                evidence: text,
              }),
            },
          ],
        },
        entityRoleSchema,
      );
      if (llm) {
        llmCalled = true;
        providerName = llm.provider;
        model = llm.model;
        proposedType = llm.data.proposedType;
        label = llm.data.label.trim() || subject.title;
        rationale = llm.data.rationale;
        confidence = 0.75;
      }
    }

    if (!heuristic && !llmCalled && subject.type !== "Module") {
      return { status: "skipped", llmCalled: false, row: null };
    }

    const row = this.enrichments.upsert({
      subjectId: subject.id,
      kind: "entity_role",
      payload: {
        proposedType,
        label,
        rationale,
        sourceType: subject.type,
      },
      confidence,
      status: "proposed",
      provider: providerName,
      model,
      promptVersion: ENTITY_ROLE_PROMPT_VERSION,
      inputFingerprint: fp,
      evidence: {
        title: subject.title,
        type: subject.type,
        source: subject.source,
      },
    });
    return { status: "created", llmCalled, row };
  }

  /**
   * Persist business profile roles/domain as enrichments (schema subjects).
   * Idempotent; does not require LLM when profile already computed.
   */
  enrichBusinessProfile(
    projectId: string,
    profile: BusinessProfile,
    schema: SchemaSnapshot,
    meta?: { llmUsed?: boolean; provider?: string; model?: string },
  ): EnrichBatchResult {
    const out: KnowledgeEnrichment[] = [];
    let created = 0;
    let skipped = 0;
    const providerName = meta?.llmUsed
      ? (meta.provider ?? "openai")
      : "heuristics";
    const modelName = meta?.llmUsed ? (meta.model ?? "unknown") : "none";

    const domainFp = fingerprintInput([
      DOMAIN_TAG_PROMPT_VERSION,
      profile.domain,
      profile.confidence,
    ]);
    const domainSubject = projectDomainSubjectId(projectId);
    const existingDomain = this.enrichments.findFresh(
      domainSubject,
      "domain_tag",
      domainFp,
    );
    if (existingDomain) {
      skipped += 1;
      out.push(existingDomain);
    } else {
      out.push(
        this.enrichments.upsert({
          subjectId: domainSubject,
          kind: "domain_tag",
          payload: {
            domain: profile.domain,
            confidence: profile.confidence,
          },
          confidence: profile.confidence,
          status: "proposed",
          provider: providerName,
          model: modelName,
          promptVersion: DOMAIN_TAG_PROMPT_VERSION,
          inputFingerprint: domainFp,
          evidence: { resourceCount: schema.resources.length },
        }),
      );
      created += 1;
    }

    for (const role of profile.resourceRoles) {
      const subjectId = schemaSubjectId(role.resource);
      const fp = fingerprintInput([
        ENTITY_ROLE_PROMPT_VERSION,
        role.resource,
        role.role,
        role.confidence,
      ]);
      const existing = this.enrichments.findFresh(subjectId, "entity_role", fp);
      if (existing) {
        skipped += 1;
        out.push(existing);
        continue;
      }
      out.push(
        this.enrichments.upsert({
          subjectId,
          kind: "entity_role",
          payload: {
            proposedType: role.role,
            label: role.resource,
            businessRole: role.role,
          },
          confidence: role.confidence,
          status: "proposed",
          provider: providerName,
          model: modelName,
          promptVersion: ENTITY_ROLE_PROMPT_VERSION,
          inputFingerprint: fp,
          evidence: {
            resource: role.resource,
            role: role.role,
          },
        }),
      );
      created += 1;
    }

    return {
      processed: 1 + profile.resourceRoles.length,
      created,
      skipped,
      llmCalls: meta?.llmUsed ? 1 : 0,
      enrichments: out,
    };
  }

  /**
   * Human role overrides → confirmed entity_role enrichments (Party/Ledger…).
   */
  confirmBusinessRoleOverrides(
    overrides: Record<string, string>,
  ): EnrichBatchResult {
    const out: KnowledgeEnrichment[] = [];
    let created = 0;
    let skipped = 0;

    for (const [resource, role] of Object.entries(overrides)) {
      if (!resource || !role || role === "unknown") continue;
      const subjectId = schemaSubjectId(resource);
      const fp = fingerprintInput([
        ENTITY_ROLE_PROMPT_VERSION,
        "human_override",
        resource,
        role,
      ]);
      const existing = this.enrichments.findFresh(subjectId, "entity_role", fp);
      if (existing?.status === "confirmed") {
        skipped += 1;
        out.push(existing);
        continue;
      }
      const row = this.enrichments.upsert({
        subjectId,
        kind: "entity_role",
        payload: {
          proposedType: role,
          label: resource,
          businessRole: role,
        },
        confidence: 1,
        status: "confirmed",
        provider: "human",
        model: "none",
        promptVersion: ENTITY_ROLE_PROMPT_VERSION,
        inputFingerprint: fp,
        evidence: { resource, role, via: "role_override" },
      });
      if (row.status !== "confirmed") {
        this.enrichments.setStatus(row.id, "confirmed");
      }
      out.push(row);
      created += 1;
    }

    return {
      processed: Object.keys(overrides).length,
      created,
      skipped,
      llmCalls: 0,
      enrichments: out,
    };
  }
}

export type { EnrichmentUpsert };
