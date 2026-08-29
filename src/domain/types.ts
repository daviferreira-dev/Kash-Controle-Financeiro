/**
 * Tipos do domínio Kash.
 *
 * Duas invariantes atravessam o projeto inteiro:
 * - Dinheiro é SEMPRE `number` inteiro em centavos, sempre positivo. O sinal
 *   vem de `type`, nunca do número.
 * - Data é SEMPRE string 'YYYY-MM-DD' (data civil, sem hora e sem fuso).
 */

/** Data civil no formato 'YYYY-MM-DD'. */
export type IsoDate = string;

/** Mês no formato 'YYYY-MM'. */
export type IsoMonth = string;

/** Instante ISO 8601 completo, com fuso. Usado só em auditoria. */
export type IsoTimestamp = string;

export type TransactionType = 'income' | 'expense';
export type TransactionSource = 'manual' | 'recurrence';
export type CategoryKind = 'expense' | 'income' | 'both';
export type RecurrenceFrequency = 'weekly' | 'monthly' | 'yearly';
export type RecurrenceStatus = 'active' | 'paused';
export type BudgetStatus = 'ok' | 'warning' | 'exceeded';

export interface Transaction {
  id: string;
  type: TransactionType;
  /** Inteiro, em centavos, sempre > 0. */
  amountCents: number;
  description: string;
  date: IsoDate;
  categoryId: string;
  accountId: string;
  notes: string | null;
  source: TransactionSource;
  /** Preenchido apenas quando source === 'recurrence'. */
  sourceRecurrenceId: string | null;
  /** Data teórica da ocorrência. Com sourceRecurrenceId, forma a chave de idempotência. */
  occurrenceDate: IsoDate | null;
  createdAt: IsoTimestamp;
  updatedAt: IsoTimestamp;
}

export interface Category {
  id: string;
  name: string;
  icon: string;
  /** Hex '#RRGGBB'. Usado no gráfico do Overview. */
  color: string;
  kind: CategoryKind;
  archived: boolean;
  /** true nas categorias-semente; impede exclusão definitiva. */
  isDefault: boolean;
}

export interface Account {
  id: string;
  name: string;
  /** Inteiro em centavos; pode ser negativo. */
  initialBalanceCents: number;
  archived: boolean;
  isDefault: boolean;
}

export interface Budget {
  id: string;
  categoryId: string;
  /** Inteiro em centavos, > 0. */
  limitCents: number;
  /** Mês a partir do qual o limite vale. */
  startMonth: IsoMonth;
  createdAt: IsoTimestamp;
  updatedAt: IsoTimestamp;
}

export interface Recurrence {
  id: string;
  type: TransactionType;
  amountCents: number;
  description: string;
  categoryId: string;
  accountId: string;
  notes: string | null;
  frequency: RecurrenceFrequency;
  startDate: IsoDate;
  endDate: IsoDate | null;
  status: RecurrenceStatus;
  /** null enquanto nenhuma ocorrência foi materializada. */
  lastGeneratedDate: IsoDate | null;
  createdAt: IsoTimestamp;
  updatedAt: IsoTimestamp;
}

/** Campos gerados pela camada de persistência, nunca fornecidos pelo chamador. */
export type Managed = 'id' | 'createdAt' | 'updatedAt';

export type NewTransaction = Omit<Transaction, Managed>;
export type NewCategory = Omit<Category, 'id'>;
export type NewAccount = Omit<Account, 'id'>;
export type NewBudget = Omit<Budget, Managed>;
export type NewRecurrence = Omit<Recurrence, Managed>;

/** Versão atual do formato persistido. Incrementar exige migração. */
export const SCHEMA_VERSION = 1;

export interface KashSnapshot {
  schemaVersion: number;
  transactions: Transaction[];
  categories: Category[];
  accounts: Account[];
  budgets: Budget[];
  recurrences: Recurrence[];
  exportedAt?: IsoTimestamp;
}
