import { analyzeCapabilities } from "../packages/core/src/capabilities/analyze.ts";

const snap = {
  engine: "postgresql",
  resources: [
    {
      name: "clientes",
      kind: "table",
      primaryKey: ["id"],
      fields: [
        { name: "id", dataType: "integer", nullable: false },
        { name: "nome", dataType: "text", nullable: false },
        { name: "email", dataType: "text", nullable: true },
        { name: "cidade", dataType: "text", nullable: true },
      ],
    },
    {
      name: "produtos",
      kind: "table",
      primaryKey: ["id"],
      fields: [
        { name: "id", dataType: "integer", nullable: false },
        { name: "sku", dataType: "text", nullable: false },
        { name: "nome", dataType: "text", nullable: false },
        { name: "preco", dataType: "numeric", nullable: false },
        { name: "estoque", dataType: "integer", nullable: false },
      ],
    },
    {
      name: "pedidos",
      kind: "table",
      primaryKey: ["id"],
      fields: [
        { name: "id", dataType: "integer", nullable: false },
        { name: "cliente_id", dataType: "integer", nullable: false },
        { name: "total", dataType: "numeric", nullable: false },
        { name: "status", dataType: "text", nullable: false },
      ],
    },
    {
      name: "itens_pedido",
      kind: "table",
      primaryKey: ["id"],
      fields: [
        { name: "id", dataType: "integer", nullable: false },
        { name: "pedido_id", dataType: "integer", nullable: false },
        { name: "produto_id", dataType: "integer", nullable: false },
        { name: "quantidade", dataType: "integer", nullable: false },
      ],
    },
  ],
};

const r = await analyzeCapabilities(snap, { useLlm: false });
console.log(
  JSON.stringify(
    {
      domain: r.profile.domain,
      confidence: r.profile.confidence,
      roles: r.profile.resourceRoles,
      available: r.suggestions.filter((s) => s.available).map((s) => s.id),
      unavailable: r.suggestions
        .filter((s) => !s.available)
        .map((s) => ({ id: s.id, reason: s.reason })),
    },
    null,
    2,
  ),
);
