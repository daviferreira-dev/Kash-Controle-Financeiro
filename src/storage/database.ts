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
} from '@/domain/types';
import { SCHEMA_VERSION } from '@/domain/types';
import { IntegrityError, NotFoundError } from '@/lib/errors';
import { isInMonth } from '@/lib/date';
import { newId, nowTimestamp } from '@/lib/id';
import {
  LocalStorageRepository,
  STORAGE_KEYS,
  isStorageAvailable,
} from './localStorageRepository';
import { DEFAULT_ACCOUNTS, DEFAULT_CATEGORIES } from './seed';
import type {
  AccountRepository,
  BudgetRepository,
  CategoryRepository,
  ImportResult,
  KashDatabase,
  RecurrenceRepository,
  TransactionFilters,
  TransactionRepository,
} from './repository';

/** Ordena por data decrescente e, no empate, pelo mais recentemente criado. */
function byDateDesc(a: Transaction, b: Transaction): number {
  if (a.date !== b.date) return a.date < b.date ? 1 : -1;
  return a.createdAt < b.createdAt ? 1 : -1;
}

class LocalTransactionRepository
  extends LocalStorageRepository<Transaction>
  implements TransactionRepository
{
  constructor() {
    super(STORAGE_KEYS.transactions, 'Transação');
  }

  override async list(): Promise<Transaction[]> {
    return this.readAll().sort(byDateDesc);
  }

  async listByMonth(month: IsoMonth): Promise<Transaction[]> {
    return this.readAll()
      .filter((t) => isInMonth(t.date, month))
      .sort(byDateDesc);
  }

  /** Filtros combinam com E lógico; campos ausentes não filtram (FR-005). */
  async listByFilters(filters: TransactionFilters): Promise<Transaction[]> {
    const search = filters.search?.trim().toLowerCase();

    return this.readAll()
      .filter((t) => {
        if (filters.month && !isInMonth(t.date, filters.month)) return false;
        if (filters.type && t.type !== filters.type) return false;
        if (filters.categoryId && t.categoryId !== filters.categoryId) return false;
        if (filters.accountId && t.accountId !== filters.accountId) return false;
        if (search && !t.description.toLowerCase().includes(search)) return false;
        return true;
      })
      .sort(byDateDesc);
  }

  async findByOccurrence(
    recurrenceId: string,
    occurrenceDate: IsoDate,
  ): Promise<Transaction | null> {
    return (
      this.readAll().find(
        (t) => t.sourceRecurrenceId === recurrenceId && t.occurrenceDate === occurrenceDate,
      ) ?? null
    );
  }

  /** Escrita em lote: uma única gravação, usada pela engine de recorrências. */
  async createMany(inputs: NewTransaction[]): Promise<Transaction[]> {
    if (inputs.length === 0) return [];

    const items = this.readAll();
    const now = nowTimestamp();
    const created = inputs.map((input) => ({
      ...input,
      id: newId(),
      createdAt: now,
      updatedAt: now,
    }));

    this.writeAll([...items, ...created]);
    return created;
  }
}

class LocalCategoryRepository
  extends LocalStorageRepository<Category>
  implements CategoryRepository
{
  constructor(private readonly db: LocalKashDatabase) {
    super(STORAGE_KEYS.categories, 'Categoria', false);
  }

  async listActive(): Promise<Category[]> {
    return this.readAll().filter((c) => !c.archived);
  }

  async archive(id: string): Promise<Category> {
    return this.update(id, { archived: true } as Partial<Category>);
  }

  async unarchive(id: string): Promise<Category> {
    return this.update(id, { archived: false } as Partial<Category>);
  }

  /**
   * Exclusão definitiva só quando não há nenhum dependente e a categoria não é
   * padrão. Com histórico, o caminho correto é `archive` (FR-027).
   */
  override async remove(id: string): Promise<void> {
    const category = await this.getById(id);
    if (!category) return;

    if (category.isDefault) {
      throw new IntegrityError(
        'Categorias padrão não podem ser excluídas. Arquive-a para escondê-la dos formulários.',
      );
    }

    const dependents = this.db.countCategoryDependents(id);
    if (dependents > 0) {
      throw new IntegrityError(
        `Esta categoria está em uso por ${dependents} registro(s). Arquive-a para preservar o histórico.`,
      );
    }

    await super.remove(id);
  }
}

