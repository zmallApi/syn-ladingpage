const API = process.env.API_URL ?? "http://127.0.0.1:3000";
const KEY = process.env.PLATFORM_API_KEY ?? "dev-key";
const h = { "X-API-Key": KEY, "Content-Type": "application/json" };

async function req(path, opts = {}) {
  const res = await fetch(`${API}${path}`, { ...opts, headers: { ...h, ...opts.headers } });
  const text = await res.text();
  let body;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  if (!res.ok) {
    throw new Error(`${opts.method ?? "GET"} ${path} → ${res.status} ${typeof body === "string" ? body : JSON.stringify(body)}`);
  }
  return body;
}

const projects = await req("/projects");
let p = projects.find(
  (x) =>
    x.exposedResources?.length &&
    (x.database === "erpclient" || String(x.name ?? "").toLowerCase().includes("erp")),
);

if (!p) {
  const created = await req("/projects", {
    method: "POST",
    body: JSON.stringify({
      name: "ERP Cap E2E",
      engine: "postgresql",
      host: "127.0.0.1",
      port: 5433,
      database: "erpclient",
      username: "synapsee",
      password: "synapsee",
      readOnly: true,
    }),
  });
  await req(`/projects/${created.id}/connect`, { method: "POST", body: "{}" });
  p = await req(`/projects/${created.id}/expose`, {
    method: "PUT",
    body: JSON.stringify({
      resources: ["clientes", "produtos", "pedidos", "itens_pedido"],
    }),
  });
  console.log("created", p.id);
} else {
  console.log("reuse", p.id, p.name);
}

const analyze = await req(`/projects/${p.id}/capabilities/analyze`);
console.log("domain", analyze.profile?.domain, "confidence", analyze.profile?.confidence, "llm", analyze.llmUsed);
const available = (analyze.suggestions ?? []).filter((s) => s.available).map((s) => s.id);
console.log("available", available);
if (available.length < 4) {
  throw new Error(`Expected >=4 available capabilities, got ${available.length}`);
}

const updated = await req(`/projects/${p.id}/capabilities`, {
  method: "PUT",
  body: JSON.stringify({ capabilityIds: available }),
});
console.log("active", updated.activeCapabilities);

const mcp = await req(`/p/${p.id}/mcp.json`);
const tools = mcp.tools ?? [];
const toolNames = tools.map((t) => (typeof t === "string" ? t : t.name)).filter(Boolean);
const capTools = toolNames.filter((n) => n.startsWith("cap_"));
console.log("mcp tools", toolNames);
console.log("cap tools", capTools);

if (capTools.length < 4) {
  throw new Error(`Expected >=4 cap_* tools in mcp.json, got ${capTools.length}`);
}

console.log("OK E2E", { projectId: p.id, domain: analyze.profile.domain, caps: capTools.length });
