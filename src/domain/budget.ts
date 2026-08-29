import type { Budget, BudgetStatus, Category, IsoMonth, Transaction } from './types';
import { isInMonth } from '@/lib/date';

export interface BudgetProgress {
  budget: Budget;
  category: Category | undefined;
  spentCents: number;
  /** Negativo quando estourado. */
  remainingCents: number;
  /** Pode passar de 100. */
  percentUsed: number;
  status: BudgetStatus;
  /** Rótulo textual, obrigatório na UI além da cor (FR-016, SC-007). */
  statusLabel: string;
}

/** Fronteiras das faixas de alerta, conforme o data-model. */
export const WARNING_THRESHOLD = 80;
export const EXCEEDED_THRESHOLD = 100;

const STATUS_LABELS: Record<BudgetStatus, string> = {
  ok: 'Dentro do limite',
  warning: 'Em atenção',
  exceeded: 'Estourado',
};

export function budgetStatusOf(percentUsed: number): BudgetStatus {
  if (percentUsed > EXCEEDED_THRESHOLD) return 'exceeded';
  if (percentUsed >= WARNING_THRESHOLD) return 'warning';
  return 'ok';
}

/**
 * Consumo de um orçamento no mês. Considera apenas despesas daquele mês e
 * daquela categoria (FR-018).
 */
export function computeBudgetProgress(
  budget: Budget,
  category: Category | undefined,
  transactions: Transaction[],
  month: IsoMonth,
): BudgetProgress {
  const spentCents = transactions
    .filter(
      (t) => t.type === 'expense' && t.categoryId === budget.categoryId && isInMonth(t.date, month),
    )
    .reduce((sum, t) => sum + t.amountCents, 0);

  const percentUsed = budget.limitCents === 0 ? 0 : (spentCents / budget.limitCents) * 100;
  const status = budgetStatusOf(percentUsed);

  return {
    budget,
    category,
    spentCents,
    remainingCents: budget.limitCents - spentCents,
    percentUsed,
    status,
    statusLabel: STATUS_LABELS[status],
  };
}

/** Orçamento só vale a partir do mês em que foi definido. */
export function isBudgetActiveIn(budget: Budget, month: IsoMonth): boolean {
  return month >= budget.startMonth;
}
