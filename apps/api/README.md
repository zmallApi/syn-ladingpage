# Synapsee API — Fase 1 MVP + Fase 2 MCP

Backend Fastify multi-banco: adapters + introspecção + REST + OpenAPI + **MCP**.
**PostgreSQL** e **MySQL** estão prontos; SQL Server / Oracle / MongoDB ainda são stubs.

## Princípio

A plataforma **não importa dados** do cliente. Só guarda metadados no SQLite local
(credenciais criptografadas + recursos expostos) e consulta o banco remoto sob demanda.

## Setup

```bash
# na raiz do monorepo
cp apps/api/.env.example apps/api/.env
npm install

# Postgres de demo (opcional)
npm run db:up

# API
npm run dev:api
```

Health: `GET http://localhost:3000/health` (sem API key).

Demais rotas exigem header `X-API-Key` (default: `dev-key`).

## Smoke test (com Docker Postgres)

```bash
# 1) criar projeto
curl -s -X POST http://localhost:3000/projects \
  -H "Content-Type: application/json" \
  -H "X-API-Key: dev-key" \
  -d '{
    "name": "Demo",
    "engine": "postgresql",
    "host": "127.0.0.1",
    "port": 5433,
    "database": "erpclient",
    "username": "synapsee",
    "password": "synapsee",
    "readOnly": false
  }'

# 2) schema (substitua PROJECT_ID)
curl -s http://localhost:3000/projects/PROJECT_ID/schema -H "X-API-Key: dev-key"

# 3) expor recursos
curl -s -X PUT http://localhost:3000/projects/PROJECT_ID/expose \
  -H "Content-Type: application/json" \
  -H "X-API-Key: dev-key" \
  -d '{"resources":["clientes","pedidos"]}'

# 4) listar
curl -s "http://localhost:3000/p/PROJECT_ID/clientes?limit=10" -H "X-API-Key: dev-key"

# 5) OpenAPI
curl -s http://localhost:3000/p/PROJECT_ID/openapi.json -H "X-API-Key: dev-key"

# 6) Manifest MCP (snippets multi-cliente)
curl -s http://localhost:3000/p/PROJECT_ID/mcp.json -H "X-API-Key: dev-key"
```

## MCP (Fase 2)

Cada sistema com recursos expostos ganha um endpoint MCP Streamable HTTP:

- `GET/POST /p/:projectId/mcp` — protocolo MCP
- `GET /p/:projectId/mcp.json` — manifesto + snippets por cliente (`clients[]`)

O **mesmo endpoint** serve Cursor, Claude, VS Code, Windsurf, ChatGPT e qualquer cliente HTTP remoto. Só muda o JSON de configuração.

### Tools

| Tool | Descrição |
|------|-----------|
| `list_exposed_resources` | Lista recursos expostos |
| `describe_resource` | Campos / PK |
| `query_records` | Listagem paginada (ao vivo) |
| `get_record` | Busca por PK |
| `create_record` | Insert (se não read-only) |
| `cap_*` | Capacidades/playbooks ativas |

### Clientes

| Cliente | Arquivo / lugar | Observação |
|---------|-----------------|------------|
| Cursor | `~/.cursor/mcp.json` | `mcpServers` + `url` |
| Claude | `~/.claude.json` / Connectors | HTTP remoto; Desktop antigo: `mcp-remote` (stdio) |
| VS Code | `.vscode/mcp.json` | raiz `servers` + `type: "http"` |
| Windsurf | `~/.codeium/windsurf/mcp_config.json` | `mcpServers` |
| ChatGPT | Connectors / Custom MCP | URL + header (se o plano permitir) |

Exemplo Cursor:

```json
{
  "mcpServers": {
    "synapsee-erp": {
      "url": "http://localhost:3000/p/PROJECT_ID/mcp",
      "headers": {
        "X-API-Key": "dev-key"
      }
    }
  }
}
```

Exemplo VS Code:

```json
{
  "servers": {
    "synapsee-erp": {
      "type": "http",
      "url": "http://localhost:3000/p/PROJECT_ID/mcp",
      "headers": {
        "X-API-Key": "dev-key"
      }
    }
  }
}
```

No admin, a página do sistema tem abas por agente com config pronta para copiar.

## Admin

```bash
# apps/admin/.env
VITE_USE_MOCK=false
VITE_API_URL=http://localhost:3000

npm run dev:admin
```

Login com a mesma `PLATFORM_API_KEY`.

## Engines

| Engine | Status |
|--------|--------|
| postgresql | ready |
| mysql, sqlserver, oracle, mongodb | planned (stub) |

`GET /engines` lista status.

## Variáveis

| Var | Default | Uso |
|-----|---------|-----|
| `PLATFORM_API_KEY` | `dev-key` | Auth admin/API |
| `ENCRYPTION_KEY` | dev… | AES-GCM senhas no SQLite |
| `PORT` | `3000` | HTTP |
| `DATA_DIR` | `../../data` | Onde fica `synapsee.sqlite` |
| `PUBLIC_API_URL` | `http://localhost:3000` | URLs no manifesto MCP |
