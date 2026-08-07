import type {
  BusinessProfile,
  CapabilitiesAnalyzeResult,
  CapabilitySuggestion,
  CreateEdgeProjectResult,
  CreateProjectInput,
  EdgeInstallInfo,
  EdgeTokenCreated,
  EngineInfo,
  McpManifest,
  ProductMetrics,
  Project,
  PublicLlmConfig,
  SchemaSnapshot,
} from "./types";
import { mockApi } from "./mock";

const API_KEY_STORAGE = "synapsee_admin_api_key";
const JWT_STORAGE = "synapsee_admin_jwt";
const TENANT_STORAGE = "synapsee_admin_tenant";
export const USE_MOCK = import.meta.env.VITE_USE_MOCK !== "false";
const BASE = (import.meta.env.VITE_API_URL ?? "").replace(/\/$/, "");

export function getApiKey(): string | null {
  return localStorage.getItem(API_KEY_STORAGE);
}

export function setApiKey(key: string) {
  localStorage.setItem(API_KEY_STORAGE, key);
}

export function getToken(): string | null {
  return localStorage.getItem(JWT_STORAGE);
}

export function setToken(token: string) {
  localStorage.setItem(JWT_STORAGE, token);
}

export function getStoredTenant(): { id: string; name: string } | null {
  try {
    const raw = localStorage.getItem(TENANT_STORAGE);
    return raw ? (JSON.parse(raw) as { id: string; name: string }) : null;
  } catch {
    return null;
  }
}

export function setStoredTenant(tenant: { id: string; name: string } | null) {
  if (!tenant) localStorage.removeItem(TENANT_STORAGE);
  else localStorage.setItem(TENANT_STORAGE, JSON.stringify(tenant));
}

export function clearApiKey() {
  localStorage.removeItem(API_KEY_STORAGE);
  localStorage.removeItem(JWT_STORAGE);
  localStorage.removeItem(TENANT_STORAGE);
}

export function isAuthenticated(): boolean {
  return Boolean(getToken() || getApiKey());
}

function formatApiError(body: unknown, status: number): string {
  if (body && typeof body === "object" && "error" in body) {
    const err = (body as { error: unknown }).error;
    if (typeof err === "string" && err.trim()) return err;
    if (err != null && typeof err !== "string") return JSON.stringify(err);
  }
  return `Erro ${status}`;
}

async function request<T>(
  path: string,
  init?: RequestInit,
  opts?: { apiKey?: string | null; token?: string | null; allow404?: boolean; skipAuth?: boolean },
): Promise<T> {
  const method = (init?.method ?? "GET").toUpperCase();
  const hasBody = init?.body != null && init.body !== "";

  const headers: Record<string, string> = {
    ...(init?.headers as Record<string, string> | undefined),
  };

  if (!opts?.skipAuth) {
    const token = opts?.token !== undefined ? opts.token : getToken();
    const key = opts?.apiKey !== undefined ? opts.apiKey : getApiKey();
    if (token) headers.Authorization = `Bearer ${token}`;
    else if (key) headers["X-API-Key"] = key;
  }

  // Avoid Fastify FST_ERR_CTP_EMPTY_JSON_BODY on DELETE/GET with Content-Type set.
  if (hasBody || method === "POST" || method === "PUT" || method === "PATCH") {
    if (!headers["Content-Type"] && !headers["content-type"]) {
      headers["Content-Type"] = "application/json";
    }
  }

  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers,
  });

  if (opts?.allow404 && res.status === 404) return null as T;

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(formatApiError(body, res.status));
  }

  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

/** Validates a key against the real API (no-op in mock mode). */
export async function verifyApiKey(key: string): Promise<void> {
  if (USE_MOCK) return;
  await request("/engines", undefined, { apiKey: key, token: null });
}

