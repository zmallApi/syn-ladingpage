import { postgresqlAdapter } from "./postgresql/index.js";
import { mysqlAdapter } from "./mysql/index.js";
import { createStubAdapter } from "./stub.js";
import type { DatabaseAdapter, EngineInfo } from "./types.js";
import { AdapterNotFoundError, EngineNotImplementedError } from "./types.js";

const adapters = new Map<string, DatabaseAdapter>();

function register(adapter: DatabaseAdapter) {
  adapters.set(adapter.engine, adapter);
}

register(postgresqlAdapter);
register(mysqlAdapter);
register(createStubAdapter("sqlserver", "SQL Server"));
register(createStubAdapter("oracle", "Oracle"));
register(createStubAdapter("mongodb", "MongoDB"));

export function listEngines(): EngineInfo[] {
  return [...adapters.values()].map((a) => ({
    engine: a.engine,
    label: a.label,
    status: a.status,
  }));
}

export function resolveAdapter(engine: string): DatabaseAdapter {
  const adapter = adapters.get(engine);
  if (!adapter) throw new AdapterNotFoundError(engine);
  return adapter;
}

/** Resolves and ensures the engine is ready (not a stub). */
export function getAdapterOrThrow(engine: string): DatabaseAdapter {
  const adapter = resolveAdapter(engine);
  if (adapter.status !== "ready") {
    throw new EngineNotImplementedError(engine);
  }
  return adapter;
}
