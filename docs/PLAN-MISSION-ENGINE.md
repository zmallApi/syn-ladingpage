# Mission Engine — Context Operating System

> O Synapsee **não executa trabalho. Ele prepara trabalho.**
>
> A plataforma transforma conhecimento disperso em contexto estruturado, organiza esse contexto em capacidades reutilizáveis, orquestra essas capacidades em missões e entrega **Mission Packages** para que agentes de IA executem o trabalho com segurança.

## Modelo mental

```
Knowledge
    ↓
Context
    ↓
Capability
    ↓
Mission
    ↓
Agent
```

**Mantra:** `Fatos → Contexto → Conhecimento → Missão → Execução`

## Categoria

**Context Operating System** — controla o ciclo completo Knowledge → Context → Capabilities → Mission → Agents.

- **Context Engine** = núcleo (organiza fatos em contexto)
- **Mission Engine** = cérebro (objetivo humano → fluxo → Mission Package)
- **Story OS** = primeira família de missões no vertical Engineering

## Princípios

| Camada | Responsabilidade |
|--------|------------------|
| Knowledge Layer | Armazena **fatos** |
| Context Engine | Organiza fatos em **contexto** |
| Capabilities | Transformam contexto em **conhecimento acionável** |
| Mission Engine | Orquestra capacidades para atingir um **objetivo** |
| Mission Package | Entrega contexto estruturado para **agentes** |
| Agentes | **Executam** o trabalho |

Invariantes: KL = fatos de fonte + enrichments tipados com status (`proposed`/`confirmed`); Context Engine sem decisões de negócio; Capability sem workflow; Mission Engine sem inventar fatos; Synapsee só prepara. Ver [PLAN-KNOWLEDGE-BUILDER.md](./PLAN-KNOWLEDGE-BUILDER.md).

## Duas vistas

**Execução (produto):** Mission → Mission Engine → Capabilities → Context Engine → KL → Sources

**Física (dados):** Sources → KL → Context Engine → Capabilities (missões consomem acima)

## Definições

### Mission Engine

Transforma um objetivo humano em fluxo de execução. Cada missão conhece: quais capabilities, ordem, como combinar resultados, como produzir o Mission Package.

### Capability

Unidade reutilizável de inteligência. Recebe contexto, produz conclusão, **nunca** executa workflow.

### Context Engine

Constrói contexto a partir de fatos. Não toma decisões — só responde perguntas de evidência.

### Mission Package

Artefato principal entregue pelo Synapsee: objetivo, evidências, conclusões, riscos, plano, checklist, referências, instruções ao agente.

## Missões v1

| id | Objetivo | Caps |
|----|----------|------|
| `implement_story` | Implementar Story | Understand → Refine → Impact → Plan → Execute |
| `collect_overdue` | Cobrar inadimplentes | overdue_ledger → attention_queue |
| `analyze_incident` | Analisar incidente | Impact (+ evidências KL) |

## Entrypoint

- API: `POST /projects/:id/missions/run`
- MCP: `run_mission`
- Admin: painel de missões

Capabilities continuam testáveis isoladamente; o uso normal é via missão.

## Ver também

- [POSITIONING.md](./POSITIONING.md)
- [PLAN-PLATFORM-SURFACES.md](./PLAN-PLATFORM-SURFACES.md) — REST, MCP, plugin VS Code, SDKs
- [PLAN-KNOWLEDGE-BUILDER.md](./PLAN-KNOWLEDGE-BUILDER.md) — Knowledge Builder + LLM provider
- [PLAN-STORY-OS.md](./PLAN-STORY-OS.md)
- [PLAN-ENGINEERING-KNOWLEDGE.md](./PLAN-ENGINEERING-KNOWLEDGE.md)
