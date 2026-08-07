#!/usr/bin/env node
/**
 * Sobe a plataforma Synapsee em localhost:
 *   - Postgres demo (docker compose) — porta 5433
 *   - API — http://localhost:3000
 *   - Admin — http://localhost:5174
 *
 * Uso (na raiz):
 *   npm run dev
 *   npm run dev -- --no-db
 *   npm run dev -- --landing
 *   npm run dev -- --with-mysql
 */
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const args = new Set(process.argv.slice(2));
const skipDb = args.has("--no-db");
const withLanding = args.has("--landing");
const withMysql = args.has("--with-mysql");
const isWin = process.platform === "win32";

const children = [];
let shuttingDown = false;

function log(tag, msg) {
  const line = String(msg).replace(/\r?\n$/, "");
  if (!line) return;
  console.log(`[${tag}] ${line}`);
}

function run(tag, command, commandArgs, { cwd = root, env = process.env } = {}) {
  const child = spawn(command, commandArgs, {
    cwd,
    env,
    shell: isWin,
    stdio: ["ignore", "pipe", "pipe"],
  });
  children.push(child);
  child.stdout.on("data", (buf) => {
    for (const line of buf.toString().split(/\r?\n/)) log(tag, line);
  });
  child.stderr.on("data", (buf) => {
    for (const line of buf.toString().split(/\r?\n/)) log(tag, line);
  });
  child.on("exit", (code, signal) => {
    if (shuttingDown) return;
    console.error(`[${tag}] saiu (code=${code ?? "?"} signal=${signal ?? "-"})`);
    shutdown(code && code !== 0 ? code : 1);
  });
  return child;
}

function runNpm(tag, script) {
  return run(tag, "npm", ["run", script], { cwd: root });
}

function dockerOk() {
  return new Promise((resolve) => {
    const child = spawn("docker", ["info"], {
      cwd: root,
      shell: isWin,
      stdio: "ignore",
    });
    child.on("error", () => resolve(false));
    child.on("exit", (code) => resolve(code === 0));
  });
}

function composeUp(services) {
  return new Promise((resolve, reject) => {
    const child = spawn("docker", ["compose", "up", "-d", ...services], {
      cwd: root,
      shell: isWin,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let out = "";
    child.stdout.on("data", (b) => {
      out += b.toString();
    });
    child.stderr.on("data", (b) => {
      out += b.toString();
    });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) resolve(out.trim());
      else reject(new Error(out.trim() || `docker compose exit ${code}`));
    });
  });
}

function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log("\nEncerrando plataforma…");
  for (const child of children) {
    try {
      if (!child.killed) {
        if (isWin) child.kill();
        else child.kill("SIGTERM");
      }
    } catch {
      /* ignore */
    }
  }
  setTimeout(() => process.exit(code), 500).unref();
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));

async function main() {
  console.log("Synapsee — subindo plataforma local\n");

  if (!existsSync(join(root, "node_modules"))) {
    console.error("node_modules não encontrado. Rode: npm install");
    process.exit(1);
  }

  if (!skipDb) {
    const ok = await dockerOk();
    if (!ok) {
      console.warn(
        "[db] Docker indisponível — seguindo sem banco. Use --no-db para silenciar.",
      );
    } else {
      const services = withMysql ? ["postgres", "mysql"] : ["postgres"];
      try {
        const out = await composeUp(services);
        if (out) log("db", out);
        log("db", "Postgres em localhost:5433 (user/pass/db: synapsee/synapsee/erpclient)");
        if (withMysql) {
          log("db", "MySQL em localhost:3307 (user/pass/db: synapsee/synapsee/erpclient)");
        }
      } catch (err) {
        console.warn(`[db] falha ao subir compose: ${err.message}`);
      }
    }
  }

  runNpm("api", "dev:api");
  runNpm("admin", "dev:admin");
  if (withLanding) runNpm("landing", "dev:landing");

  console.log(`
URLs
  API    http://localhost:3000   (API key: dev-key)
  Admin  http://localhost:5174
${withLanding ? "  Landing http://localhost:5173\n" : ""}Ctrl+C para parar.
`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
