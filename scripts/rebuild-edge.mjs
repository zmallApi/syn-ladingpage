/**
 * Rebuild synapsee/edge and recreate container preserving env (no secret prints).
 * Run from repo root: node scripts/rebuild-edge.mjs
 */
import { execSync } from "node:child_process";

function sh(cmd, opts = {}) {
  return execSync(cmd, {
    encoding: "utf8",
    stdio: opts.silent ? ["ignore", "pipe", "pipe"] : "inherit",
    ...opts,
  });
}

const name = "synapsee-edge";
const image = "synapsee/edge:latest";

console.log("Building", image, "...");
sh(`docker build -f apps/edge/Dockerfile -t ${image} .`);

const envJson = sh(`docker inspect ${name} --format "{{json .Config.Env}}"`, {
  silent: true,
}).trim();
const envs = JSON.parse(envJson);

console.log("Stopping old container...");
try {
  sh(`docker stop ${name}`, { silent: true });
} catch {
  /* already stopped */
}
try {
  sh(`docker rm ${name}`, { silent: true });
} catch {
  /* gone */
}

const envFlags = envs
  .filter((e) => e.startsWith("SYNAPSEE_"))
  .map((e) => {
    const i = e.indexOf("=");
    const k = e.slice(0, i);
    const v = e.slice(i + 1);
    return `-e ${k}=${JSON.stringify(v)}`;
  })
  .join(" ");

console.log("Starting new container with preserved SYNAPSEE_* env...");
sh(
  `docker run -d --name ${name} --restart unless-stopped --add-host=host.docker.internal:host-gateway ${envFlags} ${image}`,
);

console.log("Done. Edge should re-register on the API shortly.");
