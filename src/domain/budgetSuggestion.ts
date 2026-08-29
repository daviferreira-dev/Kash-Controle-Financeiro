import type { Budget, Category, IsoDate, IsoMonth, Transaction } from './types';
import { daysInMonth, monthOf, partsOf } from '@/lib/date';

/**
 * Sugestão de orçamento a partir do gasto real.
 *
 * Um teto inventado não segura ninguém: ou é folgado demais e não avisa nada,
 * ou é apertado demais e vive estourado. Aqui o limite sai do que a pessoa
 * gasta de fato, medido nos meses já fechados do histórico importado.
 */
export interface BudgetSuggestion {
  categoryId: string;
  /** true quando o mês corrente entrou projetado, por falta de meses fechados. */
  usaProjecao: boolean;
  categoryName: string;
  color: string;
  /** Limite proposto, em centavos, já arredondado. */
  limitCents: number;
  /** Média mensal observada. */
  averageCents: number;
  minCents: number;
  maxCents: number;
  /** Meses completos considerados, do mais antigo ao mais recente. */
  months: IsoMonth[];
  /** Total gasto em cada mês, na mesma ordem de `months`. */
  perMonthCents: number[];
  /** true quando o gasto varia pouco — o teto tende a ser confiável. */
  stable: boolean;
}

export interface SuggestBudgetsOptions {
  transactions: Transaction[];
  categories: Category[];
  /** Categorias já orçadas não são sugeridas de novo. */
  budgets: Budget[];
  /** Mês corrente: fica de fora por estar incompleto. */
  currentMonth: IsoMonth;
  /** Mínimo de meses de dados para arriscar uma sugestão. Padrão 1. */
  minMonths?: number;
  /** Hoje — permite projetar o mês corrente quando não há histórico fechado. */
  today?: IsoDate;
}

/** Arredonda para cima em passos legíveis, conforme a grandeza do valor. */
export function roundLimit(cents: number): number {
  if (cents <= 0) return 0;
  const step = cents < 10_000 ? 1_000 : cents < 100_000 ? 5_000 : 10_000;
  return Math.ceil(cents / step) * step;
}

/** Fração do mês já decorrida — abaixo disso, projetar seria chute. */
const PROJECAO_MINIMA = 0.5;

export function suggestBudgets({
  transactions,
  categories,
  budgets,
  currentMonth,
  minMonths = 1,
  today,
}: SuggestBudgetsOptions): BudgetSuggestion[] {
  const alreadyBudgeted = new Set(budgets.map((b) => b.categoryId));

  // Gasto por categoria, por mês.
  const byCategory = new Map<string, Map<IsoMonth, number>>();

  for (const transaction of transactions) {
    if (transaction.type !== 'expense') continue;
    // Meses futuros nunca entram.
    if (monthOf(transaction.date) > currentMonth) continue;

    const month = monthOf(transaction.date);
    if (!byCategory.has(transaction.categoryId)) byCategory.set(transaction.categoryId, new Map());
    const months = byCategory.get(transaction.categoryId)!;
    months.set(month, (months.get(month) ?? 0) + transaction.amountCents);
  }

  /**
   * Quanto do mês corrente já passou. Com meses fechados suficientes o mês em
   * curso é descartado, por ser parcial; sem eles, projetá-lo é melhor do que
   * não sugerir nada — desde que metade do mês já tenha corrido.
   */
  const decorrido = (() => {
    if (!today || monthOf(today) !== currentMonth) return 0;
    const total = daysInMonth(Number(currentMonth.slice(0, 4)), Number(currentMonth.slice(5, 7)));
    return partsOf(today).day / total;
  })();

  const podeProjetar = decorrido >= PROJECAO_MINIMA;

  const suggestions: BudgetSuggestion[] = [];

  for (const [categoryId, monthTotals] of byCategory) {
    if (alreadyBudgeted.has(categoryId)) continue;

    const category = categories.find((c) => c.id === categoryId);
    if (!category || category.archived) continue;

    const fechados = [...monthTotals.keys()].filter((m) => m < currentMonth).sort();

    let months: IsoMonth[];
    let perMonthCents: number[];
    let usaProjecao = false;

    if (fechados.length >= minMonths) {
      months = fechados;
      perMonthCents = months.map((m) => monthTotals.get(m)!);
    } else if (podeProjetar && monthTotals.has(currentMonth)) {
      // Projeta o parcial para o mês inteiro, mantendo o ritmo observado.
      months = [currentMonth];
      perMonthCents = [Math.round(monthTotals.get(currentMonth)! / decorrido)];
      usaProjecao = true;
    } else {
      continue;
    }

    const total = perMonthCents.reduce((sum, v) => sum + v, 0);
    const averageCents = Math.round(total / perMonthCents.length);
    const minCents = Math.min(...perMonthCents);
    const maxCents = Math.max(...perMonthCents);

    // Um teto na média estoura metade das vezes. Uma folga sobre o pior mês
    // observado é um limite que a pessoa consegue cumprir.
    const stable = maxCents <= minCents * 1.3;
    const base = stable ? averageCents : (averageCents + maxCents) / 2;

    suggestions.push({
      categoryId,
      usaProjecao,
      categoryName: category.name,
      color: category.color,
      limitCents: roundLimit(base),
      averageCents,
      minCents,
      maxCents,
      months,
      perMonthCents,
      stable,
    });
  }

  // Onde há mais dinheiro em jogo, o orçamento importa mais.
  return suggestions.sort((a, b) => b.averageCents - a.averageCents);
}
