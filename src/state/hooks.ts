import { useCallback, useContext } from 'react';
import { KashContext, type KashContextValue } from './KashProvider';
import { formatBRL, formatBRLSigned } from '@/lib/money';
import type {
  Account,
  Budget,
  Category,
  IsoMonth,
  NewRecurrence,
  NewTransaction,
  Recurrence,
  Transaction,
  TransactionType,
} from '@/domain/types';

export function useKash(): KashContextValue {
  const context = useContext(KashContext);
  if (!context) {
    throw new Error('useKash deve ser usado dentro de <KashProvider>');
  }
  return context;
}

/**
 * Cada mutação escreve no repositório e recarrega o estado, mantendo memória e
 * persistência sincronizadas. É barato no volume-alvo do SC-005.
 */
export function useTransactions() {
  const { transactions, db, refresh } = useKash();

  const create = useCallback(
    async (input: NewTransaction): Promise<Transaction> => {
      const created = await db.transactions.create(input);
      await refresh();
      return created;
    },
    [db, refresh],
  );

  const update = useCallback(
    async (id: string, patch: Partial<Transaction>): Promise<Transaction> => {
      const updated = await db.transactions.update(id, patch);
      await refresh();
      return updated;
    },
    [db, refresh],
  );

  const remove = useCallback(
    async (id: string): Promise<void> => {
      await db.transactions.remove(id);
      await refresh();
    },
    [db, refresh],
  );

  return { transactions, create, update, remove };
}

export function useCategories() {
  const { categories, db, refresh } = useKash();

  const active = categories.filter((c) => !c.archived);

  const byId = useCallback(
    (id: string): Category | undefined => categories.find((c) => c.id === id),
    [categories],
  );

  const create = useCallback(
    async (input: Omit<Category, 'id'>) => {
      const created = await db.categories.create(input);
      await refresh();
      return created;
    },
    [db, refresh],
  );

  const update = useCallback(
    async (id: string, patch: Partial<Category>) => {
      const updated = await db.categories.update(id, patch);
      await refresh();
      return updated;
    },
    [db, refresh],
  );

  const archive = useCallback(
    async (id: string) => {
      await db.categories.archive(id);
      await refresh();
    },
    [db, refresh],
  );

  const unarchive = useCallback(
    async (id: string) => {
      await db.categories.unarchive(id);
      await refresh();
    },
    [db, refresh],
  );

  const remove = useCallback(
    async (id: string) => {
      await db.categories.remove(id);
      await refresh();
    },
    [db, refresh],
  );

  return { categories, active, byId, create, update, archive, unarchive, remove };
}

export function useAccounts() {
  const { accounts, db, refresh } = useKash();

  const active = accounts.filter((a) => !a.archived);

  const byId = useCallback(
    (id: string): Account | undefined => accounts.find((a) => a.id === id),
    [accounts],
  );

  const create = useCallback(
    async (input: Omit<Account, 'id'>) => {
      const created = await db.accounts.create(input);
      await refresh();
      return created;
    },
    [db, refresh],
  );

  const update = useCallback(
    async (id: string, patch: Partial<Account>) => {
      const updated = await db.accounts.update(id, patch);
      await refresh();
      return updated;
    },
    [db, refresh],
  );

  const archive = useCallback(
    async (id: string) => {
      await db.accounts.archive(id);
      await refresh();
    },
    [db, refresh],
  );

  const unarchive = useCallback(
    async (id: string) => {
      await db.accounts.unarchive(id);
      await refresh();
    },
    [db, refresh],
  );

  const remove = useCallback(
    async (id: string) => {
      await db.accounts.remove(id);
      await refresh();
    },
    [db, refresh],
  );

  return { accounts, active, byId, create, update, archive, unarchive, remove };
}

export function useBudgets() {
  const { budgets, db, refresh } = useKash();

  const byCategory = useCallback(
    (categoryId: string): Budget | undefined => budgets.find((b) => b.categoryId === categoryId),
    [budgets],
  );

  /** FR-017: sempre upsert, nunca um segundo orçamento para a mesma categoria. */
  const upsert = useCallback(
    async (categoryId: string, limitCents: number, startMonth: IsoMonth) => {
      const saved = await db.budgets.upsertForCategory(categoryId, limitCents, startMonth);
      await refresh();
      return saved;
    },
    [db, refresh],
  );

  const remove = useCallback(
    async (id: string) => {
      await db.budgets.remove(id);
      await refresh();
    },
    [db, refresh],
  );

  return { budgets, byCategory, upsert, remove };
}

export function useRecurrences() {
  const { recurrences, db, refresh } = useKash();

  const create = useCallback(
    async (input: NewRecurrence) => {
      const created = await db.recurrences.create(input);
      await refresh();
      return created;
    },
    [db, refresh],
  );

  const update = useCallback(
    async (id: string, patch: Partial<Recurrence>) => {
      const updated = await db.recurrences.update(id, patch);
      await refresh();
      return updated;
    },
    [db, refresh],
  );

  const remove = useCallback(
    async (id: string) => {
      await db.recurrences.remove(id);
      await refresh();
    },
    [db, refresh],
  );

  /** Pausar não remove os lançamentos já criados (FR-023). */
  const setStatus = useCallback(
    async (id: string, status: Recurrence['status']) => {
      await db.recurrences.update(id, { status });
      await refresh();
    },
    [db, refresh],
  );

  return { recurrences, create, update, remove, setStatus };
}

/**
 * Formatação monetária que respeita a preferência de ocultar valores.
 *
 * O mascaramento acontece na borda de apresentação: o dado continua íntegro
 * em memória, só a exibição muda.
 */
export function useMoney() {
  const { hideAmounts, toggleHideAmounts } = useKash();

  const format = useCallback(
    (cents: number): string => (hideAmounts ? '•••••' : formatBRL(cents)),
    [hideAmounts],
  );

  const formatSigned = useCallback(
    (cents: number, type: TransactionType): string =>
      hideAmounts ? '•••••' : formatBRLSigned(cents, type),
    [hideAmounts],
  );

  return { format, formatSigned, hidden: hideAmounts, toggle: toggleHideAmounts };
}
