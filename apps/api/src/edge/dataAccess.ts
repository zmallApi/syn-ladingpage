import type { ConnectionConfig, ResourceMeta, SchemaSnapshot } from "@synapse/core";
import {
  findResource,
  getAdapterOrThrow,
} from "@synapse/core";
import type { ProjectRecord, ProjectStore } from "@synapse/storage";
import type { EdgeGateway } from "./gateway.js";
import { EdgeOfflineError } from "./gateway.js";
import { clearCachedSchema, getCachedSchema, setCachedSchema } from "../schemaCache.js";

export async function ensureProjectSchema(
  store: ProjectStore,
  edge: EdgeGateway,
  record: ProjectRecord,
): Promise<SchemaSnapshot> {
  let snap = getCachedSchema(record.id);
  if (snap) return snap;

  if (record.connectionMode === "edge") {
    if (!edge.isOnline(record.id)) {
      throw new EdgeOfflineError(
        "Modo Edge: instale o agente (docker run) e aguarde status online antes de continuar.",
      );
    }
    if (record.vertical === "business" && record.edgeStatus === "error") {
      throw new EdgeOfflineError(
        record.edgeLastError
          ? `Banco indisponível no Edge: ${record.edgeLastError}`
          : "Edge conectado, mas o banco não responde. Verifique SYNAPSEE_DB_* e se o banco está no ar.",
      );
    }
    if (record.vertical === "business" && record.edgeStatus !== "online") {
      throw new EdgeOfflineError(
        "Edge conectado; aguardando confirmação do banco (probe). Confira SYNAPSEE_DB_* no container.",
      );
    }
    snap = await edge.introspect(record.id);
  } else {
    const config = store.toConnectionConfig(record);
    const adapter = getAdapterOrThrow(record.engine);
    snap = await adapter.introspect(config);
  }
  setCachedSchema(record.id, snap);
  return snap;
}

export async function testProjectConnection(
  store: ProjectStore,
  edge: EdgeGateway,
  record: ProjectRecord,
): Promise<{ ok: boolean; error?: string }> {
  if (record.connectionMode === "edge") {
    if (!edge.isOnline(record.id)) {
      throw new EdgeOfflineError(
        "Modo Edge: instale o agente (docker run) e aguarde status online antes de testar.",
      );
    }
    if (record.vertical === "business" && record.edgeStatus === "error") {
      return {
        ok: false,
        error:
          record.edgeLastError ??
          "Edge conectado, mas o banco não responde.",
      };
    }
    try {
      const result = await edge.testConnection(record.id);
      return { ok: result.ok !== false };
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  try {
    const adapter = getAdapterOrThrow(record.engine);
    await Promise.race([
      adapter.testConnection(store.toConnectionConfig(record)),
      new Promise<never>((_, reject) =>
        setTimeout(
          () => reject(new Error("Timeout ao conectar no banco (5s)")),
          5_000,
        ),
      ),
    ]);
    store.setCloudStatus(record.id, "connected", null);
    return { ok: true };
  } catch (err) {
    const message =
      (err instanceof Error && err.message.trim()) ||
      (typeof err === "string" && err.trim()) ||
      "Não foi possível conectar ao banco (host/porta/database inacessíveis).";
    store.setCloudStatus(record.id, "error", message);
    clearCachedSchema(record.id);
    return { ok: false, error: message };
  }
}

/**
 * Revalida banco Cloud e persiste status. No-op for Edge (heartbeat cuida).
 * Returns updated record when cloud; otherwise original.
 */
export async function refreshCloudConnectionStatus(
  store: ProjectStore,
  edge: EdgeGateway,
  record: ProjectRecord,
): Promise<ProjectRecord> {
  if (record.connectionMode === "edge") return record;
  await testProjectConnection(store, edge, record);
  return store.get(record.id) ?? record;
}

export async function listProjectRows(
  store: ProjectStore,
  edge: EdgeGateway,
  record: ProjectRecord,
  meta: ResourceMeta,
  opts: { limit: number; offset: number; filter?: Record<string, unknown> },
): Promise<Record<string, unknown>[]> {
  if (record.connectionMode === "edge") {
    return edge.dispatch(record.id, "list", {
      resource: meta.name,
      limit: opts.limit,
      offset: opts.offset,
      filter: opts.filter,
    });
  }
  const config = store.toConnectionConfig(record);
  const adapter = getAdapterOrThrow(record.engine);
  const rows = await adapter.list(config, meta, opts);
  return rows as Record<string, unknown>[];
}

export async function getProjectRowById(
  store: ProjectStore,
  edge: EdgeGateway,
  record: ProjectRecord,
  meta: ResourceMeta,
  id: string,
): Promise<Record<string, unknown> | null> {
  if (record.connectionMode === "edge") {
    return edge.dispatch(record.id, "getById", { resource: meta.name, id });
  }
  const config = store.toConnectionConfig(record);
  const adapter = getAdapterOrThrow(record.engine);
  const row = await adapter.getById(config, meta, id);
  return (row as Record<string, unknown> | null) ?? null;
}

export async function insertProjectRow(
  store: ProjectStore,
  edge: EdgeGateway,
  record: ProjectRecord,
  meta: ResourceMeta,
  data: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  if (record.connectionMode === "edge") {
    return edge.dispatch(record.id, "insert", { resource: meta.name, data });
  }
  const config = store.toConnectionConfig(record);
  const adapter = getAdapterOrThrow(record.engine);
  const created = await adapter.insert(config, meta, data);
  return created as Record<string, unknown>;
}

/** Resolve resource meta from cached/live schema (for MCP tools). */
export async function resolveResourceMeta(
  store: ProjectStore,
  edge: EdgeGateway,
  record: ProjectRecord,
  resourceName: string,
): Promise<{ snap: SchemaSnapshot; meta: ResourceMeta } | null> {
  const snap = await ensureProjectSchema(store, edge, record);
  const meta = findResource(snap, resourceName);
  if (!meta) return null;
  return { snap, meta };
}

export function cloudConfigOrThrow(
  store: ProjectStore,
  record: ProjectRecord,
): ConnectionConfig {
  return store.toConnectionConfig(record);
}
