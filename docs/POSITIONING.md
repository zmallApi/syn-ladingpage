# Posicionamento — Synapsee IA

> **Toda empresa já possui conhecimento. O problema é que ele está preso nos sistemas.**
>
> **O Synapsee não executa trabalho. Ele prepara trabalho.**

## Norte (README)

A plataforma transforma conhecimento disperso em contexto estruturado, organiza esse contexto em capacidades reutilizáveis, orquestra essas capacidades em missões e entrega **Mission Packages** para que agentes de IA executem o trabalho com segurança.

No Engineering, isso aparece como a missão **Implementar Story** (Story OS): história → impacto → plano → pack para o agente. O desenvolvedor deixa de descobrir o *quê* e foca no *como*.

## Categoria

**Context Operating System** — controla o ciclo:

```
Knowledge → Context → Capabilities → Mission → Agents
```

- **Context Engine** = núcleo (fatos → contexto)
- **Mission Engine** = cérebro (objetivo → fluxo → Mission Package)
- Não somos integração nem gerador de protocolo. Somos a ponte de **conhecimento**.
- Protocolos (MCP) e APIs são consequência — forma de entregar.

**Não vendemos “Discovery”.** Discovery (Understand) é uma capability dentro de missões.

**Não vendemos lista de capabilities.** Vendemos **missões** e **Mission Packages**.

## Mantra

```
Fatos → Contexto → Conhecimento → Missão → Execução
```

## Princípios

| Camada | Responsabilidade |
|--------|------------------|
| Knowledge Layer | Armazena fatos de fonte + enrichments duráveis (`proposed`/`confirmed`) |
| Knowledge Builder | Usa LLM como motor para propor conhecimento tipado (não é chatbot) |
| Context Engine | Organiza fatos em contexto |
| Capabilities | Transformam contexto em conhecimento acionável |
| Mission Engine | Orquestra capacidades para um objetivo |
| Mission Package | Entrega contexto estruturado para agentes |
| Agentes | Executam o trabalho |

## Plataforma e verticais

```
Synapsee — Context Operating System
│
├── Context Engine (núcleo)
├── Mission Engine (cérebro)
│
├── Business     → missões: cobrar, churn, oportunidades…
├── Engineering  → missões: implementar story, analisar incidente… (Story OS)
└── (Futuro)     → SAP, Salesforce, SharePoint, Slack…
```

## Vista de execução

O usuário **nunca** chama uma capability. Ele chama uma **missão**.

```
Mission → Mission Engine → Capabilities → Context Engine → Knowledge Layer → Sources
```

## Linguagem

| Usar | Evitar no pitch |
|------|-----------------|
| Context Operating System | Só “Context Engine” como produto inteiro |
| Mission / Mission Package | Vender lista de tools MCP |
| Mission Engine | Capability como workflow |
| Story OS (família de missões Eng) | “Discovery Agent” como o produto |
| Knowledge Layer / Context Engine | “Knowledge Graph” / “grafo” |
| Publicar / Usar | “Ensinar” / treinar modelo |
| Você aprova | Auto-expor tabelas |

## Especialistas → missões (prova concreta)

**Business**

- **Cobrar inadimplentes** → Mission Package com quem/quanto/prioridade  
- **Descobrir churn** → quem pode cancelar e o que fazer  
- **Encontrar oportunidades** → onde vender mais  

**Engineering**

- **Implementar Story** → Understand → Refine → Impact → Plan → Execute → Mission Package  
- **Analisar Incidente** → blast radius + evidências KL  

Frase:

> O Synapsee entrega Mission Packages. Os agentes executam o trabalho.

## Jornada percebida

Conectar → Entender → Especializar → **Publicar** → **Missão** → **Usar** (agente)

## Conexão (Cloud vs Edge)

| Cloud | Edge |
|------|------|
| Ideal para começar | Ideal para empresas |
| Configuração em minutos | Docker / Kubernetes |
| Fonte acessível | Segredos nunca expostos |
| Conexão direta | Apenas conexões de saída |

Frase Edge: **O Synapsee Cloud nunca entra na rede da empresa. O Synapsee Edge inicia toda a comunicação.**

## Frase de confiança

A IA nunca faz nada que você não tenha aprovado.

## Ver também

- [PLAN-MISSION-ENGINE.md](./PLAN-MISSION-ENGINE.md)
- [PLAN-PLATFORM-SURFACES.md](./PLAN-PLATFORM-SURFACES.md) — superfícies: REST, MCP, plugin, SDKs
- [PLAN-KNOWLEDGE-BUILDER.md](./PLAN-KNOWLEDGE-BUILDER.md) — LLM como motor; Knowledge Builder; enrichments
- [PLAN-STORY-OS.md](./PLAN-STORY-OS.md)
- [PLAN-ENGINEERING-KNOWLEDGE.md](./PLAN-ENGINEERING-KNOWLEDGE.md)
- [PLAN-EDGE.md](./PLAN-EDGE.md)
- [PLAN-MULTI-TENANT.md](./PLAN-MULTI-TENANT.md) — self-serve: cada empresa no seu tenant
