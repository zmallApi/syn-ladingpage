import "dotenv/config";
import WebSocket from "ws";
import {
  findResource,
  getAdapterOrThrow,
  type ConnectionConfig,
  type SchemaSnapshot,
} from "@synapse/core";

const VERSION = "0.1.0";
const HEARTBEAT_MS = 15_000;

async function probeDb(
  config: ConnectionConfig,
): Promise<{ ok: boolean; error?: string }> {
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

function required(name: string): string {
  const v = process.env[name]?.trim();
  if (!v) throw new Error(`Missing required env: ${name}`);
  return v;
}

function dbConfigFromEnv(): ConnectionConfig {
  return {
    engine: process.env.SYNAPSEE_DB_ENGINE?.trim() || "postgresql",
    host: required("SYNAPSEE_DB_HOST"),
    port: Number(process.env.SYNAPSEE_DB_PORT ?? 5432),
    database: required("SYNAPSEE_DB_NAME"),
    username: required("SYNAPSEE_DB_USER"),
    password: required("SYNAPSEE_DB_PASSWORD"),
    readOnly: process.env.SYNAPSEE_DB_READ_ONLY !== "false",
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

type Job = {
  id: string;
  type: string;
  args?: Record<string, unknown>;
};

async function runJob(
  config: ConnectionConfig,
  job: Job,
  schemaCache: { current: SchemaSnapshot | null },
): Promise<unknown> {
  const adapter = getAdapterOrThrow(config.engine);
  const args = job.args ?? {};

  async function schema(): Promise<SchemaSnapshot> {
    if (schemaCache.current) return schemaCache.current;
    schemaCache.current = await adapter.introspect(config);
    return schemaCache.current;
  }

  switch (job.type) {
    case "ping":
      return { ok: true, version: VERSION };
    case "testConnection":
      await adapter.testConnection(config);
      return { ok: true };
    case "introspect": {
      const snap = await adapter.introspect(config);
      schemaCache.current = snap;
      return snap;
    }
    case "list": {
      const snap = await schema();
      const resource = String(args.resource ?? "");
      const meta = findResource(snap, resource);
      if (!meta) throw new Error(`Resource not found: ${resource}`);
      return adapter.list(config, meta, {
        limit: Number(args.limit ?? 20) || 20,
        offset: Number(args.offset ?? 0) || 0,
        filter: args.filter as Record<string, unknown> | undefined,
      });
    }
    case "getById": {
      const snap = await schema();
      const resource = String(args.resource ?? "");
      const meta = findResource(snap, resource);
      if (!meta) throw new Error(`Resource not found: ${resource}`);
      return adapter.getById(config, meta, String(args.id ?? ""));
    }
    case "insert": {
      const snap = await schema();
      const resource = String(args.resource ?? "");
      const meta = findResource(snap, resource);
      if (!meta) throw new Error(`Resource not found: ${resource}`);
      return adapter.insert(
        config,
        meta,
        (args.data as Record<string, unknown>) ?? {},
      );
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
  const cloudUrl = (process.env.SYNAPSEE_CLOUD_URL ?? "http://localhost:3000").replace(
    /\/$/,
    "",
  );
  const config = dbConfigFromEnv();
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
  config: ConnectionConfig,
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
        engine: config.engine,
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
        backoffReset();

        const sendHeartbeat = async () => {
          const probe = await probeDb(config);
          if (!probe.ok) {
            console.warn("[edge] db probe failed:", probe.error);
            schemaCache.current = null;
          }
          send({
            type: "heartbeat",
            version: VERSION,
            engine: config.engine,
            resourceCount: schemaCache.current?.resources.length,
            status: probe.ok ? "online" : "error",
            dbOk: probe.ok,
            ...(probe.error ? { dbError: probe.error } : {}),
          });
        };

        void sendHeartbeat();
        heartbeat = setInterval(() => {
          void sendHeartbeat();
        }, HEARTBEAT_MS);

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
            });
            send({ type: "schemaSnapshot", schema: schemaCache.current });
          } catch (err) {
            console.warn(
              "[edge] initial introspect failed:",
              err instanceof Error ? err.message : err,
            );
            send({
              type: "heartbeat",
              version: VERSION,
              engine: config.engine,
              status: "error",
              dbOk: false,
              dbError: err instanceof Error ? err.message : String(err),
            });
          }
        })();
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

/** Used only to reset backoff after successful register — module-level helper. */
let lastRegisterOk = false;
function backoffReset() {
  lastRegisterOk = true;
  void lastRegisterOk;
}

connectLoop().catch((err) => {
  console.error("[edge] fatal:", err);
  process.exit(1);
});
