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

  // --- MCP developer keys (project-scoped) ---
  const createB = await json("/projects/edge", {
    method: "POST",
    headers: authHeaders(a),
    body: JSON.stringify({ name: "Proj A2", vertical: "engineering" }),
  });
  if (createB.status !== 201) {
    throw new Error(`create A2: ${createB.status} ${JSON.stringify(createB.body)}`);
  }
  const projectId2 = createB.body.project?.id;
  if (!projectId2) throw new Error("missing project id 2");

  const mint = await json(`/projects/${projectId}/mcp-keys`, {
    method: "POST",
    headers: authHeaders(a),
    body: JSON.stringify({ name: "Smoke Dev" }),
  });
  if (mint.status !== 200) {
    throw new Error(`mint mcp key: ${mint.status} ${JSON.stringify(mint.body)}`);
  }
  const mcpToken = mint.body.token;
  if (!mcpToken?.startsWith("syn_mcp_")) {
    throw new Error(`expected syn_mcp_ token, got ${mcpToken}`);
  }

  const mcpOwn = await json(`/projects/${projectId}`, {
    headers: { "X-API-Key": mcpToken },
  });
  if (mcpOwn.status !== 200) {
    throw new Error(`mcp key cannot read own project: ${mcpOwn.status}`);
  }

  const mcpOther = await json(`/projects/${projectId2}`, {
    headers: { "X-API-Key": mcpToken },
  });
  if (mcpOther.status !== 404) {
    throw new Error(
      `MCP KEY SCOPE LEAK: key for project1 got ${mcpOther.status} on project2`,
    );
  }

  const mcpManage = await json(`/projects/${projectId}/mcp-keys`, {
    method: "POST",
    headers: { "X-API-Key": mcpToken },
    body: JSON.stringify({ name: "Should fail" }),
  });
  if (mcpManage.status !== 403) {
    throw new Error(
      `mcp key should not create keys: got ${mcpManage.status}`,
    );
  }

  const revoke = await json(
    `/projects/${projectId}/mcp-keys/${mint.body.id}`,
    {
      method: "DELETE",
      headers: authHeaders(a),
    },
  );
  if (revoke.status !== 200) {
    throw new Error(`revoke: ${revoke.status} ${JSON.stringify(revoke.body)}`);
  }

  const afterRevoke = await json(`/projects/${projectId}`, {
    headers: { "X-API-Key": mcpToken },
  });
  if (afterRevoke.status !== 401) {
    throw new Error(
      `revoked mcp key should 401, got ${afterRevoke.status}`,
    );
  }

  console.log("smoke-multi-tenant: OK");
  console.log(`  A tenant=${a.tenant.id} project=${projectId}`);
  console.log(`  B tenant=${b.tenant.id} cannot see A's project (404)`);
  console.log("  mcp_key: scoped to project, no manage, revoke → 401");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
