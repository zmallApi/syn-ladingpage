const h = {
  "X-API-Key": "dev-key",
  "Content-Type": "application/json",
  Accept: "application/json, text/event-stream",
};
const id = "a27f596d-5f21-4e95-b88d-5f519d5be23b";
const body = { jsonrpc: "2.0", id: 1, method: "tools/list", params: {} };
const r = await fetch(`http://127.0.0.1:3000/p/${id}/mcp`, {
  method: "POST",
  headers: h,
  body: JSON.stringify(body),
});
const t = await r.text();
console.log("status", r.status);
const names = [...t.matchAll(/"name"\s*:\s*"(cap_[^"]+)"/g)].map((m) => m[1]);
console.log(names.sort().join("\n"));
console.log("location_health", names.includes("cap_location_health"));
console.log("party_360", names.includes("cap_party_360"));
console.log("attention_queue", names.includes("cap_attention_queue"));
if (!names.includes("cap_location_health")) {
  console.log("raw snippet", t.slice(0, 800));
}
