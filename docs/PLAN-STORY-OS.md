# Story OS — família de missões Engineering

> Synapsee é um **Context Operating System**. Story OS é a primeira família de missões no vertical Engineering — não a categoria do produto inteiro.
>
> Missão principal: **Implementar Story** (`implement_story`) → Mission Package para o agente.
>
> Norte: o Synapsee **não executa trabalho. Ele prepara trabalho.**

## O que muda no posicionamento

| Antes | Depois |
|-------|--------|
| Vendemos Discovery | Vendemos **missões** e **Mission Packages** |
| Especialista no *começo* da história | Missão cobre a **vida inteira** da história |
| “Cursor acelera código; Synapsee acelera Discovery” | Synapsee prepara o **contexto de implementação** ponta a ponta |

Discovery vira a capability **Understand** — não o produto.

## Pipeline (= missão `implement_story`)

```
Story → Understand → Refine → Impact → Plan → Execute → Mission Package
```

Cada etapa é uma **capability** (recebe contexto, produz conclusão, sem workflow). O **Mission Engine** orquestra a ordem e empacota o resultado.

| Etapa | Capability | Faz |
|-------|------------|-----|
| **Understand** | `eng_understand_story` | História + KL: AS-IS/TO-BE, riscos, perguntas |
| **Refine** | `eng_refine_story` | Aceite/escopo/MVP |
| **Impact** | `eng_impact_analysis` | Blast radius |
| **Plan** | `eng_implementation_plan` | Work items ordenados |
| **Execute** | `eng_execute_context` | Emite Mission Package — Synapsee **não** escreve código |

Invariante: KL = fatos; conclusões só nas capabilities; sem inventar vínculo Task↔PR.

## Estado

| Peça | Estado |
|------|--------|
| Capabilities A–E | Pronto |
| Mission Package (schema) | Ver Mission Engine |
| Mission `implement_story` | Via Mission Engine `run_mission` |
| Stepper Admin | Pipeline + missões |
| Landing Context OS | Ver Fase 5 |

## Ver também

- [PLAN-MISSION-ENGINE.md](./PLAN-MISSION-ENGINE.md)
- [POSITIONING.md](./POSITIONING.md)
