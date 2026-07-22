/**
 * Smoke MySQL adapter (requires synapsee-mysql on :3307).
 * Run: docker compose up -d mysql && npx tsx scripts/smoke-mysql-adapter.mjs
 */
import { mysqlAdapter, listEngines } from "../packages/core/src/index.ts";

const engines = listEngines();
const mysql = engines.find((e) => e.engine === "mysql");
if (!mysql || mysql.status !== "ready") {
  throw new Error(`mysql engine not ready: ${JSON.stringify(mysql)}`);
}

const config = {
  engine: "mysql",
  host: process.env.MYSQL_HOST ?? "127.0.0.1",
  port: Number(process.env.MYSQL_PORT ?? 3307),
  database: process.env.MYSQL_DATABASE ?? "erpclient",
  username: process.env.MYSQL_USER ?? "synapsee",
  password: process.env.MYSQL_PASSWORD ?? "synapsee",
  readOnly: true,
};

await mysqlAdapter.testConnection(config);
const snap = await mysqlAdapter.introspect(config);
const names = snap.resources.map((r) => r.name).sort();
const required = ["clientes", "produtos", "pedidos", "itens_pedido"];
for (const r of required) {
  if (!names.includes(r)) throw new Error(`missing table ${r}; got ${names.join(",")}`);
}

const clientes = snap.resources.find((r) => r.name === "clientes");
if (!clientes) throw new Error("clientes missing");
const rows = await mysqlAdapter.list(config, clientes, { limit: 5, offset: 0 });
if (!rows.length) throw new Error("expected seeded clientes");

const one = await mysqlAdapter.getById(config, clientes, 1);
if (!one || typeof one !== "object") throw new Error("getById failed");

console.log("smoke-mysql-adapter: OK", {
  tables: names.length,
  clientes: rows.length,
  sample: one,
});
