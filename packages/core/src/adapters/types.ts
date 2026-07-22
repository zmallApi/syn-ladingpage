export type DatabaseEngine =
  | "postgresql"
  | "mysql"
  | "sqlserver"
  | "oracle"
  | "mongodb"
  | (string & {});

export type EngineStatus = "ready" | "planned";

export interface EngineInfo {
  engine: string;
  label: string;
  status: EngineStatus;
}

export interface ConnectionConfig {
  engine: string;
  host: string;
  port: number;
  database: string;
  username: string;
  password: string;
  options?: Record<string, unknown>;
  readOnly?: boolean;
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
  engine: string;
  resources: ResourceMeta[];
}

export interface ListOptions {
  limit: number;
  offset: number;
  filter?: Record<string, unknown>;
}

export interface DatabaseAdapter {
  readonly engine: string;
  readonly label: string;
  readonly status: EngineStatus;
  testConnection(config: ConnectionConfig): Promise<void>;
  introspect(config: ConnectionConfig): Promise<SchemaSnapshot>;
  list(
    config: ConnectionConfig,
    resource: ResourceMeta,
    opts: ListOptions,
  ): Promise<unknown[]>;
  getById(
    config: ConnectionConfig,
    resource: ResourceMeta,
    id: string | number,
  ): Promise<unknown | null>;
  insert(
    config: ConnectionConfig,
    resource: ResourceMeta,
    data: Record<string, unknown>,
  ): Promise<unknown>;
}

export class AdapterNotFoundError extends Error {
  constructor(engine: string) {
    super(`Adapter não encontrado para engine "${engine}"`);
    this.name = "AdapterNotFoundError";
  }
}

export class EngineNotImplementedError extends Error {
  constructor(engine: string) {
    super(`Engine "${engine}" ainda não está disponível no MVP`);
    this.name = "EngineNotImplementedError";
  }
}

/** Only allow simple SQL identifiers to avoid injection via table/column names. */
export function assertSafeIdentifier(name: string): string {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) {
    throw new Error(`Identificador inválido: ${name}`);
  }
  return name;
}

export function findResource(
  snap: SchemaSnapshot,
  name: string,
): ResourceMeta | undefined {
  return snap.resources.find((r) => r.name === name);
}

export function quoteIdent(name: string): string {
  return `"${assertSafeIdentifier(name).replace(/"/g, '""')}"`;
}
