import type {
  ConnectionConfig,
  DatabaseAdapter,
  EngineStatus,
  ListOptions,
  ResourceMeta,
  SchemaSnapshot,
} from "./types.js";
import { EngineNotImplementedError } from "./types.js";

export function createStubAdapter(
  engine: string,
  label: string,
  status: EngineStatus = "planned",
): DatabaseAdapter {
  const notReady = () => {
    throw new EngineNotImplementedError(engine);
  };

  return {
    engine,
    label,
    status,
    testConnection: async () => notReady(),
    introspect: async (): Promise<SchemaSnapshot> => notReady(),
    list: async (
      _c: ConnectionConfig,
      _r: ResourceMeta,
      _o: ListOptions,
    ): Promise<unknown[]> => notReady(),
    getById: async (): Promise<unknown | null> => notReady(),
    insert: async (): Promise<unknown> => notReady(),
  };
}
