# Contract — Camada de Persistência

**Feature**: `001-kash-mvp`

Este é o contrato que isola o app do meio de armazenamento. Nenhum componente React acessa `localStorage` diretamente. A assinatura é assíncrona desde o início para permitir a troca por Supabase/IndexedDB sem alterar nenhum consumidor (R-003).

## Interface genérica

```ts
export interface Repository<T extends { id: string }> {
  list(): Promise<T[]>;
  getById(id: string): Promise<T | null>;
  create(input: Omit<T, 'id' | 'createdAt' | 'updatedAt'>): Promise<T>;
  update(id: string, patch: Partial<T>): Promise<T>;
  remove(id: string): Promise<void>;
}
```

**Garantias**

- `create` gera `id`, `createdAt` e `updatedAt`; ignora esses campos se vierem no input.
- `update` recalcula `updatedAt` e rejeita com `NotFoundError` se o `id` não existir.
- `remove` é idempotente: remover um `id` inexistente não lança erro.
- Qualquer falha de escrita (cota estourada, modo privativo, armazenamento desabilitado) rejeita com `StorageUnavailableError`, que a UI traduz no aviso do FR-029.

## Repositórios especializados

```ts
export interface TransactionRepository extends Repository<Transaction> {
  listByMonth(month: string): Promise<Transaction[]>;            // month: 'YYYY-MM'
  listByFilters(filters: TransactionFilters): Promise<Transaction[]>;
  findByOccurrence(recurrenceId: string, occurrenceDate: string): Promise<Transaction | null>;
  createMany(inputs: NewTransaction[]): Promise<Transaction[]>;  // usado pela engine de recorrências
}

export interface TransactionFilters {
  month?: string;                       // 'YYYY-MM'
  type?: 'income' | 'expense';
  categoryId?: string;
  accountId?: string;
  search?: string;                      // busca textual em description, case-insensitive
}

export interface CategoryRepository extends Repository<Category> {
  listActive(): Promise<Category[]>;
  archive(id: string): Promise<Category>;
  unarchive(id: string): Promise<Category>;
}

export interface AccountRepository extends Repository<Account> {
  listActive(): Promise<Account[]>;
  archive(id: string): Promise<Account>;
  unarchive(id: string): Promise<Account>;
}

export interface BudgetRepository extends Repository<Budget> {
  getByCategory(categoryId: string): Promise<Budget | null>;
  upsertForCategory(categoryId: string, limitCents: number, startMonth: string): Promise<Budget>;
}

export interface RecurrenceRepository extends Repository<Recurrence> {
  listActive(): Promise<Recurrence[]>;
  markGenerated(id: string, lastGeneratedDate: string): Promise<Recurrence>;
}
```

**Contratos específicos**

- `listByFilters` combina os filtros com **E lógico**; campos ausentes não filtram. O resultado vem ordenado por `date` decrescente e, em empate, por `createdAt` decrescente (FR-005).
- `upsertForCategory` implementa o FR-017: se já houver orçamento para a categoria, atualiza `limitCents`; caso contrário, cria.
- `findByOccurrence` é a checagem de idempotência do FR-021.
- `remove` em `CategoryRepository` / `AccountRepository` **lança** `IntegrityError` se houver qualquer registro dependente; o caminho correto nesse caso é `archive` (FR-027).

## Banco e portabilidade

```ts
export interface KashDatabase {
  transactions: TransactionRepository;
  categories: CategoryRepository;
  accounts: AccountRepository;
  budgets: BudgetRepository;
  recurrences: RecurrenceRepository;

  seedIfEmpty(): Promise<void>;          // cria as 8 categorias e 3 contas padrão (FR-026)
  exportAll(): Promise<KashSnapshot>;    // FR-030
  importAll(snapshot: unknown): Promise<ImportResult>;  // valida antes de substituir (FR-030)
  isAvailable(): boolean;                // false quando o armazenamento não pode ser usado (FR-029)
}

export interface ImportResult {
  ok: boolean;
  errors: string[];
  counts: { transactions: number; categories: number; accounts: number; budgets: number; recurrences: number };
}
```

`importAll` nunca sobrescreve a base quando `ok === false`.

## Erros

```ts
export class NotFoundError extends Error {}
export class ValidationError extends Error { constructor(message: string, public field?: string) {} }
export class IntegrityError extends Error {}
export class StorageUnavailableError extends Error {}
```

A UI mapeia `ValidationError.field` para o campo do formulário correspondente (FR-003).