class LocalAccountRepository extends LocalStorageRepository<Account> implements AccountRepository {
  constructor(private readonly db: LocalKashDatabase) {
    super(STORAGE_KEYS.accounts, 'Conta', false);
  }

  async listActive(): Promise<Account[]> {
    return this.readAll().filter((a) => !a.archived);
  }

  async archive(id: string): Promise<Account> {
    return this.update(id, { archived: true } as Partial<Account>);
  }

  async unarchive(id: string): Promise<Account> {
    return this.update(id, { archived: false } as Partial<Account>);
  }

  override async remove(id: string): Promise<void> {
    const account = await this.getById(id);
    if (!account) return;

    if (account.isDefault) {
      throw new IntegrityError(
        'Contas padrão não podem ser excluídas. Arquive-a para escondê-la dos formulários.',
      );
    }

    const dependents = this.db.countAccountDependents(id);
    if (dependents > 0) {
      throw new IntegrityError(
        `Esta conta está em uso por ${dependents} registro(s). Arquive-a para preservar o histórico.`,
      );
    }

    await super.remove(id);
  }
}

class LocalBudgetRepository extends LocalStorageRepository<Budget> implements BudgetRepository {
  constructor() {
    super(STORAGE_KEYS.budgets, 'Orçamento');
  }

  async getByCategory(categoryId: string): Promise<Budget | null> {
    return this.readAll().find((b) => b.categoryId === categoryId) ?? null;
  }

  /** FR-017: redefinir substitui o limite anterior em vez de criar um segundo. */
  async upsertForCategory(
    categoryId: string,
    limitCents: number,
    startMonth: IsoMonth,
  ): Promise<Budget> {
    const existing = await this.getByCategory(categoryId);
    if (existing) {
      return this.update(existing.id, { limitCents, startMonth } as Partial<Budget>);
    }
    return this.create({ categoryId, limitCents, startMonth });
  }
}

class LocalRecurrenceRepository
  extends LocalStorageRepository<Recurrence>
  implements RecurrenceRepository
{
  constructor() {
    super(STORAGE_KEYS.recurrences, 'Recorrência');
  }

  async listActive(): Promise<Recurrence[]> {
    return this.readAll().filter((r) => r.status === 'active');
  }

  async markGenerated(id: string, lastGeneratedDate: IsoDate): Promise<Recurrence> {
    return this.update(id, { lastGeneratedDate } as Partial<Recurrence>);
  }
}

class LocalKashDatabase implements KashDatabase {
  readonly transactions: LocalTransactionRepository;
  readonly categories: LocalCategoryRepository;
  readonly accounts: LocalAccountRepository;
  readonly budgets: LocalBudgetRepository;
  readonly recurrences: LocalRecurrenceRepository;

  constructor() {
    this.transactions = new LocalTransactionRepository();
    this.categories = new LocalCategoryRepository(this);
    this.accounts = new LocalAccountRepository(this);
    this.budgets = new LocalBudgetRepository();
    this.recurrences = new LocalRecurrenceRepository();
  }

  isAvailable(): boolean {
    return isStorageAvailable();
  }

  /** Leitura síncrona e crua de uma coleção, sem passar pelo repositório. */
  private readCollection(key: string): Array<Record<string, unknown>> {
    try {
      const value = window.localStorage.getItem(key);
      const parsed: unknown = value ? JSON.parse(value) : [];
      return Array.isArray(parsed) ? (parsed as Array<Record<string, unknown>>) : [];
    } catch {
      return [];
    }
  }

  /** Quantos registros dependem de uma categoria — usado pelo IntegrityError. */
  countCategoryDependents(categoryId: string): number {
    return (
      this.readCollection(STORAGE_KEYS.transactions).filter((t) => t.categoryId === categoryId)
        .length +
      this.readCollection(STORAGE_KEYS.budgets).filter((b) => b.categoryId === categoryId).length +
      this.readCollection(STORAGE_KEYS.recurrences).filter((r) => r.categoryId === categoryId)
        .length
    );
  }

  countAccountDependents(accountId: string): number {
    return (
      this.readCollection(STORAGE_KEYS.transactions).filter((t) => t.accountId === accountId)
        .length +
      this.readCollection(STORAGE_KEYS.recurrences).filter((r) => r.accountId === accountId).length
    );
  }