export type AuthSession = {
  token: string;
  user: { id: string; email: string; name: string } | null;
  tenant: { id: string; name: string; slug: string; plan: string };
  membership: { role: string };
  usage?: {
    projects: number;
    missionRunsMonth: number;
    maxProjects: number;
    maxMissionRunsMonth: number;
  };
  apiKey?: {
    id: string;
    token: string;
    prefix: string;
    name: string;
    warning?: string;
  };
};

export const api = {
  async signup(input: {
    email: string;
    password: string;
    companyName: string;
    name?: string;
  }): Promise<AuthSession> {
    if (USE_MOCK) {
      const session: AuthSession = {
        token: "mock-jwt",
        user: {
          id: "u1",
          email: input.email,
          name: input.name ?? "Owner",
        },
        tenant: {
          id: "t1",
          name: input.companyName,
          slug: "mock",
          plan: "beta",
        },
        membership: { role: "owner" },
        usage: {
          projects: 0,
          missionRunsMonth: 0,
          maxProjects: 3,
          maxMissionRunsMonth: 200,
        },
        apiKey: {
          id: "k1",
          token: "syn_tk_mock",
          prefix: "syn_tk_mock",
          name: "Default",
          warning: "Mock key",
        },
      };
      setToken(session.token);
      setApiKey(session.apiKey!.token);
      setStoredTenant({ id: session.tenant.id, name: session.tenant.name });
      return session;
    }
    const session = await request<AuthSession>("/auth/signup", {
      method: "POST",
      body: JSON.stringify(input),
    }, { skipAuth: true });
    setToken(session.token);
    if (session.apiKey?.token) setApiKey(session.apiKey.token);
    setStoredTenant({ id: session.tenant.id, name: session.tenant.name });
    return session;
  },

  async login(input: {
    email: string;
    password: string;
  }): Promise<AuthSession> {
    if (USE_MOCK) {
      const session: AuthSession = {
        token: "mock-jwt",
        user: { id: "u1", email: input.email, name: "Demo" },
        tenant: {
          id: "t1",
          name: "Demo Co",
          slug: "demo",
          plan: "beta",
        },
        membership: { role: "owner" },
        usage: {
          projects: 0,
          missionRunsMonth: 0,
          maxProjects: 3,
          maxMissionRunsMonth: 200,
        },
      };
      setToken(session.token);
      setStoredTenant({ id: session.tenant.id, name: session.tenant.name });
      return session;
    }
    const session = await request<AuthSession>("/auth/login", {
      method: "POST",
      body: JSON.stringify(input),
    }, { skipAuth: true });
    setToken(session.token);
    localStorage.removeItem(API_KEY_STORAGE);
    setStoredTenant({ id: session.tenant.id, name: session.tenant.name });
    return session;
  },

  me(): Promise<{
    authType: string;
    user: { id: string; email: string; name: string } | null;
    tenant: { id: string; name: string; slug: string; plan: string };
    membership: { role: string };
    usage?: AuthSession["usage"];
  }> {
    if (USE_MOCK) {
      return Promise.resolve({
        authType: "user",
        user: { id: "u1", email: "demo@synapsee.ai", name: "Demo" },
        tenant: { id: "t1", name: "Demo Co", slug: "demo", plan: "beta" },
        membership: { role: "owner" },
        usage: {
          projects: 0,
          missionRunsMonth: 0,
          maxProjects: 3,
          maxMissionRunsMonth: 200,
        },
      });
    }
    return request("/auth/me");
  },

  listApiKeys(tenantId: string): Promise<{
    keys: Array<{
      id: string;
      name: string;
      prefix: string;
      createdAt: string;
      revokedAt: string | null;
    }>;
  }> {
    if (USE_MOCK) return Promise.resolve({ keys: [] });
    return request(`/tenants/${tenantId}/api-keys`);
  },

  createApiKey(
    tenantId: string,
    name?: string,
  ): Promise<{
    id: string;
    name: string;
    prefix: string;
    token: string;
    createdAt: string;
    warning?: string;
  }> {
    if (USE_MOCK) {
      return Promise.resolve({
        id: "k-new",
        name: name ?? "API key",
        prefix: "syn_tk_mock",
        token: "syn_tk_mock_new",
        createdAt: new Date().toISOString(),
        warning: "Mock key",
      });
    }
    return request(`/tenants/${tenantId}/api-keys`, {
      method: "POST",
      body: JSON.stringify({ name }),
    });
  },

  revokeApiKey(tenantId: string, keyId: string): Promise<void> {
    if (USE_MOCK) return Promise.resolve();
    return request(`/tenants/${tenantId}/api-keys/${keyId}`, {
      method: "DELETE",
    });
  },

  listEngines(): Promise<EngineInfo[]> {
    if (USE_MOCK) return mockApi.listEngines();
    return request("/engines");
  },

  getMetrics(): Promise<ProductMetrics> {
    if (USE_MOCK) return mockApi.getMetrics();
    return request("/metrics");
  },

  listProjects(): Promise<Project[]> {
    if (USE_MOCK) return mockApi.listProjects();
    return request("/projects");
  },

  createProject(input: CreateProjectInput): Promise<Project> {
    if (USE_MOCK) return mockApi.createProject(input);
    return request("/projects", { method: "POST", body: JSON.stringify(input) });
  },

  createEdgeProject(input: {
    name: string;
    engine?: string;
    readOnly?: boolean;
    vertical?: "business" | "engineering";
  }): Promise<CreateEdgeProjectResult> {
    if (USE_MOCK) return mockApi.createEdgeProject(input);
    return request("/projects/edge", { method: "POST", body: JSON.stringify(input) });
  },

  createEdgeToken(projectId: string): Promise<EdgeTokenCreated> {
    if (USE_MOCK) return mockApi.createEdgeToken(projectId);
    return request(`/projects/${projectId}/edge-tokens`, { method: "POST", body: "{}" });
  },

  getEdgeInstall(projectId: string): Promise<EdgeInstallInfo> {
    if (USE_MOCK) return mockApi.getEdgeInstall(projectId);
    return request(`/projects/${projectId}/edge/install`);
  },

  listEdgeTokens(projectId: string): Promise<{
    tokens: Array<{
      id: string;
      tokenPrefix: string;
      createdAt: string;
      revokedAt: string | null;
    }>;
    edgeOnline: boolean;
    edgeStatus: string;
    edgeLastSeen: string | null;
    edgeVersion: string | null;
  }> {
    if (USE_MOCK) return mockApi.listEdgeTokens(projectId);
    return request(`/projects/${projectId}/edge-tokens`);
  },

  revokeEdgeToken(projectId: string, tokenId: string): Promise<{ ok: boolean }> {
    if (USE_MOCK) return mockApi.revokeEdgeToken(projectId, tokenId);
    return request(`/projects/${projectId}/edge-tokens/${tokenId}`, {
      method: "DELETE",
    });
  },

  getProject(id: string): Promise<Project | null> {
    if (USE_MOCK) return mockApi.getProject(id);
    return request(`/projects/${id}`, undefined, { allow404: true });
  },

  testProject(id: string): Promise<{ ok: boolean }> {
    if (USE_MOCK) return mockApi.testProject(id);
    return request(`/projects/${id}/test`);
  },

  getSchema(id: string): Promise<SchemaSnapshot> {
    if (USE_MOCK) return mockApi.getSchema(id);
    return request(`/projects/${id}/schema`);
  },

  expose(id: string, resources: string[]): Promise<Project> {
    if (USE_MOCK) return mockApi.expose(id, resources);
    return request(`/projects/${id}/expose`, {
      method: "PUT",
      body: JSON.stringify({ resources }),
    });
  },

  getLlmConfig(id: string): Promise<{ llmConfig: PublicLlmConfig }> {
    return request(`/projects/${id}/llm-config`);
  },

  setLlmConfig(
    id: string,
    body: {
      provider?:
        | "openai"
        | "anthropic"
        | "gemini"
        | "openai_compatible"
        | "none";
      model?: string | null;
      baseUrl?: string | null;
      apiKey?: string | null;
      clearApiKey?: boolean;
      enabled?: boolean;
    },
  ): Promise<{ llmConfig: PublicLlmConfig }> {
    return request(`/projects/${id}/llm-config`, {
      method: "PUT",
      body: JSON.stringify(body),
    });
  },

  analyzeCapabilities(id: string): Promise<CapabilitiesAnalyzeResult> {
    if (USE_MOCK) return mockApi.analyzeCapabilities(id);
    return request(`/projects/${id}/capabilities/analyze`);
  },

  getCapabilities(id: string): Promise<{
    activeCapabilities: string[];
    suggestions: CapabilitiesAnalyzeResult["suggestions"];
    profile: CapabilitiesAnalyzeResult["profile"];
  }> {
    if (USE_MOCK) return mockApi.getCapabilities(id);
    return request(`/projects/${id}/capabilities`);
  },

  setCapabilities(id: string, capabilityIds: string[]): Promise<Project> {
    if (USE_MOCK) return mockApi.setCapabilities(id, capabilityIds);
    return request(`/projects/${id}/capabilities`, {
      method: "PUT",
      body: JSON.stringify({ capabilityIds }),
    });
  },

  setRoleOverrides(
    id: string,
    overrides: Record<string, string>,
  ): Promise<{
    project: Project;
    profile: BusinessProfile;
    suggestions: CapabilitySuggestion[];
  }> {
    if (USE_MOCK) return mockApi.setRoleOverrides(id, overrides);
    return request(`/projects/${id}/role-overrides`, {
      method: "PUT",
      body: JSON.stringify({ overrides }),
    });
  },

  previewCapability(
    id: string,
    capId: string,
    args?: Record<string, unknown>,
  ): Promise<{ capabilityId: string; args: Record<string, unknown>; result: unknown }> {
    if (USE_MOCK) {
      return Promise.resolve({
        capabilityId: capId,
        args: args ?? {},
        result: { preview: true, mock: true, note: "Preview mock" },
      });
    }
    return request(`/projects/${id}/capabilities/${capId}/preview`, {
      method: "POST",
      body: JSON.stringify({ args: args ?? {} }),
    });
  },

  deleteProject(id: string): Promise<void> {
    if (USE_MOCK) return mockApi.deleteProject(id);
    return request(`/projects/${id}`, { method: "DELETE" });
  },

  probe(id: string, resource: string, opts?: { limit?: number }): Promise<unknown[]> {
    if (USE_MOCK) return mockApi.probe(id, resource, opts);
    const limit = opts?.limit ?? 10;
    return request(`/p/${id}/${resource}?limit=${limit}`);
  },

  openApiUrl(id: string): string {
    return `${BASE || ""}/p/${id}/openapi.json`;
  },

  mcpUrl(id: string): string {
    return `${BASE || ""}/p/${id}/mcp`;
  },

  async fetchMcpManifest(id: string): Promise<McpManifest> {
    if (USE_MOCK) {
      const url = `/p/${id}/mcp`;
      const serverId = `synapsee-${id.slice(0, 8)}`;
      return {
        url,
        tools: [
          "list_exposed_resources",
          "describe_resource",
          "query_records",
          "get_record",
          "create_record",
        ],
        clients: [
          {
            id: "cursor",
            label: "Cursor",
            configPath: "~/.cursor/mcp.json",
            notes: ["Modo mock"],
            config: {
              mcpServers: {
                [serverId]: {
                  url,
                  headers: { "X-API-Key": "<TENANT_API_KEY>" },
                },
              },
            },
          },
        ],
        cursorMcpConfig: {},
        exposedResources: [],
      };
    }
    return request(`/p/${id}/mcp.json`);
  },

  async fetchOpenApi(id: string): Promise<unknown> {
    if (USE_MOCK) {
      return {
        openapi: "3.0.3",
        info: { title: `Mock ${id}`, version: "1.0.0" },
        paths: {},
      };
    }
    return request(`/p/${id}/openapi.json`);
  },

  knowledgeStats(id: string): Promise<{
    vertical: string;
    entities: number;
    edges: number;
    enrichments?: number;
    knowledgeSources: Array<{ kind: string; enabled: boolean; scopes?: string[] }>;
    sync: Array<{
      projection: string;
      lastSyncAt: string | null;
      cursor: string | null;
      entityCount: number;
      edgeCount: number;
      lastError: string | null;
    }>;
  }> {
    return request(`/projects/${id}/knowledge/stats`);
  },

  syncKnowledge(
    id: string,
    body: {
      kind: "github" | "clickup" | "confluence";
      token?: string;
      scopes?: string[];
      maxFacts?: number;
      full?: boolean;
    },
  ): Promise<{
    kind: string;
    upserted: { entities: number; edges: number };
    linked: number;
    incremental: boolean;
    cursor: string | null;
    stats: { entities: number; edges: number };
  }> {
    return request(`/projects/${id}/knowledge/sync`, {
      method: "POST",
      body: JSON.stringify(body),
    });
  },

  linkKnowledge(id: string): Promise<{
    linked: number;
    cleared: number;
    stats: { entities: number; edges: number };
  }> {
    return request(`/projects/${id}/knowledge/link`, {
      method: "POST",
      body: JSON.stringify({}),
    });
  },

  listKnowledgeLinks(
    id: string,
    opts?: { status?: "inferred" | "confirmed" | "rejected"; limit?: number },
  ): Promise<{
    links: Array<{
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
      evidence?: Record<string, unknown>;
    }>;
  }> {
    const params = new URLSearchParams();
    if (opts?.status) params.set("status", opts.status);
    if (opts?.limit) params.set("limit", String(opts.limit));
    const qs = params.toString();
    return request(`/projects/${id}/knowledge/links${qs ? `?${qs}` : ""}`);
  },

  confirmKnowledgeLink(
    id: string,
    body: { fromId: string; toId: string; rel?: "implements" | "related_to" },
  ): Promise<{ link: Record<string, unknown> | null }> {
    return request(`/projects/${id}/knowledge/links/confirm`, {
      method: "POST",
      body: JSON.stringify(body),
    });
  },

  rejectKnowledgeLink(
    id: string,
    body: { fromId: string; toId: string; rel?: "implements" | "related_to" },
  ): Promise<{ link: Record<string, unknown> | null }> {
    return request(`/projects/${id}/knowledge/links/reject`, {
      method: "POST",
      body: JSON.stringify(body),
    });
  },

  enrichKnowledge(
    id: string,
    body?: { limit?: number },
  ): Promise<{
    processed: number;
    created: number;
    skipped: number;
    llmCalls: number;
    llm: {
      used: boolean;
      calls: number;
      available: boolean;
      provider: string;
      model: string;
      note: string;
    };
    stats: { entities: number; edges: number; enrichments: number };
  }> {
    return request(`/projects/${id}/knowledge/enrich`, {
      method: "POST",
      body: JSON.stringify(body ?? {}),
    });
  },

  listKnowledgeEnrichments(
    id: string,
    opts?: {
      status?: "proposed" | "confirmed" | "rejected";
      kind?: string;
      limit?: number;
    },
  ): Promise<{
    enrichments: Array<{
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
    }>;
  }> {
    const params = new URLSearchParams();
    if (opts?.status) params.set("status", opts.status);
    if (opts?.kind) params.set("kind", opts.kind);
    if (opts?.limit) params.set("limit", String(opts.limit));
    const qs = params.toString();
    return request(
      `/projects/${id}/knowledge/enrichments${qs ? `?${qs}` : ""}`,
    );
  },

  confirmKnowledgeEnrichment(
    id: string,
    body: { id: string },
  ): Promise<{
    enrichment: Record<string, unknown>;
    promoted?: Record<string, unknown> | null;
  }> {
    return request(`/projects/${id}/knowledge/enrichments/confirm`, {
      method: "POST",
      body: JSON.stringify(body),
    });
  },

  rejectKnowledgeEnrichment(
    id: string,
    body: { id: string },
  ): Promise<{ enrichment: Record<string, unknown> }> {
    return request(`/projects/${id}/knowledge/enrichments/reject`, {
      method: "POST",
      body: JSON.stringify(body),
    });
  },

  discoverStory(
    id: string,
    taskRef: string,
  ): Promise<Record<string, unknown>> {
    return request(`/projects/${id}/knowledge/discover`, {
      method: "POST",
      body: JSON.stringify({ taskRef }),
    });
  },

  /** Story OS Understand (alias of discover) */
  understandStory(
    id: string,
    taskRef: string,
  ): Promise<Record<string, unknown>> {
    return request(`/projects/${id}/knowledge/understand`, {
      method: "POST",
      body: JSON.stringify({ taskRef }),
    });
  },

  /** Story OS Refine */
  refineStory(
    id: string,
    taskRef: string,
  ): Promise<Record<string, unknown>> {
    return request(`/projects/${id}/knowledge/refine`, {
      method: "POST",
      body: JSON.stringify({ taskRef }),
    });
  },

  /** Story OS Impact */
  impactStory(
    id: string,
    taskRef: string,
  ): Promise<Record<string, unknown>> {
    return request(`/projects/${id}/knowledge/impact`, {
      method: "POST",
      body: JSON.stringify({ taskRef }),
    });
  },

  /** Story OS Plan */
  planStory(
    id: string,
    taskRef: string,
  ): Promise<Record<string, unknown>> {
    return request(`/projects/${id}/knowledge/plan`, {
      method: "POST",
      body: JSON.stringify({ taskRef }),
    });
  },

  /** Story OS Execute (context pack) */
  executeContext(
    id: string,
    taskRef: string,
  ): Promise<Record<string, unknown>> {
    return request(`/projects/${id}/knowledge/execute`, {
      method: "POST",
      body: JSON.stringify({ taskRef }),
    });
  },

  listKnowledgeFacts(
    id: string,
    opts?: { type?: string; q?: string; limit?: number },
  ): Promise<{ facts: Array<Record<string, unknown>>; stats?: { entities: number; edges: number } }> {
    const params = new URLSearchParams();
    if (opts?.type) params.set("type", opts.type);
    if (opts?.q) params.set("q", opts.q);
    if (opts?.limit) params.set("limit", String(opts.limit));
    const qs = params.toString();
    return request(`/projects/${id}/knowledge/facts${qs ? `?${qs}` : ""}`);
  },

  listMissions(id: string): Promise<{
    missions: Array<{
      id: string;
      title: string;
      intent: string;
      description: string;
      capabilities: string[];
      vertical: string;
      paramSchema: Array<{
        name: string;
        type: string;
        required?: boolean;
        description: string;
      }>;
    }>;
    vertical: string;
  }> {
    return request(`/projects/${id}/missions`);
  },

  runMission(
    id: string,
    missionId: string,
    params?: Record<string, unknown>,
  ): Promise<{
    runId: string;
    missionId: string;
    capabilityTrace: string[];
    package: {
      role: string;
      agentBrief: string;
      objective: string;
      ready: boolean;
      warnings: string[];
      [key: string]: unknown;
    };
    createdAt: string;
  }> {
    return request(`/projects/${id}/missions/run`, {
      method: "POST",
      body: JSON.stringify({ missionId, params: params ?? {} }),
    });
  },

  listMissionRuns(
    id: string,
    limit = 10,
  ): Promise<{
    runs: Array<{
      id: string;
      missionId: string;
      ready: boolean;
      createdAt: string;
      package: Record<string, unknown>;
    }>;
  }> {
    return request(`/projects/${id}/missions/runs?limit=${limit}`);
  },
};
