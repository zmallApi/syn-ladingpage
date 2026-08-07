/**
 * Smoke: two tenants cannot see each other's projects.
 * Requires API on PUBLIC_API_URL / http://localhost:3000
 */
const BASE = (process.env.PUBLIC_API_URL ?? "http://localhost:3000").replace(
  /\/$/,
  "",
);

async function json(path, init = {}) {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body };
}

function authHeaders(session) {
  if (session.token) return { Authorization: `Bearer ${session.token}` };
  if (session.apiKey) return { "X-API-Key": session.apiKey };
  throw new Error("no auth");
}

async function signup(label) {
  const email = `smoke-${label}-${Date.now()}@example.com`;
  const { status, body } = await json("/auth/signup", {
    method: "POST",
    body: JSON.stringify({
      email,
      password: "password123",
      companyName: `Smoke ${label}`,
      name: label,
    }),
  });
  if (status !== 201) {
    throw new Error(`signup ${label}: ${status} ${JSON.stringify(body)}`);
  }
  return body;
}

async function main() {
  const health = await json("/health");
  if (health.status !== 200) {
    throw new Error(`API not healthy at ${BASE}`);
  }

  const a = await signup("a");
  const b = await signup("b");

  const createA = await json("/projects/edge", {
    method: "POST",
    headers: authHeaders(a),
    body: JSON.stringify({ name: "Proj A", vertical: "engineering" }),
  });
  if (createA.status !== 201) {
    throw new Error(`create A: ${createA.status} ${JSON.stringify(createA.body)}`);
  }
  const projectId = createA.body.project?.id;
  if (!projectId) throw new Error("missing project id");

  const leak = await json(`/projects/${projectId}`, {
    headers: authHeaders(b),
  });
  if (leak.status !== 404) {
    throw new Error(
      `CROSS-TENANT LEAK: B got ${leak.status} for A's project ${projectId}`,
    );
  }

  const listB = await json("/projects", { headers: authHeaders(b) });
  if (listB.status !== 200) {
    throw new Error(`list B: ${listB.status}`);
  }
  const ids = (listB.body ?? []).map((p) => p.id);
  if (ids.includes(projectId)) {
    throw new Error("CROSS-TENANT LEAK: B list includes A's project");
  }

  const okA = await json(`/projects/${projectId}`, {
    headers: authHeaders(a),
  });
  if (okA.status !== 200) {
    throw new Error(`A cannot read own project: ${okA.status}`);
  }

  console.log("smoke-multi-tenant: OK");
  console.log(`  A tenant=${a.tenant.id} project=${projectId}`);
  console.log(`  B tenant=${b.tenant.id} cannot see A's project (404)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
