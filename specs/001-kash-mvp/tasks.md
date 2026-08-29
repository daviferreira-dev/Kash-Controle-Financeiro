---
description: "Task list for Kash — Controle Financeiro Pessoal (MVP)"
---

# Tasks: Kash — Controle Financeiro Pessoal (MVP)

**Input**: Design documents from `/specs/001-kash-mvp/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/](./contracts/)

**Tests**: Incluídos. O [plan.md](./plan.md) define cobertura **obrigatória** em `src/lib/` e `src/domain/` (decisão [R-008](./research.md#r-008--estratégia-de-testes)) — é na aritmética monetária, nas datas e na engine de recorrência que um erro silencioso corrompe o dinheiro do usuário. Testes de componente cobrem os cenários de aceitação das user stories.

**Organization**: Tarefas agrupadas por user story, para que cada uma seja implementável, testável e demonstrável de forma independente.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Pode rodar em paralelo (arquivos diferentes, sem dependências pendentes)
- **[Story]**: User story a que a tarefa pertence (US1, US2, US3, US4)
- Todo caminho de arquivo é relativo à raiz do repositório

## Path Conventions

Single project (SPA frontend-only), conforme a Structure Decision do [plan.md](./plan.md): `src/` e `tests/` na raiz.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Inicialização do projeto e toolchain

- [X] T001 Inicializar o projeto Vite com o template `react-ts` na raiz do repositório, gerando `package.json`, `vite.config.ts`, `index.html` e `tsconfig.json`
- [X] T002 Instalar as dependências de runtime (`react`, `react-dom`, `react-router-dom`) e de desenvolvimento (`tailwindcss`, `postcss`, `autoprefixer`, `vitest`, `@testing-library/react`, `@testing-library/user-event`, `jsdom`, `eslint`, `prettier`) e registrar em `package.json`
- [X] T003 [P] Configurar o TypeScript em modo `strict` em `tsconfig.json`, incluindo `noUncheckedIndexedAccess`, e o alias de import `@/` apontando para `src/`
- [X] T004 [P] Configurar Tailwind em `tailwind.config.ts` e `postcss.config.js`, mapeando os tokens do design system em `theme.extend` conforme a decisão [R-007](./research.md#r-007--design-system-em-código)
- [X] T005 [P] Configurar Vitest em `vite.config.ts` com ambiente `jsdom` e criar `tests/setup.ts` com os matchers do Testing Library
- [X] T006 [P] Configurar ESLint em `eslint.config.js` e Prettier em `.prettierrc`, com as regras de hooks do React
- [X] T007 [P] Adicionar os scripts `dev`, `build`, `preview`, `test`, `test:watch`, `lint` e `typecheck` em `package.json`, conforme a tabela do [quickstart.md](./quickstart.md#comandos-disponíveis)
- [X] T008 [P] Criar `.gitignore` cobrindo `node_modules/`, `dist/`, `coverage/` e `.claude/skills/stitch/state.json`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Núcleo de domínio, persistência e casca da aplicação — tudo que qualquer user story precisa

**⚠️ CRITICAL**: Nenhuma user story pode começar antes desta fase estar completa

### Tipos e utilitários puros

- [X] T009 [P] Definir os tipos `Transaction`, `Category`, `Account`, `Budget`, `Recurrence`, `KashSnapshot` e os tipos de input (`NewTransaction`, etc.) em `src/domain/types.ts`, seguindo as tabelas de campos do [data-model.md](./data-model.md)
- [X] T010 [P] Implementar `NotFoundError`, `ValidationError` (com campo `field`), `IntegrityError` e `StorageUnavailableError` em `src/lib/errors.ts`
- [X] T011 [P] Implementar `newId()` sobre `crypto.randomUUID()` em `src/lib/id.ts`
- [X] T012 [P] Implementar `parseBRL`, `formatBRL`, `formatBRLSigned` e `MAX_AMOUNT_CENTS` em `src/lib/money.ts`, operando exclusivamente em centavos inteiros
- [X] T013 [P] Escrever os testes de `money` em `tests/unit/money.test.ts`, cobrindo entrada com e sem separador de milhar, vírgula e ponto decimal, entrada inválida, valor no teto de R$ 99.999.999,99 e a ausência de erro de arredondamento ao somar 1.000 valores
- [X] T014 [P] Implementar `today`, `formatBR`, `parseBR`, `monthOf`, `firstDayOfMonth`, `lastDayOfMonth`, `addMonths`, `addDaysToDate`, `addMonthsClamped`, `addYearsClamped`, `isValidIsoDate` e `formatMonthLabel` em `src/lib/date.ts`, sem construir `Date` a partir de string sem fuso explícito
- [X] T015 [P] Escrever os testes de `date` em `tests/unit/date.test.ts`, cobrindo o clamp de fim de mês (`'2026-01-31' + 1 mês = '2026-02-28'`), a preservação do dia-âncora (`'2026-02-28' + 1 mês com âncora 31 = '2026-03-31'`), 29/02 em ano não bissexto e a ausência de deslocamento de fuso em UTC-3

### Persistência

- [X] T016 Definir a interface `Repository<T>` e as interfaces especializadas (`TransactionRepository`, `CategoryRepository`, `AccountRepository`, `BudgetRepository`, `RecurrenceRepository`, `TransactionFilters`, `KashDatabase`, `ImportResult`) em `src/storage/repository.ts`, exatamente conforme [contracts/repositories.md](./contracts/repositories.md)
- [X] T017 Implementar `LocalStorageRepository<T>` em `src/storage/localStorageRepository.ts`, com geração de `id`/`createdAt`/`updatedAt`, `remove` idempotente e `try/catch` traduzindo falhas de escrita em `StorageUnavailableError` (depende de T016)
- [X] T018 [P] Implementar o seed das 8 categorias e 3 contas padrão em `src/storage/seed.ts`, com cores distintas da paleta e `isDefault: true` (FR-026)
- [X] T019 Implementar `KashDatabase` em `src/storage/database.ts`, agregando os cinco repositórios e expondo `seedIfEmpty`, `exportAll`, `importAll`, `isAvailable` e o controle de `schemaVersion` (depende de T017, T018)
- [X] T020 Implementar os métodos especializados de cada repositório em `src/storage/database.ts` — `listByMonth`, `listByFilters`, `findByOccurrence`, `createMany`, `listActive`, `archive`, `unarchive`, `getByCategory`, `upsertForCategory`, `markGenerated` — incluindo o `IntegrityError` ao remover categoria ou conta com dependentes (depende de T019)
- [X] T021 [P] Escrever os testes de persistência em `tests/domain/database.test.ts`, cobrindo seed idempotente, `upsertForCategory` substituindo o limite anterior, `IntegrityError` na remoção com dependentes e `importAll` rejeitando arquivo inválido sem sobrescrever a base

### Validação

- [X] T022 [P] Implementar `validateTransaction`, `validateRecurrence`, `validateBudget`, `validateCategory` e `validateAccount` em `src/domain/validation.ts`, retornando `ValidationError[]` com o campo correspondente (depende de T009, T010)
- [X] T023 [P] Escrever os testes de validação em `tests/unit/validation.test.ts`, cobrindo valor zero, negativo e acima do teto, descrição vazia, data inválida e nome de categoria duplicado entre ativas

### Casca da aplicação

- [X] T024 [P] Criar `src/styles/tokens.css` com as custom properties de cor, tipografia, raio e espaçamento do design system, e `src/styles/index.css` com as diretivas do Tailwind e o carregamento das fontes Playfair Display, Inter e Archivo Narrow com `display=swap` e fallbacks reais
- [X] T025 Implementar o `KashProvider` com Context e `useReducer` em `src/state/KashProvider.tsx`, hidratando o estado a partir do `KashDatabase` na montagem e expondo estado de carregamento (depende de T019)
- [X] T026 Implementar os hooks `useTransactions`, `useCategories`, `useAccounts`, `useBudgets`, `useRecurrences` e `useKashDatabase` em `src/state/hooks.ts` (depende de T025)
- [X] T027 [P] Implementar os primitivos de UI `Button`, `Input`, `CurrencyInput`, `DateInput`, `Select`, `Chip`, `Modal`, `ConfirmDialog` e `EmptyState` em `src/components/ui/`, todos com foco visível e rótulos acessíveis (depende de T024)
- [X] T028 [P] Implementar `AppShell`, `BottomNav` (até `md`) e `Sidebar` (a partir de `md`) em `src/components/layout/`, mobile-first a partir de 390px (depende de T024)
- [X] T029 Configurar as rotas `/`, `/transacoes`, `/orcamentos`, `/recorrencias` e `/configuracoes` em `src/App.tsx` com React Router, e montar `KashProvider` e `AppShell` em `src/main.tsx` (depende de T025, T028)

**Checkpoint**: App navegável, com dados semeados e camada de domínio testada. As user stories podem começar.

---

## Phase 3: User Story 1 — Registrar movimentações do dia a dia (Priority: P1) 🎯 MVP

**Goal**: Registrar, listar, filtrar, editar e excluir receitas e despesas, com persistência entre sessões.

**Independent Test**: Abrir o app com base limpa, criar uma despesa e uma receita, editar uma, excluir a outra, recarregar a página e confirmar que a lista reflete exatamente as operações — cenário [V1 do quickstart](./quickstart.md#v1--crud-de-transações-user-story-1-p1).

### Tests for User Story 1

- [X] T030 [P] [US1] Escrever o teste de fluxo de criação em `tests/components/transaction-create.test.tsx`, cobrindo a criação de uma despesa e de uma receita e sua aparição na lista com sinal, cor e data em DD/MM/AAAA
- [X] T031 [P] [US1] Escrever o teste de validação de formulário em `tests/components/transaction-validation.test.tsx`, verificando que salvar sem valor exibe erro no campo e não cria o lançamento
- [X] T032 [P] [US1] Escrever o teste de edição e exclusão em `tests/components/transaction-edit-delete.test.tsx`, verificando que cancelar a confirmação não altera nada e que confirmar remove e recalcula o total
- [X] T033 [P] [US1] Escrever o teste de filtros em `tests/components/transaction-filters.test.tsx`, cobrindo mês, tipo, categoria, conta, busca textual e o total dos itens filtrados

### Implementation for User Story 1

- [X] T034 [P] [US1] Implementar `TransactionForm` em `src/components/transactions/TransactionForm.tsx`, com alternância receita/despesa, valor em destaque, descrição, seletor de categoria em chips, seletor de conta, data com atalhos "Hoje"/"Ontem", observações opcionais e exibição de erros por campo (FR-001, FR-002, FR-003)
- [X] T035 [P] [US1] Implementar `TransactionItem` em `src/components/transactions/TransactionItem.tsx`, exibindo valor com sinal explícito e cor semântica, descrição, categoria, conta e data em DD/MM/AAAA (FR-006, FR-007)
- [X] T036 [P] [US1] Implementar `TransactionFilters` em `src/components/transactions/TransactionFilters.tsx`, com seletor de mês, tipo, categoria, conta e campo de busca (FR-005)
- [X] T037 [US1] Implementar `TransactionList` em `src/components/transactions/TransactionList.tsx`, ordenando por data decrescente, exibindo o total dos itens filtrados e um estado vazio (depende de T035, T036)
- [X] T038 [US1] Implementar `TransactionsPage` em `src/pages/TransactionsPage.tsx`, integrando lista, filtros, criação em modal e ação de novo lançamento (depende de T034, T037)
- [X] T039 [US1] Implementar edição e exclusão com confirmação explícita em `src/pages/TransactionsPage.tsx`, reaproveitando `TransactionForm` em modo de edição e `ConfirmDialog` (FR-004) (depende de T038)
- [X] T040 [US1] Ligar as ações de criar, editar e excluir aos repositórios via `useTransactions` em `src/state/hooks.ts`, garantindo que o estado e a persistência permaneçam sincronizados (depende de T039)

**Checkpoint**: MVP funcional. O app já substitui uma planilha manual e é demonstrável sozinho.

---

## Phase 4: User Story 2 — Ver a situação financeira em uma tela (Priority: P2)

**Goal**: Overview mensal com saldo, entradas, saídas, distribuição por categoria e lançamentos recentes.

**Independent Test**: Com receitas somando R$ 5.000,00 e despesas somando R$ 3.200,00 no mês, abrir o Overview e conferir saldo de R$ 1.800,00, gráfico somando 100% e recentes em ordem decrescente — cenário [V2 do quickstart](./quickstart.md#v2--overview-user-story-2-p2).

### Tests for User Story 2

- [X] T041 [P] [US2] Escrever os testes de `computeMonthOverview` em `tests/domain/overview.test.ts`, cobrindo saldo do mês, saldo acumulado com saldos iniciais e contas arquivadas, breakdown somando 100%, ordenação decrescente por valor e `isEmpty` em mês sem lançamentos
- [X] T042 [P] [US2] Escrever o teste da tela em `tests/components/overview.test.tsx`, cobrindo os totais exibidos, a navegação entre meses e o estado vazio com ação sugerida

### Implementation for User Story 2

- [X] T043 [P] [US2] Implementar `computeMonthOverview` e os tipos `MonthOverview` e `CategoryBreakdownItem` em `src/domain/overview.ts`, conforme [contracts/domain-services.md](./contracts/domain-services.md) (FR-008, FR-009, FR-010, FR-011)
- [X] T044 [P] [US2] Implementar `DonutChart` em SVG próprio em `src/components/charts/DonutChart.tsx`, com `stroke-dasharray`, cores vindas dos tokens e `role`/`aria-label` descritivos (decisão [R-006](./research.md#r-006--gráfico-do-overview))
- [X] T045 [P] [US2] Implementar `MonthSwitcher` em `src/components/layout/MonthSwitcher.tsx`, com navegação para mês anterior e seguinte e rótulo em português (FR-012)
- [X] T046 [P] [US2] Implementar `BalanceCards` em `src/components/overview/BalanceCards.tsx`, exibindo saldo do período, entradas e saídas com a tipografia `display-hero` do design system
- [X] T047 [US2] Implementar `CategoryBreakdownList` em `src/components/overview/CategoryBreakdownList.tsx`, com valor e percentual por categoria em formato textual ao lado do gráfico (FR-010, SC-007) (depende de T044)
- [X] T048 [US2] Implementar `OverviewPage` em `src/pages/OverviewPage.tsx`, integrando `MonthSwitcher`, `BalanceCards`, `DonutChart`, `CategoryBreakdownList`, os 5 lançamentos recentes com link para a lista completa e o estado vazio (FR-013) (depende de T043, T045, T046, T047)

**Checkpoint**: US1 e US2 funcionam independentemente. A tela inicial responde "como estou este mês?".

---

## Phase 5: User Story 3 — Controlar gastos com orçamentos por categoria (Priority: P3)

**Goal**: Definir teto mensal por categoria e acompanhar consumo com faixas de alerta.

**Independent Test**: Definir R$ 800,00 para Alimentação, lançar despesas e verificar a evolução de 75% → "Em atenção" (81%) → "Estourado" (106%) com o excedente explícito — cenário [V3 do quickstart](./quickstart.md#v3--orçamentos-user-story-3-p3).

### Tests for User Story 3

- [X] T049 [P] [US3] Escrever os testes de `computeBudgetProgress` em `tests/domain/budget.test.ts`, cobrindo as três faixas de status, as fronteiras exatas de 80% e 100%, restante negativo quando estourado, orçamento sem gastos e o isolamento por mês e por categoria
- [X] T050 [P] [US3] Escrever o teste da tela em `tests/components/budgets.test.tsx`, verificando que redefinir o limite substitui o orçamento existente em vez de criar um segundo

### Implementation for User Story 3

- [X] T051 [P] [US3] Implementar `computeBudgetProgress` e o tipo `BudgetProgress` em `src/domain/budget.ts`, com `statusLabel` textual conforme [data-model.md](./data-model.md) (FR-015, FR-016, FR-018)
- [X] T052 [P] [US3] Implementar `BudgetProgressBar` em `src/components/budgets/BudgetProgressBar.tsx`, com preenchimento proporcional, tratamento visual do estouro e `aria-valuenow`
- [X] T053 [P] [US3] Implementar `BudgetForm` em `src/components/budgets/BudgetForm.tsx`, com seletor de categoria de despesa e campo de limite (FR-014)
- [X] T054 [US3] Implementar `BudgetCard` em `src/components/budgets/BudgetCard.tsx`, exibindo limite, consumido, restante, percentual e o **rótulo textual** do status além da cor (FR-016, SC-007) (depende de T051, T052)
- [X] T055 [US3] Implementar `BudgetsPage` em `src/pages/BudgetsPage.tsx`, listando os orçamentos do mês selecionado, com criação, edição, remoção e estado vazio (depende de T053, T054)
- [X] T056 [US3] Ligar a definição de orçamento a `upsertForCategory` via `useBudgets` em `src/state/hooks.ts`, garantindo um único orçamento por categoria (FR-017) (depende de T055)

**Checkpoint**: US1, US2 e US3 funcionam independentemente.

---

## Phase 6: User Story 4 — Não relançar contas fixas todo mês (Priority: P4)

**Goal**: Cadastrar recorrências que geram transações automaticamente, sem duplicar.

**Independent Test**: Cadastrar recorrência mensal iniciando em 05/06/2026, abrir o app em 29/08/2026 e confirmar exatamente 3 lançamentos (05/06, 05/07, 05/08), nenhum futuro, e nenhuma duplicata ao recarregar — cenário [V4 do quickstart](./quickstart.md#v4--recorrências-user-story-4-p4).

### Tests for User Story 4

- [X] T057 [P] [US4] Escrever os testes de `computePendingOccurrences` em `tests/domain/recurrence.test.ts`, cobrindo as três frequências, recorrência pausada não gerando nada, corte em `today`, corte em `endDate`, e a sequência 31/01 → 28/02 → 31/03 com preservação do dia-âncora
- [X] T058 [P] [US4] Escrever o teste de idempotência em `tests/domain/recurrence-idempotency.test.ts`, verificando que executar `runRecurrences` duas vezes com o mesmo `today` produz `createdCount === 0` na segunda, e que uma transação gerada e depois excluída **não** é recriada

### Implementation for User Story 4

- [X] T059 [P] [US4] Implementar `computePendingOccurrences` como função pura em `src/domain/recurrence.ts`, recebendo `today` por parâmetro e aplicando o clamp de fim de mês sobre o dia-âncora do `startDate` (FR-022, FR-025)
- [X] T060 [US4] Implementar `runRecurrences` em `src/domain/recurrence.ts`, verificando a chave determinística (`sourceRecurrenceId`, `occurrenceDate`) via `findByOccurrence` antes de inserir, persistindo em lote com `createMany`, avançando `lastGeneratedDate` e retornando `RunRecurrencesResult` (FR-020, FR-021) (depende de T059)
- [X] T061 [P] [US4] Implementar `RecurrenceForm` em `src/components/recurrences/RecurrenceForm.tsx`, com tipo, valor, descrição, categoria, conta, frequência, data de início e data final opcional (FR-019)
- [X] T062 [P] [US4] Implementar `RecurrenceList` e `RecurrenceItem` em `src/components/recurrences/`, com ações de pausar, retomar, editar e excluir, e indicação da próxima ocorrência (FR-023)
- [X] T063 [US4] Implementar `RecurrencesPage` em `src/pages/RecurrencesPage.tsx`, integrando formulário, lista e estado vazio (depende de T061, T062)
- [X] T064 [US4] Disparar `runRecurrences` na hidratação do `KashProvider` em `src/state/KashProvider.tsx`, exibindo um aviso com a contagem quando `createdCount > 0` (FR-020) (depende de T060)
- [X] T065 [US4] Exibir a marcação de origem "recorrência" em `src/components/transactions/TransactionItem.tsx`, distinguindo lançamentos gerados dos manuais (FR-024) (depende de T035)

**Checkpoint**: Todas as quatro user stories funcionam independentemente.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Acabamento que atravessa todas as histórias

- [X] T066 [P] Implementar export e import de dados em `src/pages/SettingsPage.tsx`, com download do JSON, confirmação explícita antes de substituir a base e mensagem de erro que preserva a base atual quando o arquivo é inválido (FR-030)
- [X] T067 [P] Implementar o aviso persistente de armazenamento indisponível em `src/components/layout/StorageWarning.tsx`, alimentado por `KashDatabase.isAvailable()` (FR-029)
- [X] T068 [P] Implementar a gestão de categorias e contas em `src/pages/SettingsPage.tsx`, com criação, renomeação, arquivamento e reativação, preservando o histórico (FR-027)
- [X] T069 [P] Gerar `fixtures/seed-1000.json` com 1.000 transações distribuídas em 12 meses e todas as categorias, para a validação de desempenho do SC-005
- [X] T070 Otimizar as agregações com `useMemo` em `src/pages/OverviewPage.tsx` e `src/pages/TransactionsPage.tsx`, validando com a fixture que Overview, filtros e salvamento respondem abaixo de 1s (SC-005) (depende de T069)
- [ ] T071 [P] (pendente: exige navegador real) Auditar a responsividade em 390px em todas as cinco páginas, eliminando qualquer rolagem horizontal (SC-008, FR-032)
- [ ] T072 [P] (pendente: exige navegador real) Auditar a acessibilidade: navegação completa por teclado, foco visível, contraste AA e verificação em escala de cinza de que receita/despesa e o status "Estourado" continuam identificáveis (FR-007, SC-007)
- [X] T073 [P] Revisar todos os textos da interface para português do Brasil, sem termos em inglês vazados (FR-031)
- [ ] T074 (parcial: V1 e V2 validados no Chrome; V3–V6 pendentes) Executar todos os cenários de validação V1 a V6 do [quickstart.md](./quickstart.md#cenários-de-validação) e corrigir as divergências encontradas
- [X] T075 [P] Escrever o `README.md` da raiz com propósito do app, stack, comandos e o aviso de que os dados vivem apenas no navegador

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: sem dependências — começa imediatamente
- **Foundational (Phase 2)**: depende do Setup — **bloqueia todas as user stories**
- **User Stories (Phases 3–6)**: todas dependem da Phase 2; depois disso podem correr em paralelo ou em ordem de prioridade (P1 → P2 → P3 → P4)
- **Polish (Phase 7)**: depende das user stories desejadas estarem completas

### User Story Dependencies

- **US1 (P1)**: depende apenas da Foundational. Nenhuma dependência de outra história
- **US2 (P2)**: depende apenas da Foundational. Consome transações, mas é testável com dados semeados diretamente no repositório
- **US3 (P3)**: depende apenas da Foundational. Idem
- **US4 (P4)**: depende apenas da Foundational. Gera transações do mesmo tipo que US1, mas por um caminho próprio. **T065 é a única tarefa com dependência cruzada** (toca `TransactionItem`, de US1) — se US1 ainda não existir, ela é adiada sem bloquear o resto de US4

### Within Each User Story

- Testes primeiro, falhando, antes da implementação
- Funções puras de domínio antes dos componentes
- Componentes antes das páginas que os integram
- História completa antes de passar para a próxima prioridade

### Parallel Opportunities

- **Phase 1**: T003 a T008 em paralelo, após T001 e T002
- **Phase 2**: T009 a T015 em paralelo (tipos e utilitários puros, arquivos distintos); T018 em paralelo com T017; T021, T022, T023, T024 em paralelo; T027 e T028 em paralelo
- **Phase 3**: T030 a T033 em paralelo; T034, T035, T036 em paralelo
- **Phase 4**: T041, T042 em paralelo; T043 a T046 em paralelo
- **Phase 5**: T049, T050 em paralelo; T051, T052, T053 em paralelo
- **Phase 6**: T057, T058 em paralelo; T061, T062 em paralelo
- **Phase 7**: T066, T067, T068, T069, T071, T072, T073, T075 em paralelo
- Com equipe: após a Phase 2, as quatro histórias podem ser distribuídas entre pessoas diferentes

---

## Parallel Example: User Story 1

```bash
# Testes da US1 juntos:
Task: "Teste de criação em tests/components/transaction-create.test.tsx"
Task: "Teste de validação em tests/components/transaction-validation.test.tsx"
Task: "Teste de edição e exclusão em tests/components/transaction-edit-delete.test.tsx"
Task: "Teste de filtros em tests/components/transaction-filters.test.tsx"

