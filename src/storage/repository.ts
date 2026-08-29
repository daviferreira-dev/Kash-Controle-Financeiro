import type {
  Account,
  Budget,
  Category,
  IsoDate,
  IsoMonth,
  KashSnapshot,
  NewTransaction,
  Recurrence,
  Transaction,
  TransactionType,
} from '@/domain/types';

/**
 * Contrato da camada de persistência (contracts/repositories.md).
 *
 * A assinatura é assíncrona mesmo com LocalStorage resolvendo na hora: é o que
 * permite trocar por Supabase ou IndexedDB depois sem tocar em nenhum
 * componente. Nenhum componente React acessa localStorage diretamente.
 */
export interface Repository<T extends { id: string }> {
  list(): Promise<T[]>;
  getById(id: string): Promise<T | null>;
  create(input: unknown): Promise<T>;
  update(id: string, patch: Partial<T>): Promise<T>;
  remove(id: string): Promise<void>;
}

export interface TransactionFilters {
  month?: IsoMonth;
  type?: TransactionType;
  categoryId?: string;
  accountId?: string;
  /** Busca textual em `description`, case-insensitive. */
  search?: string;
}

export interface TransactionRepository extends Repository<Transaction> {
  listByMonth(month: IsoMonth): Promise<Transaction[]>;
  listByFilters(filters: TransactionFilters): Promise<Transaction[]>;
  /** Checagem de idempotência da engine de recorrências (FR-021). */
  findByOccurrence(recurrenceId: string, occurrenceDate: IsoDate): Promise<Transaction | null>;
  createMany(inputs: NewTransaction[]): Promise<Transaction[]>;
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
  /** Implementa FR-017: um único orçamento por categoria. */
  upsertForCategory(categoryId: string, limitCents: number, startMonth: IsoMonth): Promise<Budget>;
}

export interface RecurrenceRepository extends Repository<Recurrence> {
  listActive(): Promise<Recurrence[]>;
  markGenerated(id: string, lastGeneratedDate: IsoDate): Promise<Recurrence>;
}

export interface ImportResult {
  ok: boolean;
  errors: string[];
  counts: {
    transactions: number;
    categories: number;
    accounts: number;
    budgets: number;
    recurrences: number;
  };
}

export interface KashDatabase {
  transactions: TransactionRepository;
  categories: CategoryRepository;
  accounts: AccountRepository;
  budgets: BudgetRepository;
  recurrences: RecurrenceRepository;

  /** Cria as 8 categorias e 3 contas padrão numa base vazia (FR-026). */
  seedIfEmpty(): Promise<void>;
  exportAll(): Promise<KashSnapshot>;
  /** Valida antes de substituir; nunca sobrescreve quando ok === false (FR-030). */
  importAll(snapshot: unknown): Promise<ImportResult>;
  /** false quando o armazenamento não pode ser usado (FR-029). */
  isAvailable(): boolean;
}
