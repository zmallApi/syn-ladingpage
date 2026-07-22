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
  SchemaSnapshot,
} from "./types";
import { mockApi } from "./mock";

const API_KEY_STORAGE = "synapsee_admin_api_key";
export const USE_MOCK = import.meta.env.VITE_USE_MOCK !== "false";
const BASE = (import.meta.env.VITE_API_URL ?? "").replace(/\/$/, "");

export function getApiKey(): string | null {
  return localStorage.getItem(API_KEY_STORAGE);
}

export function setApiKey(key: string) {
  localStorage.setItem(API_KEY_STORAGE, key);
}

export function clearApiKey() {
  localStorage.removeItem(API_KEY_STORAGE);
}

export function isAuthenticated(): boolean {
  return Boolean(getApiKey());
}

function formatApiError(body: unknown, status: number): string {
  if (body && typeof body === "object" && "error" in body) {
    const err = (body as { error: unknown }).error;
    if (typeof err === "string") return err;
    if (err != null) return JSON.stringify(err);
  }
  return `Erro ${status}`;
}

async function request<T>(
  path: string,
  init?: RequestInit,
  opts?: { apiKey?: string | null; allow404?: boolean },
): Promise<T> {
  const key = opts?.apiKey !== undefined ? opts.apiKey : getApiKey();
  const method = (init?.method ?? "GET").toUpperCase();
  const hasBody = init?.body != null && init.body !== "";

  const headers: Record<string, string> = {
    ...(key ? { "X-API-Key": key } : {}),
    ...(init?.headers as Record<string, string> | undefined),
  };
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
  await request("/engines", undefined, { apiKey: key });
}

export const api = {
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
                  headers: { "X-API-Key": "<PLATFORM_API_KEY>" },
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
};
