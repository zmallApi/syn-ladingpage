import type { SchemaSnapshot } from "@synapse/core";

const schemaCache = new Map<string, SchemaSnapshot>();

export function getCachedSchema(projectId: string): SchemaSnapshot | undefined {
  return schemaCache.get(projectId);
}

export function setCachedSchema(projectId: string, snap: SchemaSnapshot) {
  schemaCache.set(projectId, snap);
}

export function clearCachedSchema(projectId: string) {
  schemaCache.delete(projectId);
}
