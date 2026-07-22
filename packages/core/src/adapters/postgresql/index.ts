import { Client, type ClientConfig } from "pg";
import type {
  ConnectionConfig,
  DatabaseAdapter,
  ListOptions,
  ResourceMeta,
  SchemaSnapshot,
} from "../types.js";
import { assertSafeIdentifier, quoteIdent } from "../types.js";

function createClient(config: ConnectionConfig) {
  return new Client({
    host: config.host,
    port: config.port,
    database: config.database,
    user: config.username,
    password: config.password,
    connectionTimeoutMillis: 10_000,
    statement_timeout: 30_000,
    ...(config.options as ClientConfig | undefined),
  });
}

async function withClient<T>(
  config: ConnectionConfig,
  fn: (client: Client) => Promise<T>,
): Promise<T> {
  const client = createClient(config);
  try {
    await client.connect();
    return await fn(client);
  } finally {
    await client.end().catch(() => undefined);
  }
}

function qualify(resource: ResourceMeta): string {
  const table = quoteIdent(resource.name);
  if (resource.schema) {
    return `${quoteIdent(resource.schema)}.${table}`;
  }
  return table;
}

export const postgresqlAdapter: DatabaseAdapter = {
  engine: "postgresql",
  label: "PostgreSQL",
  status: "ready",

  async testConnection(config) {
    await withClient(config, async (client) => {
      await client.query("SELECT 1");
    });
  },

  async introspect(config): Promise<SchemaSnapshot> {
    return withClient(config, async (client) => {
      const tables = await client.query<{
        table_schema: string;
        table_name: string;
        table_type: string;
      }>(`
        SELECT table_schema, table_name, table_type
        FROM information_schema.tables
        WHERE table_schema NOT IN ('pg_catalog', 'information_schema')
          AND table_type IN ('BASE TABLE', 'VIEW')
        ORDER BY table_schema, table_name
      `);

      const resources: ResourceMeta[] = [];

      for (const t of tables.rows) {
        const cols = await client.query<{
          column_name: string;
          data_type: string;
          is_nullable: string;
        }>(
          `
          SELECT column_name, data_type, is_nullable
          FROM information_schema.columns
          WHERE table_schema = $1 AND table_name = $2
          ORDER BY ordinal_position
        `,
          [t.table_schema, t.table_name],
        );

        const pk = await client.query<{ column_name: string }>(
          `
          SELECT kcu.column_name
          FROM information_schema.table_constraints tc
          JOIN information_schema.key_column_usage kcu
            ON tc.constraint_name = kcu.constraint_name
           AND tc.table_schema = kcu.table_schema
          WHERE tc.constraint_type = 'PRIMARY KEY'
            AND tc.table_schema = $1
            AND tc.table_name = $2
          ORDER BY kcu.ordinal_position
        `,
          [t.table_schema, t.table_name],
        );

        const pkSet = new Set(pk.rows.map((r) => r.column_name));

        resources.push({
          name: t.table_name,
          schema: t.table_schema,
          kind: t.table_type === "VIEW" ? "view" : "table",
          primaryKey: pk.rows.map((r) => r.column_name),
          fields: cols.rows.map((c) => ({
            name: c.column_name,
            dataType: c.data_type,
            nullable: c.is_nullable === "YES",
            isPrimaryKey: pkSet.has(c.column_name),
          })),
        });
      }

      return { engine: "postgresql", resources };
    });
  },

  async list(config, resource, opts: ListOptions) {
    return withClient(config, async (client) => {
      const limit = Math.min(Math.max(opts.limit, 1), 100);
      const offset = Math.max(opts.offset, 0);
      const params: unknown[] = [];
      const where: string[] = [];

      if (opts.filter) {
        for (const [key, value] of Object.entries(opts.filter)) {
          if (!resource.fields.some((f) => f.name === key)) continue;
          assertSafeIdentifier(key);
          params.push(value);
          where.push(`${quoteIdent(key)} = $${params.length}`);
        }
      }

      params.push(limit);
      const limitIdx = params.length;
      params.push(offset);
      const offsetIdx = params.length;

      const sql = `SELECT * FROM ${qualify(resource)}${
        where.length ? ` WHERE ${where.join(" AND ")}` : ""
      } LIMIT $${limitIdx} OFFSET $${offsetIdx}`;
      const result = await client.query(sql, params);
      return result.rows;
    });
  },

  async getById(config, resource, id) {
    return withClient(config, async (client) => {
      const keys = resource.primaryKey?.length
        ? resource.primaryKey
        : ["id"];
      if (keys.length !== 1) {
        throw new Error(
          `getById exige exatamente 1 coluna de PK (recurso ${resource.name})`,
        );
      }
      const pk = quoteIdent(keys[0]!);
      const sql = `SELECT * FROM ${qualify(resource)} WHERE ${pk} = $1 LIMIT 1`;
      const result = await client.query(sql, [id]);
      return result.rows[0] ?? null;
    });
  },

  async insert(config, resource, data) {
    return withClient(config, async (client) => {
      const entries = Object.entries(data).filter(
        ([k]) => resource.fields.some((f) => f.name === k),
      );
      if (!entries.length) {
        throw new Error("Nenhum campo válido no body");
      }
      for (const [k] of entries) assertSafeIdentifier(k);

      const cols = entries.map(([k]) => quoteIdent(k)).join(", ");
      const placeholders = entries.map((_, i) => `$${i + 1}`).join(", ");
      const values = entries.map(([, v]) => v);

      const sql = `
        INSERT INTO ${qualify(resource)} (${cols})
        VALUES (${placeholders})
        RETURNING *
      `;
      const result = await client.query(sql, values);
      return result.rows[0];
    });
  },
};
