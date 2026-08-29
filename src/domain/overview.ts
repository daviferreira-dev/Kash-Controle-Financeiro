import type { Account, Category, IsoDate, IsoMonth, Transaction } from './types';
import { isInMonth } from '@/lib/date';

export interface CategoryBreakdownItem {
  categoryId: string;
  categoryName: string;
  color: string;
  totalCents: number;
  /** Participação nas despesas do mês, de 0 a 100. */
  percent: number;
}

export interface MonthOverview {
  month: IsoMonth;
  incomeCents: number;
  expenseCents: number;
  /** Receitas menos despesas do mês (FR-008). */
  balanceCents: number;
  /** Saldos iniciais + tudo lançado até hoje (FR-009). */
  accumulatedBalanceCents: number;
  breakdown: CategoryBreakdownItem[];
  recent: Transaction[];
  isEmpty: boolean;
}

const RECENT_LIMIT = 5;

/**
 * Agregações do Overview. Pura e sem I/O: recebe as coleções e o relógio.
 *
 * Toda a soma é feita em centavos inteiros — é o que garante que o saldo
 * exibido bata exatamente com a soma dos lançamentos (decisão R-001).
 */
export function computeMonthOverview(
  transactions: Transaction[],
  categories: Category[],
  accounts: Account[],
  month: IsoMonth,
  today: IsoDate,
): MonthOverview {
  const ofMonth = transactions.filter((t) => isInMonth(t.date, month));

  let incomeCents = 0;
  let expenseCents = 0;
  const perCategory = new Map<string, number>();

  for (const transaction of ofMonth) {
    if (transaction.type === 'income') {
      incomeCents += transaction.amountCents;
    } else {
      expenseCents += transaction.amountCents;
      perCategory.set(
        transaction.categoryId,
        (perCategory.get(transaction.categoryId) ?? 0) + transaction.amountCents,
      );
    }
  }

  // Saldo acumulado ignora lançamentos futuros: é "quanto eu tenho hoje".
  // Contas arquivadas continuam contando — o dinheiro delas ainda é seu.
  const accumulatedBalanceCents =
    accounts.reduce((sum, account) => sum + account.initialBalanceCents, 0) +
    transactions
      .filter((t) => t.date <= today)
      .reduce((sum, t) => sum + (t.type === 'income' ? t.amountCents : -t.amountCents), 0);

  const breakdown: CategoryBreakdownItem[] = [...perCategory.entries()]
    .map(([categoryId, totalCents]) => {
      const category = categories.find((c) => c.id === categoryId);
      return {
        categoryId,
        categoryName: category?.name ?? 'Sem categoria',
        color: category?.color ?? '#8a726d',
        totalCents,
        percent: expenseCents === 0 ? 0 : (totalCents / expenseCents) * 100,
      };
    })
    .sort((a, b) => b.totalCents - a.totalCents);

  return {
    month,
    incomeCents,
    expenseCents,
    balanceCents: incomeCents - expenseCents,
    accumulatedBalanceCents,
    breakdown,
    recent: ofMonth.slice(0, RECENT_LIMIT),
    isEmpty: ofMonth.length === 0,
  };
}