# Componentes da US1 juntos:
Task: "TransactionForm em src/components/transactions/TransactionForm.tsx"
Task: "TransactionItem em src/components/transactions/TransactionItem.tsx"
Task: "TransactionFilters em src/components/transactions/TransactionFilters.tsx"
```

---

## Implementation Strategy

### MVP First (User Story 1 apenas)

1. Completar a Phase 1: Setup
2. Completar a Phase 2: Foundational (**crítico** — bloqueia tudo)
3. Completar a Phase 3: User Story 1
4. **PARAR e VALIDAR**: rodar o cenário V1 do quickstart de ponta a ponta
5. O app já é utilizável e demonstrável

### Incremental Delivery

1. Setup + Foundational → fundação pronta
2. US1 → validar com V1 → **MVP entregue**
3. US2 → validar com V2 → tela inicial completa
4. US3 → validar com V3 → controle de tetos
5. US4 → validar com V4 → contas fixas automatizadas
6. Polish → validar com V5 e V6 → pronto para uso real

Cada história agrega valor sem quebrar as anteriores.

---

## Notes

- `[P]` = arquivos diferentes, sem dependências pendentes
- O rótulo `[Story]` dá rastreabilidade da tarefa até a user story na [spec.md](./spec.md)
- Verificar que os testes falham antes de implementar
- Commitar após cada tarefa ou grupo lógico
- É seguro parar em qualquer checkpoint e validar a história isoladamente
- Toda aritmética monetária em centavos inteiros; toda data como string `YYYY-MM-DD` — as duas invariantes que atravessam o projeto inteiro
