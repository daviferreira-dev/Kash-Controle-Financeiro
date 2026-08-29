# Implementation Plan: Kash — Controle Financeiro Pessoal (MVP)

**Branch**: `001-kash-mvp` | **Date**: 2026-08-29 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/001-kash-mvp/spec.md`

## Summary

Aplicação web de controle financeiro pessoal, em português do Brasil, que roda inteiramente no navegador. Entrega quatro capacidades: registro completo de receitas e despesas, um Overview mensal com saldo e distribuição por categoria, orçamentos por categoria com faixas de alerta, e recorrências que materializam contas fixas automaticamente.

A abordagem técnica é uma SPA em **Vite + React + TypeScript + Tailwind**, com **toda a lógica de negócio em funções puras** (`src/domain/`, `src/lib/`) e a persistência isolada atrás de uma **interface de repositório assíncrona** implementada hoje sobre LocalStorage. Essa fronteira é a decisão estruturante do plano: ela permite testar a aritmética financeira sem DOM e trocar o armazenamento por Supabase no futuro sem tocar em nenhum componente. Valores são inteiros em centavos e datas são strings `YYYY-MM-DD`, eliminando por construção as duas classes de bug mais caras deste domínio — arredondamento de ponto flutuante e deslocamento de fuso horário.

## Technical Context

**Language/Version**: TypeScript 5.6+ em modo `strict`, Node.js 20 LTS para o toolchain

**Primary Dependencies**: React 18, Vite 5, Tailwind CSS 3, React Router 6. Sem biblioteca de estado, de datas, de dinheiro ou de gráficos — ver justificativas em [research.md](./research.md)

**Storage**: LocalStorage do navegador, atrás da interface `Repository<T>` definida em [contracts/repositories.md](./contracts/repositories.md). Agregado único versionado por `schemaVersion`

**Testing**: Vitest (unidade e domínio) + React Testing Library (componentes). Cobertura obrigatória em `src/lib/` e `src/domain/`

**Target Platform**: Navegadores modernos (Chrome, Edge, Firefox, Safari — duas últimas versões). Sem servidor; distribuível como estático

**Project Type**: Single-project web application (SPA frontend-only)

**Performance Goals**: Overview, filtros da lista e salvamento respondendo em menos de 1s com 1.000 transações (SC-005). Bundle inicial abaixo de 250KB gzipped

**Constraints**: Offline-first por natureza (sem rede). Sem autenticação, sem multiusuário, sem sincronização entre dispositivos. Acessibilidade AA. Operação completa em viewport de 390px sem rolagem horizontal (SC-008). Interface integralmente em pt-BR

**Scale/Scope**: 1 usuário, 1 navegador. 5 telas principais (Overview, Transações, Orçamentos, Recorrências, Configurações), 5 entidades, ~32 requisitos funcionais

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

**Estado da constitution**: `.specify/memory/constitution.md` está com o template não preenchido — nenhum princípio foi ratificado para este projeto. **Não há gates formais a avaliar**, e o gate passa por vacuidade.

Na ausência de princípios ratificados, o plano adota explicitamente os seguintes compromissos, que ficam disponíveis para virar constitution depois:

| Compromisso | Como o plano atende |
|---|---|
| **Lógica de negócio pura e testável** | Toda aritmética financeira, de datas e de recorrência vive em funções puras sem React e sem I/O, recebendo o relógio por parâmetro |
| **Persistência isolada por contrato** | Nenhum componente acessa `localStorage`; tudo passa pela interface `Repository<T>` |
| **Simplicidade / YAGNI** | Nenhuma dependência adicionada sem uma justificativa registrada em `research.md`; quatro candidatas (biblioteca de datas, de dinheiro, de estado e de gráficos) foram avaliadas e recusadas |
| **Acessibilidade não-opcional** | Informação nunca transmitida apenas por cor (FR-007, FR-016), navegação por teclado, alvo AA |
| **Dados do usuário são invioláveis** | Importação valida antes de substituir; exclusão de categoria/conta com histórico arquiva em vez de apagar; falha de escrita é sempre comunicada |

**Pós-Phase 1**: reavaliado. O design não introduziu nenhuma violação — a camada de repositório e os serviços de domínio reforçam os dois primeiros compromissos, e nenhuma dependência nova foi adicionada durante a Phase 1. **Gate mantido.**

## Project Structure

### Documentation (this feature)

```text
specs/001-kash-mvp/
├── plan.md                      # Este arquivo
├── spec.md                      # Especificação da feature
├── research.md                  # Phase 0 — 10 decisões técnicas registradas
├── data-model.md                # Phase 1 — 5 entidades + agregado raiz
├── quickstart.md                # Phase 1 — instalação e 6 cenários de validação
├── contracts/
│   ├── repositories.md          # Contrato da camada de persistência
│   └── domain-services.md       # Contrato dos serviços de domínio puros
├── checklists/
│   └── requirements.md          # Checklist de qualidade da spec (16/16)
└── tasks.md                     # Phase 2 — gerado por /speckit-tasks
```

### Source Code (repository root)

```text
src/
├── main.tsx                     # Entry point
├── App.tsx                      # Rotas e providers
├── domain/                      # Lógica de negócio pura — sem React, sem I/O
│   ├── types.ts                 # Transaction, Category, Account, Budget, Recurrence
│   ├── validation.ts            # validateTransaction, validateRecurrence, ...
│   ├── recurrence.ts            # computePendingOccurrences, runRecurrences
│   ├── budget.ts                # computeBudgetProgress
│   └── overview.ts              # computeMonthOverview
├── lib/
│   ├── money.ts                 # parseBRL, formatBRL — centavos inteiros
│   ├── date.ts                  # IsoDate, addMonthsClamped, formatBR
│   ├── errors.ts                # NotFoundError, ValidationError, IntegrityError, StorageUnavailableError
│   └── id.ts                    # crypto.randomUUID
├── storage/                     # Persistência isolada
│   ├── repository.ts            # Interface Repository<T>
│   ├── localStorageRepository.ts
│   ├── database.ts              # KashDatabase, seedIfEmpty, exportAll, importAll
│   └── seed.ts                  # 8 categorias e 3 contas padrão (FR-026)
├── state/
│   ├── KashProvider.tsx         # Context + useReducer, hidratação inicial
│   └── hooks.ts                 # useTransactions, useBudgets, useRecurrences, ...
├── components/
│   ├── ui/                      # Button, Input, Select, Chip, Modal, EmptyState, ...
│   ├── layout/                  # AppShell, BottomNav, Sidebar, MonthSwitcher
│   ├── transactions/            # TransactionForm, TransactionList, TransactionItem, Filters
│   ├── budgets/                 # BudgetCard, BudgetForm, BudgetProgressBar
│   ├── recurrences/             # RecurrenceForm, RecurrenceList
│   └── charts/                  # DonutChart (SVG próprio)
├── pages/
│   ├── OverviewPage.tsx         # /
│   ├── TransactionsPage.tsx     # /transacoes
│   ├── BudgetsPage.tsx          # /orcamentos
│   ├── RecurrencesPage.tsx      # /recorrencias
│   └── SettingsPage.tsx         # /configuracoes
└── styles/
    ├── tokens.css               # Custom properties do design system
    └── index.css                # Tailwind + base

