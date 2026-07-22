import type {
  CapabilitiesAnalyzeResult,
  CreateEdgeProjectResult,
  CreateProjectInput,
  EdgeInstallInfo,
  EdgeTokenCreated,
  EngineInfo,
  ProductMetrics,
  Project,
  SchemaSnapshot,
} from "./types";
import { ENGINE_OPTIONS } from "./types";

const STORAGE_KEY = "synapsee_admin_projects";

function loadProjects(): Project[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const list = raw ? (JSON.parse(raw) as Project[]) : [];
    return list.map((p) => ({
      ...p,
      activeCapabilities: p.activeCapabilities ?? [],
      roleOverrides: p.roleOverrides ?? {},
    }));
  } catch {
    return [];
  }
}

function saveProjects(projects: Project[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(projects));
}

function delay(ms = 600) {
  return new Promise((r) => setTimeout(r, ms));
}

const MOCK_SCHEMA: SchemaSnapshot = {
  engine: "postgresql",
  resources: [
    {
      name: "clientes",
      schema: "public",
      kind: "table",
      primaryKey: ["id"],
      fields: [
        { name: "id", dataType: "uuid", nullable: false, isPrimaryKey: true },
        { name: "nome", dataType: "text", nullable: false },
        { name: "email", dataType: "text", nullable: true },
        { name: "criado_em", dataType: "timestamptz", nullable: false },
      ],
    },
    {
      name: "vendas",
      schema: "public",
      kind: "table",
      primaryKey: ["id"],
      fields: [
        { name: "id", dataType: "uuid", nullable: false, isPrimaryKey: true },
        { name: "cliente_id", dataType: "uuid", nullable: false },
        { name: "valor", dataType: "numeric", nullable: false },
        { name: "data", dataType: "date", nullable: false },
      ],
    },
    {
      name: "produtos",
      schema: "public",
      kind: "table",
      primaryKey: ["id"],
      fields: [
        { name: "id", dataType: "uuid", nullable: false, isPrimaryKey: true },
        { name: "sku", dataType: "text", nullable: false },
        { name: "nome", dataType: "text", nullable: false },
        { name: "preco", dataType: "numeric", nullable: false },
      ],
    },
    {
      name: "contratos",
      schema: "public",
      kind: "table",
      primaryKey: ["id"],
      fields: [
        { name: "id", dataType: "uuid", nullable: false, isPrimaryKey: true },
        { name: "cliente_id", dataType: "uuid", nullable: false },
        { name: "status", dataType: "text", nullable: false },
      ],
    },
  ],
};

const MOCK_ROWS: Record<string, Record<string, unknown>[]> = {
  clientes: [
    { id: "c1", nome: "Acme Ltda", email: "contato@acme.com", criado_em: "2026-01-10" },
    { id: "c2", nome: "Beta Soft", email: "hi@betasoft.io", criado_em: "2026-02-14" },
    { id: "c3", nome: "Gamma ERP", email: "ops@gamma.erp", criado_em: "2026-03-01" },
  ],
  vendas: [
    { id: "v1", cliente_id: "c1", valor: 1290.5, data: "2026-06-01" },
    { id: "v2", cliente_id: "c2", valor: 4300, data: "2026-06-12" },
  ],
  produtos: [
    { id: "p1", sku: "SKU-01", nome: "Plano Pro", preco: 149 },
    { id: "p2", sku: "SKU-02", nome: "Plano Starter", preco: 49 },
  ],
  contratos: [
    { id: "ct1", cliente_id: "c1", status: "ativo" },
    { id: "ct2", cliente_id: "c3", status: "pendente" },
  ],
};

