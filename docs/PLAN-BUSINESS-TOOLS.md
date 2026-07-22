# Plano: Inteligência de negócio + tools MCP

> Status: implementado (smoke E2E ok)  
> Decisões: detecção **híbrida** (1A) · ativação **sugerir e confirmar** (2A)  
> Próximo: [`PLAN-BUSINESS-AI.md`](./PLAN-BUSINESS-AI.md) (Fases A–D feitas) · posicionamento: [`POSITIONING.md`](./POSITIONING.md)

## Overview

Detectar o domínio do banco só com schema/metadados (heurísticas + LLM opcional), sugerir tools de negócio no admin, e ativar no MCP apenas após confirmação do usuário — **sem importar dados** do cliente.

## Decisões fixadas

- **Detecção:** híbrida — heurísticas locais no schema + LLM opcional para refinar domínio e sugerir tools.
- **Ativação:** o Synapsee **sugere**; o usuário **confirma** no admin/wizard antes de publicar no MCP.
- **Princípio mantido:** zero importação de dados — só `SchemaSnapshot` (+ amostra opcional de **só nomes/tipos**, nunca linhas).



## Como identificar o negócio

```mermaid
flowchart LR
  Schema[SchemaSnapshot] --> Heuristics[DomainHeuristics]
  Heuristics --> Profile[BusinessProfile]
  Profile --> Templates[CapabilityTemplates]
  Templates --> Candidates[ToolCandidates]
  Candidates --> LLM[LLMRefine_opcional]
  LLM --> Suggestions[SuggestedCapabilities]
  Suggestions --> UI[AdminConfirm]
  UI --> Active[activeCapabilities]
  Active --> MCP[McpServerTools]
```





### Camada 1 — Heurísticas (sempre, offline)

Em `packages/core/src/capabilities/`:

1. **Score de domínio** a partir de nomes de recursos/campos (PT/EN):
  - `erp_commerce`: clientes, pedidos, produtos, itens, estoque, sku, total, status
  - `membership_retention`: alunos, checkins, churn, nps, financeiro, unidades (academias)
  - `saas_billing`: subscriptions, invoices, plans, tenants, seats
  - `crm`: leads, deals, contacts, pipeline, opportunities
  - `hr`: funcionarios, folha, cargos, departments
  - `generic` se confiança baixa
2. **Papéis semânticos** por recurso: `customer`, `member`, `order`, `product`, `checkin`, `finance`, `unit`… via dicionário + FKs (`aluno_id` → member).
3. **Sinais de coluna:** `status` + enums conhecidos, `valor`/`total`/`preco` monetário, `criado_em`/`email`, `estoque`.
4. Saída tipada `BusinessProfile`:
  - `domain`, `confidence`, `resourceRoles[]`, `signals[]`

Sem chamar banco além do schema já introspectado. Ampliar o stub atual `GET /projects/:id/schema/summary` para devolver esse perfil + candidatos.

### Camada 2 — Catálogo de templates de capacidade

Arquivo/registry `capabilityTemplates` por domínio. Cada template declara:

- `id` (ex.: `customer_summary`, `find_open_orders`, `top_products`, `low_inventory`)
- `requiredRoles` (ex.: `[customer, order]`)
- `description` para o agente
- `bind(schema, roles) → BoundCapability | null` (resolve nomes reais de tabela/coluna)
- `handler` seguro: só `adapter.list/getById` + filtros **whitelist** (status, datas, limit) — **nunca SQL cru do LLM**

MVP de templates (domínio `erp_commerce`, cobre o `erpclient` demo):


| id                       | Precisa                   | Comportamento                           |
| ------------------------ | ------------------------- | --------------------------------------- |
| `customer_summary`       | customer + order          | pedidos + total por cliente             |
| `find_open_orders`       | order + status            | filtrar status aberto/pendente          |
| `top_products`           | product + line_item/order | ranking por quantidade/valor            |
| `search_customers`       | customer                  | busca por nome/email (subset de campos) |
| `low_inventory`          | product + estoque         | estoque abaixo do limiar                |
| `explain_business_model` | qualquer                  | resume domain + roles (só metadados)    |


Outros domínios: 2–3 templates stub na v1; expandir depois.

### Camada 3 — LLM opcional (refino)

- Entrada: `BusinessProfile` + lista de recursos/campos (**sem rows**).
- Saída Zod: `{ domain?, confidence?, suggestedCapabilityIds[], rationale }`.
- Só roda se `OPENAI_API_KEY` (ou similar) existir; senão fica 100% heurística.
- O LLM **não inventa queries** — só escolhe/prioriza IDs do catálogo. Fail-closed se JSON inválido.



## Persistência e API

Estender `Project` em `packages/storage`:

- `activeCapabilitiesJson: string[]` (IDs confirmados)
- opcional cache `businessProfileJson` + `suggestedAt`

Endpoints:

- `GET /projects/:id/capabilities/analyze` — heurística (+ LLM se configurado) → profile + suggestions
- `GET /projects/:id/capabilities` — ativas + sugeridas
- `PUT /projects/:id/capabilities` — body `{ capabilityIds: string[] }` (só IDs do catálogo/binding válido)

Security: mesma API key; IDs validados contra registry; handlers só em recursos já **expostos**.

## MCP

Estender `createProjectMcpServer` em `packages/mcp`:

- Tools CRUD existentes permanecem.
- Para cada `activeCapability`, registrar tool MCP com nome estável (`cap_customer_summary`, …).
- Atualizar `/p/:id/mcp.json` para listar tools de negócio ativas.



## Admin UX

1. Após schema/expose: botão **Analisar negócio**.
2. Card: domínio detectado + confiança + tools sugeridas (checkbox).
3. **Ativar selecionadas** → `PUT /capabilities`.
4. Página do sistema: bloco “Ferramentas de IA” (ativas vs disponíveis).

Não auto-avançar — padrão de botão “próxima etapa”.

## Ordem de implementação

1. Tipos + heurísticas + templates ERP + `analyze` API (sem LLM).
2. Persistência `activeCapabilities` + `PUT/GET`.
3. Bind handlers + registro dinâmico no MCP.
4. UI admin (analyze + confirm).
5. LLM opcional de refino atrás de env.
6. Smoke no `erpclient` (clientes/pedidos/produtos → domain erp + 4+ suggestions).



## Todos

- [x] `packages/core/capabilities`: BusinessProfile, heurísticas de domínio, templates ERP
- [x] API analyze + GET/PUT capabilities + persistência no SQLite
- [x] Registrar tools de capacidades ativas no McpServer (`cap_*` + `mcp.json`)
- [x] UI admin: analisar negócio, sugerir e confirmar tools (`CapabilitiesPanel`)
- [x] Refino LLM opcional (schema→suggestions) com Zod fail-closed
- [x] Smoke heurístico erpclient (schema em memória): `erp_commerce` + 6 tools bound
- [x] Smoke E2E com Postgres (`npm run db:up`) + analyze/PUT + MCP ao vivo



## Fora deste plano

- Agentes verticais (Fase 3).
- OAuth ChatGPT.
- SQL/NL livre gerado por LLM.
- Treinar modelo próprio.

