import mysql, { type Connection, type RowDataPacket } from "mysql2/promise";
import type {
  ConnectionConfig,
  DatabaseAdapter,
  ListOptions,
  ResourceMeta,
  SchemaSnapshot,
} from "../types.js";
import { assertSafeIdentifier } from "../types.js";

/** MySQL/MariaDB identifier quoting (backticks). */
function quoteIdent(name: string): string {
  return `\`${assertSafeIdentifier(name).replace(/`/g, "``")}\``;
}

function createConnection(config: ConnectionConfig) {
  return mysql.createConnection({
    host: config.host,
    port: config.port,
    database: config.database,
    user: config.username,
    password: config.password,
    connectTimeout: 10_000,
    ...(config.options as Record<string, unknown> | undefined),
  });
}

async function withConnection<T>(
  config: ConnectionConfig,
  fn: (conn: Connection) => Promise<T>,
): Promise<T> {
  const conn = await createConnection(config);
  try {
    return await fn(conn);
  } finally {
    await conn.end().catch(() => undefined);
  }
}

function qualify(resource: ResourceMeta): string {
  const table = quoteIdent(resource.name);
  if (resource.schema) {
    return `${quoteIdent(resource.schema)}.${table}`;
  }
  return table;
}

/** information_schema often returns UPPERCASE keys via mysql2 execute(). */
function col(row: RowDataPacket, ...names: string[]): string {
  for (const name of names) {
    if (row[name] != null && row[name] !== "") return String(row[name]);
  }
  const lower = Object.fromEntries(
    Object.entries(row).map(([k, v]) => [k.toLowerCase(), v]),
  );
  for (const name of names) {
    const v = lower[name.toLowerCase()];
    if (v != null && v !== "") return String(v);
  }
  return "";
}