  /**
   * Semeia uma base vazia e, numa base já criada, acrescenta só as categorias
   * e contas padrão que passaram a existir depois (comparando por nome). Assim
   * quem já usava o app ganha uma categoria nova (ex.: "Contas de casa") sem
   * limpar dados nem cadastrar na mão. Nada existente é tocado.
   *
   * Ler e escrever **sem nenhum await no meio** é o que garante a
   * idempotência. Com `await` entre a leitura e a gravação, o StrictMode do
   * React (que executa o efeito duas vezes em desenvolvimento) fazia as duas
   * execuções verem a base vazia e semear — produzindo 16 categorias.
   * Como o JavaScript é single-thread, o bloco síncrono abaixo é atômico.
   */
  async seedIfEmpty(): Promise<void> {
    const categories = this.readCollection(STORAGE_KEYS.categories);
    if (categories.length === 0) {
      this.categories.replaceAll(
        DEFAULT_CATEGORIES.map((category) => ({ ...category, id: newId() })),
      );
    } else {
      const known = new Set(categories.map((c) => c.name as string));
      const missing = DEFAULT_CATEGORIES.filter((c) => !known.has(c.name));
      if (missing.length > 0) {
        this.categories.replaceAll([
          ...(categories as unknown as Category[]),
          ...missing.map((category) => ({ ...category, id: newId() })),
        ]);
      }
    }

    const accounts = this.readCollection(STORAGE_KEYS.accounts);
    if (accounts.length === 0) {
      this.accounts.replaceAll(DEFAULT_ACCOUNTS.map((account) => ({ ...account, id: newId() })));
    }

    window.localStorage.setItem(STORAGE_KEYS.schemaVersion, String(SCHEMA_VERSION));
  }

  async exportAll(): Promise<KashSnapshot> {
    return {
      schemaVersion: SCHEMA_VERSION,
      transactions: await this.transactions.list(),
      categories: await this.categories.list(),
      accounts: await this.accounts.list(),
      budgets: await this.budgets.list(),
      recurrences: await this.recurrences.list(),
      exportedAt: nowTimestamp(),
    };
  }

  /**
   * Valida integralmente antes de tocar na base. Um arquivo inválido nunca
   * substitui os dados existentes (FR-030).
   */
  async importAll(snapshot: unknown): Promise<ImportResult> {
    const empty: ImportResult['counts'] = {
      transactions: 0,
      categories: 0,
      accounts: 0,
      budgets: 0,
      recurrences: 0,
    };
    const errors: string[] = [];

    if (typeof snapshot !== 'object' || snapshot === null) {
      return { ok: false, errors: ['Arquivo inválido: conteúdo não reconhecido.'], counts: empty };
    }

    const candidate = snapshot as Partial<KashSnapshot>;

    if (typeof candidate.schemaVersion !== 'number') {
      errors.push('Arquivo inválido: versão do formato ausente.');
    } else if (candidate.schemaVersion > SCHEMA_VERSION) {
      errors.push(
        `Arquivo gerado por uma versão mais nova do Kash (formato ${candidate.schemaVersion}). Atualize o app para importá-lo.`,
      );
    }

    const collections = [
      'transactions',
      'categories',
      'accounts',
      'budgets',
      'recurrences',
    ] as const;

    for (const name of collections) {
      if (!Array.isArray(candidate[name])) {
        errors.push(`Arquivo inválido: a coleção "${name}" está ausente ou corrompida.`);
      }
    }

    if (errors.length > 0) {
      return { ok: false, errors, counts: empty };
    }

    // Só a partir daqui a base atual é tocada.
    this.transactions.replaceAll(candidate.transactions!);
    this.categories.replaceAll(candidate.categories!);
    this.accounts.replaceAll(candidate.accounts!);
    this.budgets.replaceAll(candidate.budgets!);
    this.recurrences.replaceAll(candidate.recurrences!);
    window.localStorage.setItem(STORAGE_KEYS.schemaVersion, String(SCHEMA_VERSION));

    return {
      ok: true,
      errors: [],
      counts: {
        transactions: candidate.transactions!.length,
        categories: candidate.categories!.length,
        accounts: candidate.accounts!.length,
        budgets: candidate.budgets!.length,
        recurrences: candidate.recurrences!.length,
      },
    };
  }
}

export { LocalKashDatabase, NotFoundError };

/** Instância única usada pelo app. Os testes criam a sua própria. */
export const database: KashDatabase = new LocalKashDatabase();
