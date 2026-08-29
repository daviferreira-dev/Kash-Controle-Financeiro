# Contract — Serviços de Domínio

**Feature**: `001-kash-mvp`

Funções **puras** que concentram toda a lógica de negócio. Não tocam em `localStorage`, não dependem de React e recebem o relógio por parâmetro — é o que as torna testáveis de forma determinística (R-008).

## `src/lib/money.ts`

```ts
export function parseBRL(input: string): number;        // "1.234,56" -> 123456 (centavos)
export function formatBRL(cents: number): string;       // 123456 -> "R$ 1.234,56"
export function formatBRLSigned(cents: number, type: TransactionType): string; // "− R$ 1.234,56"
export const MAX_AMOUNT_CENTS = 9_999_999_999;
```

- `parseBRL` aceita entrada com ou sem separador de milhar, com vírgula ou ponto decimal, e lança `ValidationError` para entrada não numérica.
- `formatBRL` usa `Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })` — FR-006.
- `formatBRLSigned` antepõe sinal explícito, para que o tipo do lançamento não dependa só da cor (FR-007).

## `src/lib/date.ts`

```ts
export type IsoDate = string;   // 'YYYY-MM-DD'
export type IsoMonth = string;  // 'YYYY-MM'

export function today(): IsoDate;
export function formatBR(date: IsoDate): string;              // '2026-08-29' -> '29/08/2026'
export function parseBR(input: string): IsoDate;              // '29/08/2026' -> '2026-08-29'
export function monthOf(date: IsoDate): IsoMonth;
export function firstDayOfMonth(month: IsoMonth): IsoDate;
export function lastDayOfMonth(month: IsoMonth): IsoDate;
export function addMonths(month: IsoMonth, delta: number): IsoMonth;
export function addDaysToDate(date: IsoDate, days: number): IsoDate;
export function addMonthsClamped(date: IsoDate, months: number, anchorDay: number): IsoDate;
export function addYearsClamped(date: IsoDate, years: number, anchorDay: number): IsoDate;
export function isValidIsoDate(value: string): boolean;
export function formatMonthLabel(month: IsoMonth): string;    // '2026-08' -> 'Agosto de 2026'
```

- `addMonthsClamped` implementa o FR-025: `('2026-01-31', 1, 31)` → `'2026-02-28'`; `('2026-02-28', 1, 31)` → `'2026-03-31'`. O `anchorDay` preserva o dia original entre saltos, evitando o "arrasto" para trás.
- `addYearsClamped` aplica a mesma ideia para 29/02 em ano não bissexto.
- Nenhuma função constrói `Date` a partir de string sem fuso explícito (R-002).

## `src/domain/recurrence.ts`

```ts
export interface GenerateOccurrencesInput {
  recurrence: Recurrence;
  today: IsoDate;
}

export interface GeneratedOccurrence {
  occurrenceDate: IsoDate;
}

/** Datas teóricas ainda não materializadas, até `today`. Pura, sem I/O. */
export function computePendingOccurrences(input: GenerateOccurrencesInput): GeneratedOccurrence[];

export interface RunRecurrencesResult {
  createdCount: number;
  byRecurrence: Record<string, number>;
}

/** Orquestra: calcula, verifica idempotência, persiste e avança lastGeneratedDate. */
export function runRecurrences(db: KashDatabase, today: IsoDate): Promise<RunRecurrencesResult>;
```

**Regras verificadas por teste** (FR-020 a FR-025):

- Recorrência `paused` não produz ocorrências.
- Ocorrências com data `> today` nunca são produzidas.
- Ocorrências com data `> endDate` nunca são produzidas.
- Executar `runRecurrences` duas vezes seguidas com o mesmo `today` produz `createdCount === 0` na segunda.
- Recorrência mensal iniciada em 31/01 gera 31/01, 28/02, 31/03.
- `createdCount` alimenta o aviso de "N lançamentos criados" quando a recorrência é antiga.

## `src/domain/budget.ts`

```ts
export interface BudgetProgress {
  budget: Budget;
  category: Category;
  spentCents: number;
  remainingCents: number;   // negativo quando estourado
  percentUsed: number;      // pode passar de 100
  status: 'ok' | 'warning' | 'exceeded';
  statusLabel: string;      // 'Dentro do limite' | 'Em atenção' | 'Estourado'
}

export function computeBudgetProgress(
  budget: Budget,
  category: Category,
  transactions: Transaction[],
  month: IsoMonth,
): BudgetProgress;
```

Considera apenas transações com `type === 'expense'`, `categoryId` correspondente e `date` dentro de `month` (FR-018). Faixas de `status` conforme a tabela do [data-model.md](../data-model.md) (FR-016).

## `src/domain/overview.ts`

```ts
export interface CategoryBreakdownItem {
  categoryId: string;
  categoryName: string;
  color: string;
  totalCents: number;
  percent: number;          // participação nas despesas do mês
}

export interface MonthOverview {
  month: IsoMonth;
  incomeCents: number;
  expenseCents: number;
  balanceCents: number;         // income - expense, do mês (FR-008)
  accumulatedBalanceCents: number; // todos os lançamentos até hoje + saldos iniciais (FR-009)
  breakdown: CategoryBreakdownItem[];  // desc. por valor (FR-010)
  recent: Transaction[];        // 5 mais recentes do mês (FR-011)
  isEmpty: boolean;             // dispara o estado vazio do FR-013
}

export function computeMonthOverview(
  transactions: Transaction[],
  categories: Category[],
  accounts: Account[],
  month: IsoMonth,
  today: IsoDate,
): MonthOverview;
```

- `breakdown` cobre apenas despesas e soma exatamente 100% quando há despesas; retorna vazio quando não há.
- `accumulatedBalanceCents` inclui contas arquivadas e soma os `initialBalanceCents`.

## `src/domain/validation.ts`

```ts
export function validateTransaction(input: NewTransaction): ValidationError[];
export function validateRecurrence(input: NewRecurrence): ValidationError[];
export function validateBudget(input: NewBudget): ValidationError[];
export function validateCategory(input: NewCategory, existing: Category[]): ValidationError[];
export function validateAccount(input: NewAccount, existing: Account[]): ValidationError[];
```

Retornam lista vazia quando válido. Cada erro carrega o `field` correspondente, para a UI destacar o campo certo (FR-003). As regras são exatamente as tabelas de "Regras" do [data-model.md](../data-model.md).