export const mysqlAdapter: DatabaseAdapter = {
  engine: "mysql",
  label: "MySQL",
  status: "ready",

  async testConnection(config) {
    await withConnection(config, async (conn) => {
      await conn.query("SELECT 1");
    });
  },

  async introspect(config): Promise<SchemaSnapshot> {
    return withConnection(config, async (conn) => {
      const [tables] = await conn.execute<RowDataPacket[]>(
        `
        SELECT
          TABLE_SCHEMA AS table_schema,
          TABLE_NAME AS table_name,
          TABLE_TYPE AS table_type
        FROM information_schema.tables
        WHERE table_schema = ?
          AND table_type IN ('BASE TABLE', 'VIEW')
        ORDER BY table_schema, table_name
        `,
        [config.database],
      );

      const resources: ResourceMeta[] = [];

      for (const t of tables) {
        const schema = col(t, "table_schema", "TABLE_SCHEMA");
        const tableName = col(t, "table_name", "TABLE_NAME");
        const tableType = col(t, "table_type", "TABLE_TYPE");
        if (!tableName || tableName === "undefined") continue;

        const [cols] = await conn.execute<RowDataPacket[]>(
          `
          SELECT
            COLUMN_NAME AS column_name,
            DATA_TYPE AS data_type,
            IS_NULLABLE AS is_nullable
          FROM information_schema.columns
          WHERE table_schema = ? AND table_name = ?
          ORDER BY ordinal_position
          `,
          [schema, tableName],
        );

        const [pk] = await conn.execute<RowDataPacket[]>(
          `
          SELECT kcu.COLUMN_NAME AS column_name
          FROM information_schema.table_constraints tc
          JOIN information_schema.key_column_usage kcu
            ON tc.constraint_name = kcu.constraint_name
           AND tc.table_schema = kcu.table_schema
           AND tc.table_name = kcu.table_name
          WHERE tc.constraint_type = 'PRIMARY KEY'
            AND tc.table_schema = ?
            AND tc.table_name = ?
          ORDER BY kcu.ordinal_position
          `,
          [schema, tableName],
        );

        const pkNames = pk
          .map((r) => col(r, "column_name", "COLUMN_NAME"))
          .filter(Boolean);
        const pkSet = new Set(pkNames);

        resources.push({
          name: tableName,
          schema: schema || config.database,
          kind: tableType.toUpperCase() === "VIEW" ? "view" : "table",
          primaryKey: pkNames,
          fields: cols
            .map((c) => {
              const name = col(c, "column_name", "COLUMN_NAME");
              if (!name) return null;
              return {
                name,
                dataType: col(c, "data_type", "DATA_TYPE") || "unknown",
                nullable: col(c, "is_nullable", "IS_NULLABLE").toUpperCase() === "YES",
                isPrimaryKey: pkSet.has(name),
              };
            })
            .filter((f): f is NonNullable<typeof f> => f != null),
        });
      }

      return { engine: "mysql", resources };
    });
  },

  async list(config, resource, opts: ListOptions) {
    return withConnection(config, async (conn) => {
      const limit = Math.min(Math.max(opts.limit, 1), 100);
      const offset = Math.max(opts.offset, 0);
      const params: unknown[] = [];
      const where: string[] = [];

      if (opts.filter) {
        for (const [key, value] of Object.entries(opts.filter)) {
          if (!resource.fields.some((f) => f.name === key)) continue;
          assertSafeIdentifier(key);
          where.push(`${quoteIdent(key)} = ?`);
          params.push(value);
        }
      }

      const sql = `SELECT * FROM ${qualify(resource)}${
        where.length ? ` WHERE ${where.join(" AND ")}` : ""
      } LIMIT ${limit} OFFSET ${offset}`;

      const [rows] = await conn.execute<RowDataPacket[]>(
        sql,
        params as (string | number | boolean | Date | null)[],
      );
      return rows as unknown[];
    });
  },

  async getById(config, resource, id) {
    return withConnection(config, async (conn) => {
      const keys = resource.primaryKey?.length ? resource.primaryKey : ["id"];
      if (keys.length !== 1) {
        throw new Error(
          `getById exige exatamente 1 coluna de PK (recurso ${resource.name})`,
        );
      }
      const pk = quoteIdent(keys[0]!);
      const sql = `SELECT * FROM ${qualify(resource)} WHERE ${pk} = ? LIMIT 1`;
      const [rows] = await conn.execute<RowDataPacket[]>(sql, [id]);
      return (rows[0] as unknown) ?? null;
    });
  },

  async insert(config, resource, data) {
    return withConnection(config, async (conn) => {
      const entries = Object.entries(data).filter(([k]) =>
        resource.fields.some((f) => f.name === k),
      );
      if (!entries.length) {
        throw new Error("Nenhum campo válido no body");
      }
      for (const [k] of entries) assertSafeIdentifier(k);

      const cols = entries.map(([k]) => quoteIdent(k)).join(", ");
      const placeholders = entries.map(() => "?").join(", ");
      const values = entries.map(([, v]) => v);

      const sql = `INSERT INTO ${qualify(resource)} (${cols}) VALUES (${placeholders})`;
      const [result] = await conn.execute(
        sql,
        values as (string | number | boolean | Date | null)[],
      );
      const header = result as { insertId?: number };

      const keys = resource.primaryKey?.length ? resource.primaryKey : ["id"];
      if (keys.length === 1) {
        const pkName = keys[0]!;
        const provided = data[pkName];
        const id =
          provided != null && provided !== ""
            ? provided
            : header.insertId != null && header.insertId > 0
              ? header.insertId
              : null;
        if (id != null) {
          const [rows] = await conn.execute<RowDataPacket[]>(
            `SELECT * FROM ${qualify(resource)} WHERE ${quoteIdent(pkName)} = ? LIMIT 1`,
            [id as string | number],
          );
          if (rows[0]) return rows[0] as unknown;
        }
      }

      return { ok: true, insertId: header.insertId ?? null };
    });
  },
};
