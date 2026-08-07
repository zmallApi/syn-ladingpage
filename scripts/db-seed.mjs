import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const target = (process.argv[2] || "all").toLowerCase();

function run(name, args, sqlPath) {
  const sql = readFileSync(sqlPath);
  console.log(`\n→ ${name}`);
  const r = spawnSync("docker", ["exec", "-i", ...args], {
    input: sql,
    encoding: "utf8",
    maxBuffer: 10 * 1024 * 1024,
  });
  if (r.stdout) process.stdout.write(r.stdout);
  if (r.stderr) process.stderr.write(r.stderr);
  if (r.status !== 0) {
    console.error(`Falhou: ${name} (exit ${r.status})`);
    process.exit(r.status ?? 1);
  }
}

if (target === "all" || target === "pg" || target === "postgres") {
  run(
    "postgres (synapsee-pg / erpclient)",
    ["synapsee-pg", "psql", "-U", "synapsee", "-d", "erpclient"],
    join(root, "docker/postgres/seed-missions.sql"),
  );
}

if (target === "all" || target === "mysql") {
  run(
    "mysql (synapsee-mysql / erpclient)",
    ["synapsee-mysql", "mysql", "-usynapsee", "-psynapsee", "erpclient"],
    join(root, "docker/mysql/seed-missions.sql"),
  );
}

console.log("\nSeeds de missão aplicados.");
console.log(
  "Postgres: localhost:5433 · MySQL: localhost:3307 · user/pass/db: synapsee/synapsee/erpclient",
);
console.log(
  "Exponha no wizard: clientes, financeiro, recebimentos, pedidos, pedidos_compra",
);
