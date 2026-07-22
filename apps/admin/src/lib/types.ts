export type DatabaseEngine =
  | "postgresql"
  | "mysql"
  | "sqlserver"
  | "oracle"
  | "mongodb";

export type EngineStatus = "ready" | "planned";

export interface EngineInfo {
  engine: DatabaseEngine;
  label: string;
  status: EngineStatus;
}

export interface FieldMeta {
  name: string;
  dataType: string;
  nullable: boolean;
  isPrimaryKey?: boolean;
}

export interface ResourceMeta {
  name: string;
  schema?: string;
  kind: "table" | "collection" | "view";
  fields: FieldMeta[];
  primaryKey?: string[];
}

export interface SchemaSnapshot {
  engine: DatabaseEngine;
  resources: ResourceMeta[];
}

export type ConnectionMode = "cloud" | "edge";
export type EdgeStatus = "pending" | "online" | "offline" | "error";

export interface Project {
  id: string;
  name: string;
  engine: DatabaseEngine;
  host: string;
  port: number;
  database: string;
  username: string;
  readOnly: boolean;
  exposedResources: string[];
  activeCapabilities: string[];
  roleOverrides?: Record<string, string>;
  connectionMode?: ConnectionMode;
  edgeStatus?: EdgeStatus;
  edgeLastSeen?: string | null;
  edgeVersion?: string | null;
  edgeResourceCount?: number | null;
  status: "connected" | "error" | "pending" | "online" | "offline";
  createdAt: string;
}

export interface EdgeTokenCreated {
  id: string;
  token: string;
  tokenPrefix: string;
  createdAt: string;
  warning?: string;
  install?: {
    dockerRun: string;
    dockerCompose: string;
  };
}

export interface EdgeInstallInfo {
  cloudUrl: string;
  note?: string;
  dockerRunTemplate: string;
  dockerComposeTemplate: string;
  status: {
    edgeStatus: EdgeStatus;
    edgeLastSeen: string | null;
    edgeVersion: string | null;
    online: boolean;
  };
}

export interface CreateEdgeProjectResult {
  project: Project;
  edgeToken: EdgeTokenCreated;
  install: {
    cloudUrl: string;
    dockerRun: string;
    dockerCompose: string;
  };
}

export interface CapabilitySuggestion {
  id: string;
  title: string;
  description: string;
  domain: string;
  kind?: "capability" | "playbook";
  requiredRoles: string[];
  bindings: Record<string, string>;
  available: boolean;
  reason?: string;
}

export interface BusinessProfile {
  domain: string;
  confidence: number;
  resourceRoles: Array<{
    resource: string;
    role: string;
    confidence: number;
    inferred?: boolean;
  }>;
  signals: Array<{ kind: string; resource?: string; field?: string; detail: string }>;
  roleOverrides?: Record<string, string>;
}

export interface CapabilitiesAnalyzeResult {
  profile: BusinessProfile;
  suggestions: CapabilitySuggestion[];
  suggestedPack?: {
    id: string;
    title: string;
    description: string;
    capabilityIds: string[];
    reason: string;
  } | null;
  llmUsed: boolean;
  llmRationale?: string;
  activeCapabilities: string[];
  exposedResources: string[];
  roleOverrides?: Record<string, string>;
}

export interface CreateProjectInput {
  name: string;
  engine: DatabaseEngine;
  host: string;
  port: number;
  database: string;
  username: string;
  password: string;
  readOnly?: boolean;
}

export type ProductEventType =
  | "capability_activated"
  | "role_override"
  | "cap_preview"
  | "cap_mcp_invoke";

export interface ProductMetrics {
  projectsTotal: number;
  projectsWithActiveCapabilities: number;
  pctWithActiveCapabilities: number;
  avgActiveCapabilities: number;
  overridesLast7Days: number;
  timeToFirstUseful: {
    sampleSize: number;
    medianMs: number | null;
    p90Ms: number | null;
  };
  eventsLast7Days: Array<{ type: ProductEventType; count: number }>;
}

export type McpClientId =
  | "cursor"
  | "claude"
  | "vscode"
  | "windsurf"
  | "chatgpt"
  | "generic";

export interface McpClientSnippet {
  id: McpClientId | string;
  label: string;
  configPath: string;
  notes: string[];
  config: Record<string, unknown>;
}

export interface McpManifest {
  url: string;
  tools: string[];
  clients?: McpClientSnippet[];
  cursorMcpConfig?: unknown;
  claudeDesktopStdio?: unknown;
  exposedResources?: string[];
}

export const ENGINE_OPTIONS: EngineInfo[] = [
  { engine: "postgresql", label: "PostgreSQL", status: "ready" },
  { engine: "mysql", label: "MySQL", status: "ready" },
  { engine: "sqlserver", label: "SQL Server", status: "planned" },
  { engine: "oracle", label: "Oracle", status: "planned" },
  { engine: "mongodb", label: "MongoDB", status: "planned" },
];