export const mockApi = {
  async listEngines(): Promise<EngineInfo[]> {
    await delay(200);
    return ENGINE_OPTIONS;
  },

  async getMetrics(): Promise<ProductMetrics> {
    await delay(200);
    const projects = loadProjects();
    const withCaps = projects.filter((p) => (p.activeCapabilities ?? []).length > 0);
    return {
      projectsTotal: projects.length,
      projectsWithActiveCapabilities: withCaps.length,
      pctWithActiveCapabilities:
        projects.length === 0
          ? 0
          : Math.round((withCaps.length / projects.length) * 1000) / 10,
      avgActiveCapabilities:
        projects.length === 0
          ? 0
          : Math.round(
              (projects.reduce((s, p) => s + (p.activeCapabilities?.length ?? 0), 0) /
                projects.length) *
                10,
            ) / 10,
      overridesLast7Days: 0,
      timeToFirstUseful: { sampleSize: 0, medianMs: null, p90Ms: null },
      eventsLast7Days: [],
    };
  },

  async listProjects(): Promise<Project[]> {
    await delay(300);
    return loadProjects();
  },

  async createProject(input: CreateProjectInput): Promise<Project> {
    await delay(900);
    const project: Project = {
      id: crypto.randomUUID().slice(0, 8),
      name: input.name,
      engine: input.engine,
      host: input.host,
      port: input.port,
      database: input.database,
      username: input.username,
      readOnly: input.readOnly ?? true,
      exposedResources: [],
      activeCapabilities: [],
      roleOverrides: {},
      connectionMode: "cloud",
      edgeStatus: "pending",
      status: "connected",
      createdAt: new Date().toISOString(),
    };
    const all = loadProjects();
    all.unshift(project);
    saveProjects(all);
    return project;
  },

  async createEdgeProject(input: {
    name: string;
    engine?: string;
    readOnly?: boolean;
  }): Promise<CreateEdgeProjectResult> {
    await delay(500);
    const project: Project = {
      id: crypto.randomUUID().slice(0, 8),
      name: input.name,
      engine: (input.engine as Project["engine"]) ?? "postgresql",
      host: "(edge)",
      port: 0,
      database: "(local)",
      username: "(edge)",
      readOnly: input.readOnly ?? true,
      exposedResources: [],
      activeCapabilities: [],
      roleOverrides: {},
      connectionMode: "edge",
      edgeStatus: "pending",
      edgeLastSeen: null,
      edgeVersion: null,
      edgeResourceCount: null,
      status: "pending",
      createdAt: new Date().toISOString(),
    };
    const all = loadProjects();
    all.unshift(project);
    saveProjects(all);
    const token = `syn_edge_mock_${project.id}`;
    const dockerRun = [
      "docker run -d --name synapsee-edge \\",
      `  -e SYNAPSEE_TOKEN=${token} \\`,
      "  -e SYNAPSEE_CLOUD_URL=http://localhost:3000 \\",
      "  -e SYNAPSEE_DB_ENGINE=postgresql \\",
      "  -e SYNAPSEE_DB_HOST=host.docker.internal \\",
      "  -e SYNAPSEE_DB_PORT=5432 \\",
      "  -e SYNAPSEE_DB_NAME=mydb \\",
      "  -e SYNAPSEE_DB_USER=myuser \\",
      "  -e SYNAPSEE_DB_PASSWORD=secret \\",
      "  synapsee/edge:latest",
    ].join("\n");
    const dockerCompose = `services:
  synapsee-edge:
    image: synapsee/edge:latest
    container_name: synapsee-edge
    restart: unless-stopped
    environment:
      SYNAPSEE_TOKEN: ${token}
      SYNAPSEE_CLOUD_URL: http://localhost:3000
      SYNAPSEE_DB_ENGINE: postgresql
      SYNAPSEE_DB_HOST: host.docker.internal
      SYNAPSEE_DB_PORT: "5432"
      SYNAPSEE_DB_NAME: mydb
      SYNAPSEE_DB_USER: myuser
      SYNAPSEE_DB_PASSWORD: secret
    extra_hosts:
      - "host.docker.internal:host-gateway"
`;
    return {
      project,
      edgeToken: {
        id: crypto.randomUUID(),
        token,
        tokenPrefix: token.slice(0, 16),
        createdAt: new Date().toISOString(),
        warning: "Guarde este token agora — ele não será mostrado novamente.",
        install: { dockerRun, dockerCompose },
      },
      install: {
        cloudUrl: "http://localhost:3000",
        dockerRun,
        dockerCompose,
      },
    };
  },

  async createEdgeToken(projectId: string): Promise<EdgeTokenCreated> {
    await delay(300);
    const p = loadProjects().find((x) => x.id === projectId);
    if (!p || p.connectionMode !== "edge") throw new Error("Projeto Edge não encontrado");
    const token = `syn_edge_mock_${projectId}_${Date.now()}`;
    const dockerRun = [
      "docker run -d --name synapsee-edge \\",
      `  -e SYNAPSEE_TOKEN=${token} \\`,
      "  -e SYNAPSEE_CLOUD_URL=http://localhost:3000 \\",
      "  synapsee/edge:latest",
    ].join("\n");
    return {
      id: crypto.randomUUID(),
      token,
      tokenPrefix: token.slice(0, 16),
      createdAt: new Date().toISOString(),
      warning: "Guarde este token agora — ele não será mostrado novamente.",
      install: {
        dockerRun,
        dockerCompose: `services:\n  synapsee-edge:\n    image: synapsee/edge:latest\n    environment:\n      SYNAPSEE_TOKEN: ${token}\n`,
      },
    };
  },

  async getEdgeInstall(projectId: string): Promise<EdgeInstallInfo> {
    await delay(200);
    const p = loadProjects().find((x) => x.id === projectId);
    if (!p) throw new Error("Sistema não encontrado");
    return {
      cloudUrl: "http://localhost:3000",
      note: "Gere um Project Token para obter o comando com SYNAPSEE_TOKEN.",
      dockerRunTemplate:
        "docker run -d --name synapsee-edge \\\n  -e SYNAPSEE_TOKEN=<PROJECT_TOKEN> \\\n  -e SYNAPSEE_CLOUD_URL=http://localhost:3000 \\\n  synapsee/edge:latest",
      dockerComposeTemplate:
        "services:\n  synapsee-edge:\n    image: synapsee/edge:latest\n    environment:\n      SYNAPSEE_TOKEN: <PROJECT_TOKEN>\n",
      status: {
        edgeStatus: p.edgeStatus ?? "pending",
        edgeLastSeen: p.edgeLastSeen ?? null,
        edgeVersion: p.edgeVersion ?? null,
        online: p.edgeStatus === "online",
      },
    };
  },

  async listEdgeTokens(projectId: string) {
    await delay(200);
    const p = loadProjects().find((x) => x.id === projectId);
    return {
      tokens: [],
      edgeOnline: p?.edgeStatus === "online",
      edgeStatus: p?.edgeStatus ?? "pending",
      edgeLastSeen: p?.edgeLastSeen ?? null,
      edgeVersion: p?.edgeVersion ?? null,
    };
  },

  async revokeEdgeToken(_projectId: string, _tokenId: string) {
    await delay(200);
    return { ok: true };
  },

  async getProject(id: string): Promise<Project | null> {
    await delay(200);
    return loadProjects().find((p) => p.id === id) ?? null;
  },

  async testProject(id: string): Promise<{ ok: boolean }> {
    await delay(400);
    const p = loadProjects().find((x) => x.id === id);
    return { ok: Boolean(p) };
  },

  async getSchema(id: string): Promise<SchemaSnapshot> {
    await delay(1200);
    const p = loadProjects().find((x) => x.id === id);
    return {
      ...MOCK_SCHEMA,
      engine: p?.engine ?? "postgresql",
    };
  },

  async expose(id: string, resources: string[]): Promise<Project> {
    await delay(800);
    const all = loadProjects();
    const idx = all.findIndex((p) => p.id === id);
    if (idx === -1) throw new Error("Sistema não encontrado");
    all[idx] = { ...all[idx], exposedResources: resources };
    saveProjects(all);
    return all[idx];
  },

  async deleteProject(id: string): Promise<void> {
    await delay(200);
    saveProjects(loadProjects().filter((p) => p.id !== id));
  },

  async probe(
    id: string,
    resource: string,
    opts?: { limit?: number },
  ): Promise<unknown[]> {
    await delay(500);
    const p = loadProjects().find((x) => x.id === id);
    if (!p?.exposedResources.includes(resource)) {
      throw new Error("Recurso não exposto");
    }
    const rows = MOCK_ROWS[resource] ?? [];
    return rows.slice(0, opts?.limit ?? 10);
  },

  async analyzeCapabilities(id: string): Promise<CapabilitiesAnalyzeResult> {
    await delay(700);
    const p = loadProjects().find((x) => x.id === id);
    return {
      profile: {
        domain: "erp_commerce",
        confidence: 0.86,
        resourceRoles: [
          { resource: "clientes", role: "customer", confidence: 1 },
          { resource: "pedidos", role: "order", confidence: 1 },
          { resource: "produtos", role: "product", confidence: 1 },
        ],
        signals: [],
      },
      suggestions: [
        {
          id: "customer_summary",
          title: "Resumo do cliente",
          description: "Pedidos e total gasto",
          domain: "erp_commerce",
          requiredRoles: ["customer", "order"],
          bindings: { customer: "clientes", order: "pedidos" },
          available: true,
        },
        {
          id: "find_open_orders",
          title: "Pedidos abertos",
          description: "Status aberto/pendente",
          domain: "erp_commerce",
          requiredRoles: ["order"],
          bindings: { order: "pedidos", statusField: "status" },
          available: true,
        },
        {
          id: "explain_business_model",
          title: "Explicar modelo de negócio",
          description: "Resume metadados do schema",
          domain: "any",
          requiredRoles: [],
          bindings: {},
          available: true,
        },
      ],
      llmUsed: false,
      activeCapabilities: p?.activeCapabilities ?? [],
      exposedResources: p?.exposedResources ?? [],
    };
  },

  async getCapabilities(id: string) {
    const analyzed = await this.analyzeCapabilities(id);
    return {
      activeCapabilities: analyzed.activeCapabilities,
      suggestions: analyzed.suggestions,
      profile: analyzed.profile,
    };
  },

  async setCapabilities(id: string, capabilityIds: string[]): Promise<Project> {
    await delay(400);
    const all = loadProjects();
    const idx = all.findIndex((p) => p.id === id);
    if (idx === -1) throw new Error("Sistema não encontrado");
    all[idx] = { ...all[idx], activeCapabilities: capabilityIds };
    saveProjects(all);
    return all[idx];
  },

  async setRoleOverrides(id: string, overrides: Record<string, string>) {
    await delay(300);
    const all = loadProjects();
    const idx = all.findIndex((p) => p.id === id);
    if (idx === -1) throw new Error("Sistema não encontrado");
    all[idx] = { ...all[idx], roleOverrides: overrides };
    saveProjects(all);
    const analyzed = await this.analyzeCapabilities(id);
    return {
      project: all[idx],
      profile: analyzed.profile,
      suggestions: analyzed.suggestions,
    };
  },
};