tests/
├── unit/                        # money, date, validation
├── domain/                      # recurrence, budget, overview
└── components/                  # fluxos das user stories via RTL

fixtures/
└── seed-1000.json               # Massa de 1.000 transações para validar SC-005

design/stitch/                   # Referência visual exportada do Stitch (não é código do app)
```

**Structure Decision**: Single project, SPA frontend-only. Não há `backend/` porque o MVP não tem servidor — a decisão de persistência local (FR-028) é explícita na spec. A separação que realmente importa aqui não é frontend/backend, mas **domínio puro** (`src/domain/`, `src/lib/`) × **persistência** (`src/storage/`) × **apresentação** (`src/components/`, `src/pages/`). Quando o backend entrar (Supabase, na evolução prevista em R-003), ele substitui apenas `src/storage/localStorageRepository.ts`, sem tocar nas outras duas camadas.

## Fases de implementação sugeridas

Ordenadas pelas prioridades das user stories, cada fase entregando um incremento demonstrável:

| Fase | Escopo | Entrega |
|---|---|---|
| **F0 — Fundação** | Scaffold Vite, Tailwind + tokens, tipos, `money`, `date`, repositórios, seed, AppShell e rotas | App navegável com dados semeados |
| **F1 — Transações (P1)** | Formulário, lista, filtros, edição, exclusão, validação | MVP utilizável de ponta a ponta |
| **F2 — Overview (P2)** | Agregações, cards de saldo, donut SVG, recentes, navegação entre meses, estados vazios | Tela inicial completa |
| **F3 — Orçamentos (P3)** | CRUD de orçamentos, cálculo de consumo, faixas de status | Controle de tetos por categoria |
| **F4 — Recorrências (P4)** | Engine idempotente, CRUD, pausar/retomar, marcação na lista | Contas fixas automatizadas |
| **F5 — Acabamento** | Export/import, aviso de armazenamento, gestão de categorias e contas, responsividade, acessibilidade, desempenho | Pronto para uso real |

## Complexity Tracking

> Preenchido apenas quando o Constitution Check apresenta violações a justificar.

Sem violações. Não há princípios ratificados na constitution, e o plano não introduz complexidade além do necessário: nenhuma dependência foi adicionada sem justificativa registrada, e a única indireção arquitetural deliberada — a interface de repositório — existe para atender a um requisito explícito de portabilidade da persistência, tendo sido a alternativa direta (acesso a `localStorage` nos componentes) avaliada e recusada em [research.md](./research.md#r-003--camada-de-persistência).
