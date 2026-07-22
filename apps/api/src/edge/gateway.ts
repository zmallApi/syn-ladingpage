import { randomUUID } from "node:crypto";
import type { WebSocket } from "ws";
import type { ProjectStore } from "@synapse/storage";
import type { SchemaSnapshot } from "@synapse/core";
import { setCachedSchema } from "../schemaCache.js";

export type EdgeJobType =
  | "ping"
  | "testConnection"
  | "introspect"
  | "list"
  | "getById"
  | "insert";

export interface EdgeJob {
  id: string;
  type: EdgeJobType;
  args?: Record<string, unknown>;
}

type Pending = {
  resolve: (data: unknown) => void;
  reject: (err: Error) => void;
  timer: ReturnType<typeof setTimeout>;
};

type Session = {
  projectId: string;
  socket: WebSocket;
  pending: Map<string, Pending>;
};

const DEFAULT_TIMEOUT_MS = 30_000;

export class EdgeGateway {
  private sessions = new Map<string, Session>();
  private store: ProjectStore;

  constructor(store: ProjectStore) {
    this.store = store;
  }

  isOnline(projectId: string): boolean {
    const s = this.sessions.get(projectId);
    return Boolean(s && s.socket.readyState === 1);
  }

  attachSocket(projectId: string, socket: WebSocket) {
    const existing = this.sessions.get(projectId);
    if (existing) {
      try {
        existing.socket.close(1000, "replaced");
      } catch {
        /* ignore */
      }
      this.failAll(existing, new Error("Edge reconectou; job cancelado"));
    }

    const session: Session = { projectId, socket, pending: new Map() };
    this.sessions.set(projectId, session);

    socket.on("message", (raw) => {
      this.onMessage(session, raw.toString());
    });

    socket.on("close", () => {
      if (this.sessions.get(projectId) === session) {
        this.sessions.delete(projectId);
        this.store.markEdgeOffline(projectId);
        this.failAll(session, new Error("Edge desconectado"));
      }
    });

    socket.on("error", () => {
      /* close handler marks offline */
    });
  }

  private failAll(session: Session, err: Error) {
    for (const [, p] of session.pending) {
      clearTimeout(p.timer);
      p.reject(err);
    }
    session.pending.clear();
  }

  private onMessage(session: Session, text: string) {
    let msg: Record<string, unknown>;
    try {
      msg = JSON.parse(text) as Record<string, unknown>;
    } catch {
      return;
    }

    const type = String(msg.type ?? "");

    if (type === "heartbeat") {
      const raw = String(msg.status ?? "online");
      const status =
        raw === "error" ? "error" : raw === "offline" ? "offline" : "online";
      this.store.setEdgePresence(session.projectId, {
        status,
        version: typeof msg.version === "string" ? msg.version : undefined,
        engine: typeof msg.engine === "string" ? msg.engine : undefined,
        resourceCount:
          typeof msg.resourceCount === "number" ? msg.resourceCount : undefined,
      });
      return;
    }

    if (type === "schemaSnapshot" && msg.schema && typeof msg.schema === "object") {
      const schema = msg.schema as SchemaSnapshot;
      setCachedSchema(session.projectId, schema);
      this.store.setEdgePresence(session.projectId, {
        status: "online",
        resourceCount: Array.isArray(schema.resources) ? schema.resources.length : undefined,
      });
      return;
    }

    if (type === "jobResult" || type === "jobError") {
      const jobId = String(msg.jobId ?? "");
      const pending = session.pending.get(jobId);
      if (!pending) return;
      clearTimeout(pending.timer);
      session.pending.delete(jobId);
      if (type === "jobError") {
        pending.reject(new Error(String(msg.error ?? "Edge job error")));
      } else {
        pending.resolve(msg.data);
      }
    }
  }

  async dispatch<T = unknown>(
    projectId: string,
    type: EdgeJobType,
    args?: Record<string, unknown>,
    timeoutMs = DEFAULT_TIMEOUT_MS,
  ): Promise<T> {
    const session = this.sessions.get(projectId);
    if (!session || session.socket.readyState !== 1) {
      throw new EdgeOfflineError();
    }

    const id = randomUUID();
    const job: EdgeJob = { id, type, args };

    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        session.pending.delete(id);
        reject(new Error(`Edge job timeout (${type}) após ${timeoutMs}ms`));
      }, timeoutMs);

      session.pending.set(id, {
        resolve: (data) => resolve(data as T),
        reject,
        timer,
      });

      try {
        session.socket.send(JSON.stringify({ type: "job", job }));
      } catch (err) {
        clearTimeout(timer);
        session.pending.delete(id);
        reject(err instanceof Error ? err : new Error(String(err)));
      }
    });
  }

  async introspect(projectId: string): Promise<SchemaSnapshot> {
    return this.dispatch<SchemaSnapshot>(projectId, "introspect");
  }

  async testConnection(projectId: string): Promise<{ ok: boolean }> {
    const data = await this.dispatch<{ ok?: boolean }>(projectId, "testConnection");
    return { ok: data?.ok !== false };
  }
}

export class EdgeOfflineError extends Error {
  constructor(message = "Edge offline — instale ou reinicie o agente Synapsee Edge") {
    super(message);
    this.name = "EdgeOfflineError";
  }
}
