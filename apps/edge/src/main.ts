import "dotenv/config";
import WebSocket from "ws";
import {
  createClickUpProjection,
  createConfluenceProjection,
  createGitHubProjection,
  findResource,
  getAdapterOrThrow,
  watermarkFromFacts,
  type CanonicalFact,
  type ConnectionConfig,
  type ProjectionKind,
  type SchemaSnapshot,
  type SourceProjection,
} from "@synapse/core";

const VERSION = "0.1.0";
const HEARTBEAT_MS = 15_000;

async function probeDb(
  config: ConnectionConfig | null,
): Promise<{ ok: boolean; error?: string }> {
  if (!config) return { ok: true };
  try {
    await getAdapterOrThrow(config.engine).testConnection(config);
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

function optional(name: string): string | undefined {
  const v = process.env[name]?.trim();
  return v || undefined;
}

function required(name: string): string {
  const v = optional(name);
  if (!v) throw new Error(`Missing required env: ${name}`);
  return v;
}

function dbConfigFromEnv(): ConnectionConfig | null {
  const host = optional("SYNAPSEE_DB_HOST");
  if (!host) return null;
  return {
    engine: optional("SYNAPSEE_DB_ENGINE") || "postgresql",
    host,
    port: Number(optional("SYNAPSEE_DB_PORT") ?? 5432),
    database: required("SYNAPSEE_DB_NAME"),
    username: required("SYNAPSEE_DB_USER"),
    password: required("SYNAPSEE_DB_PASSWORD"),
    readOnly: optional("SYNAPSEE_DB_READ_ONLY") !== "false",
  };
}

function cloudWsUrl(httpUrl: string): string {
  const u = new URL(httpUrl);
  u.protocol = u.protocol === "https:" ? "wss:" : "ws:";
  u.pathname = "/edge/ws";
  u.search = "";
  u.hash = "";
  return u.toString();
}

function projectionFromEnv(kind: ProjectionKind): SourceProjection | null {
  if (kind === "github") {
    const token = optional("SYNAPSEE_GITHUB_TOKEN");
    if (!token) return null;
    const repos = optional("SYNAPSEE_GITHUB_REPOS")
      ?.split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    return createGitHubProjection({ token, repos });
  }
  if (kind === "confluence") {
    const token = optional("SYNAPSEE_CONFLUENCE_TOKEN");
    const email = optional("SYNAPSEE_CONFLUENCE_EMAIL");
    const baseUrl = optional("SYNAPSEE_CONFLUENCE_BASE_URL");
    if (!token || !email || !baseUrl) return null;
    const spaceKeys = optional("SYNAPSEE_CONFLUENCE_SPACES")
      ?.split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    return createConfluenceProjection({ token, email, baseUrl, spaceKeys });
  }
  const token = optional("SYNAPSEE_CLICKUP_TOKEN");
  if (!token) return null;
  const spaceIds = optional("SYNAPSEE_CLICKUP_SPACES")
    ?.split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return createClickUpProjection({ token, spaceIds });
}

type Job = {
  id: string;
  type: string;
  args?: Record<string, unknown>;
};

async function collectFacts(
  projection: SourceProjection,
  maxFacts = 5000,
  cursor?: string | null,
): Promise<{ facts: CanonicalFact[]; nextCursor: string | null }> {
  const facts: CanonicalFact[] = [];
  for await (const fact of projection.project(cursor ?? null)) {
    facts.push(fact);
    if (facts.length >= maxFacts) break;
  }
  return { facts, nextCursor: watermarkFromFacts(facts) };
}

async function runJob(
  config: ConnectionConfig | null,
  job: Job,
  schemaCache: { current: SchemaSnapshot | null },
): Promise<unknown> {
  const args = job.args ?? {};

  switch (job.type) {
    case "ping":
      return {
        ok: true,
        version: VERSION,
        hasDb: Boolean(config),
        hasGithub: Boolean(optional("SYNAPSEE_GITHUB_TOKEN")),
        hasClickup: Boolean(optional("SYNAPSEE_CLICKUP_TOKEN")),
      };
    case "testConnection": {
      if (!config) return { ok: true, mode: "engineering" };
      await getAdapterOrThrow(config.engine).testConnection(config);
      return { ok: true };
    }
    case "introspect": {
      if (!config) throw new Error("DB not configured on Edge");
      const snap = await getAdapterOrThrow(config.engine).introspect(config);
      schemaCache.current = snap;
      return snap;
    }
    case "list":
    case "getById":
    case "insert": {
      if (!config) throw new Error("DB not configured on Edge");
      const adapter = getAdapterOrThrow(config.engine);
      async function schema(): Promise<SchemaSnapshot> {
        if (schemaCache.current) return schemaCache.current;
        schemaCache.current = await adapter.introspect(config!);
        return schemaCache.current;
      }
      const snap = await schema();
      const resource = String(args.resource ?? "");
      const meta = findResource(snap, resource);
      if (!meta) throw new Error(`Resource not found: ${resource}`);
      if (job.type === "list") {
        return adapter.list(config, meta, {
          limit: Number(args.limit ?? 20) || 20,
          offset: Number(args.offset ?? 0) || 0,
          filter: args.filter as Record<string, unknown> | undefined,
        });
      }
      if (job.type === "getById") {
        return adapter.getById(config, meta, String(args.id ?? ""));
      }
      return adapter.insert(
        config,
        meta,
        (args.data as Record<string, unknown>) ?? {},
      );
    }
    case "projection.test": {
      const kind = String(args.kind ?? "") as ProjectionKind;
      const projection = projectionFromEnv(kind);
      if (!projection) {
        throw new Error(
          `Projection ${kind} not configured (set SYNAPSEE_${kind.toUpperCase()}_TOKEN)`,
        );
      }
      await projection.testConnection();
      const scopes = await projection.introspectScopes();
      return { ok: true, kind, scopes };
    }
    case "projection.syncPage": {
      const kind = String(args.kind ?? "") as ProjectionKind;
      const projection = projectionFromEnv(kind);
      if (!projection) {
        throw new Error(
          `Projection ${kind} not configured (set SYNAPSEE_${kind.toUpperCase()}_TOKEN)`,
        );
      }
      const cursor =
        args.cursor == null || args.cursor === ""
          ? null
          : String(args.cursor);
      const { facts, nextCursor } = await collectFacts(
        projection,
        Number(args.maxFacts ?? 5000),
        cursor,
      );
      return {
        kind,
        facts,
        count: facts.length,
        nextCursor: nextCursor ?? cursor,
        cursor,
      };
    }
    case "projection.get": {
      const kind = String(args.kind ?? "") as ProjectionKind;
      const type = String(args.entityType ?? "Task");
      const externalId = String(args.externalId ?? "");
      const projection = projectionFromEnv(kind);
      if (!projection) throw new Error(`Projection ${kind} not configured`);
      const entity = await projection.getByExternalId(
        type as never,
        externalId,
      );
      return { entity };
    }
    case "projection.scopes": {
      const kind = String(args.kind ?? "") as ProjectionKind;
      const projection = projectionFromEnv(kind);
      if (!projection) throw new Error(`Projection ${kind} not configured`);
      return { scopes: await projection.introspectScopes() };
    }
    default:
      throw new Error(`Unknown job type: ${job.type}`);
  }
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function connectLoop() {
  const token = required("SYNAPSEE_TOKEN");
  const cloudUrl = (optional("SYNAPSEE_CLOUD_URL") ?? "http://localhost:3000").replace(
    /\/$/,
    "",
  );
  const config = dbConfigFromEnv();
  if (!config) {
    console.log(
      "[edge] no SYNAPSEE_DB_* — engineering projections mode (GitHub/ClickUp)",
    );
  }
  const wsUrl = cloudWsUrl(cloudUrl);

  let backoff = 1000;

  for (;;) {
    console.log(`[edge] connecting to ${wsUrl}`);
    try {
      await runSession(wsUrl, token, config);
      backoff = 1000;
    } catch (err) {
      console.error("[edge] session ended:", err instanceof Error ? err.message : err);
    }
    console.log(`[edge] reconnect in ${backoff}ms`);
    await sleep(backoff);
    backoff = Math.min(backoff * 2, 30_000);
  }
}

function runSession(
  wsUrl: string,
  token: string,
  config: ConnectionConfig | null,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    let heartbeat: ReturnType<typeof setInterval> | null = null;
    const schemaCache: { current: SchemaSnapshot | null } = { current: null };
    let closed = false;

    const send = (msg: Record<string, unknown>) => {
      if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
    };

    const cleanup = () => {
      if (heartbeat) clearInterval(heartbeat);
      heartbeat = null;
    };

    ws.on("open", () => {
      send({
        type: "register",
        token,
        version: VERSION,
        engine: config?.engine ?? "engineering",
      });
    });

    ws.on("message", async (raw) => {
      let msg: Record<string, unknown>;
      try {
        msg = JSON.parse(raw.toString()) as Record<string, unknown>;
      } catch {
        return;
      }

      const type = String(msg.type ?? "");

      if (type === "registered") {
        console.log("[edge] registered", msg.projectId);
        const requireDb = Boolean(msg.requireDb);
        if (requireDb && !config) {
          console.error(
            "[edge] este projeto exige banco (Business/ERP) mas SYNAPSEE_DB_* não está configurado",
          );
        }

        const sendHeartbeat = async () => {
          if (requireDb && !config) {
            send({
              type: "heartbeat",
              version: VERSION,
              engine: "engineering",
              resourceCount: undefined,
              status: "error",
              dbOk: false,
              dbError:
                "SYNAPSEE_DB_HOST/NAME/USER/PASSWORD obrigatórios para projeto Business",
            });
            return;
          }

          const probe = await probeDb(config);
          if (config && !probe.ok) {
            console.warn("[edge] db probe failed:", probe.error);
            schemaCache.current = null;
          }
          const dbOk = !config || probe.ok;
          // Business: never "online" without a healthy DB.
          // Engineering (no DB): online means Edge + WS only.
          const status =
            requireDb || config ? (dbOk ? "online" : "error") : "online";
          send({
            type: "heartbeat",
            version: VERSION,
            engine: config?.engine ?? "engineering",
            resourceCount: schemaCache.current?.resources.length,
            status,
            dbOk,
            hasDb: Boolean(config),
            ...(probe.error ? { dbError: probe.error } : {}),
          });
        };

        void sendHeartbeat();
        heartbeat = setInterval(() => {
          void sendHeartbeat();
        }, HEARTBEAT_MS);

        if (config) {
          void (async () => {
            try {
              const adapter = getAdapterOrThrow(config.engine);
              schemaCache.current = await adapter.introspect(config);
              send({
                type: "heartbeat",
                version: VERSION,
                engine: config.engine,
                resourceCount: schemaCache.current.resources.length,
                status: "online",
                dbOk: true,
                hasDb: true,
              });
              send({ type: "schemaSnapshot", schema: schemaCache.current });
            } catch (err) {
              const message = err instanceof Error ? err.message : String(err);
              console.warn("[edge] initial introspect failed:", message);
              schemaCache.current = null;
              send({
                type: "heartbeat",
                version: VERSION,
                engine: config.engine,
                resourceCount: undefined,
                status: "error",
                dbOk: false,
                hasDb: true,
                dbError: message,
              });
            }
          })();
        }
        return;
      }

      if (type === "error") {
        console.error("[edge] cloud error:", msg.error);
        if (!closed) {
          closed = true;
          cleanup();
          ws.close();
          reject(new Error(String(msg.error)));
        }
        return;
      }

      if (type === "job" && msg.job && typeof msg.job === "object") {
        const job = msg.job as Job;
        console.log(`[edge] job ${job.type} ${job.id}`);
        try {
          const data = await runJob(config, job, schemaCache);
          if (job.type === "introspect" && data && typeof data === "object") {
            schemaCache.current = data as SchemaSnapshot;
          }
          send({ type: "jobResult", jobId: job.id, ok: true, data });
        } catch (err) {
          send({
            type: "jobError",
            jobId: job.id,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }
    });

    ws.on("close", () => {
      cleanup();
      if (!closed) {
        closed = true;
        resolve();
      }
    });

    ws.on("error", (err) => {
      cleanup();
      if (!closed) {
        closed = true;
        reject(err);
      }
    });
  });
}

connectLoop().catch((err) => {
  console.error("[edge] fatal:", err);
  process.exit(1);
});
