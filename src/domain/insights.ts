import type { Category, IsoDate, IsoMonth, Transaction } from './types';
import { addMonths, daysInMonth, formatMonthLabel, isInMonth, monthOf, partsOf } from '@/lib/date';

/**
 * Leituras do mês: os números que o Overview já mostra, transformados em
 * frases acionáveis.
 *
 * A regra que guia tudo aqui: só afirmar o que os dados sustentam. Nenhum
 * insight aparece sem base — se não há mês anterior para comparar, não há
 * comparação; se a categoria não domina, não há alerta de concentração.
 */

export type InsightTone = 'positive' | 'neutral' | 'attention';

export interface Insight {
  id: string;
  tone: InsightTone;
  title: string;
  description: string;
  /** Valor em centavos, quando o insight tem um número principal. */
  amountCents?: number;
  /** Percentual, quando faz sentido exibi-lo separado. */
  percent?: number;
}

export interface MonthPoint {
  month: IsoMonth;
  label: string;
  incomeCents: number;
  expenseCents: number;
  balanceCents: number;
}

/** Série dos últimos `count` meses terminando em `month`, para o gráfico. */
export function monthlySeries(
  transactions: Transaction[],
  month: IsoMonth,
  count = 6,
): MonthPoint[] {
  const points: MonthPoint[] = [];

  for (let i = count - 1; i >= 0; i--) {
    const m = addMonths(month, -i);
    let incomeCents = 0;
    let expenseCents = 0;

    for (const t of transactions) {
      if (!isInMonth(t.date, m)) continue;
      if (t.type === 'income') incomeCents += t.amountCents;
      else expenseCents += t.amountCents;
    }

    points.push({
      month: m,
      label: formatMonthLabel(m).slice(0, 3),
      incomeCents,
      expenseCents,
      balanceCents: incomeCents - expenseCents,
    });
  }

  return points;
}

export interface WeekdayPoint {
  /** 0 = domingo. */
  weekday: number;
  label: string;
  totalCents: number;
  count: number;
}

const WEEKDAY_LABELS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

/** Em que dias da semana o dinheiro sai — revela padrões de consumo. */
export function spendingByWeekday(transactions: Transaction[], month: IsoMonth): WeekdayPoint[] {
  const totals = WEEKDAY_LABELS.map((label, weekday) => ({
    weekday,
    label,
    totalCents: 0,
    count: 0,
  }));

  for (const t of transactions) {
    if (t.type !== 'expense' || !isInMonth(t.date, month)) continue;
    const { year, month: m, day } = partsOf(t.date);
    const weekday = new Date(Date.UTC(year, m - 1, day)).getUTCDay();
    totals[weekday]!.totalCents += t.amountCents;
    totals[weekday]!.count += 1;
  }

  return totals;
}

export interface InsightsInput {
  transactions: Transaction[];
  categories: Category[];
  month: IsoMonth;
  today: IsoDate;
}

function sum(items: Transaction[]): number {
  return items.reduce((total, t) => total + t.amountCents, 0);
}

/** Quantos dias do mês já correram — o mês corrente é parcial. */
function elapsedDays(month: IsoMonth, today: IsoDate): number {
  const total = daysInMonth(Number(month.slice(0, 4)), Number(month.slice(5, 7)));
  if (monthOf(today) !== month) return total;
  return Math.min(partsOf(today).day, total);
}

export function computeInsights({
  transactions,
  categories,
  month,
  today,
}: InsightsInput): Insight[] {
  const ofMonth = transactions.filter((t) => isInMonth(t.date, month));
  const expenses = ofMonth.filter((t) => t.type === 'expense');
  const incomes = ofMonth.filter((t) => t.type === 'income');

  if (ofMonth.length === 0) return [];

  const expenseCents = sum(expenses);
  const incomeCents = sum(incomes);
  const insights: Insight[] = [];

  const nameOf = (id: string) => categories.find((c) => c.id === id)?.name ?? 'Sem categoria';

  // --- Taxa de poupança -----------------------------------------------------
  if (incomeCents > 0) {
    const savedCents = incomeCents - expenseCents;
    const rate = (savedCents / incomeCents) * 100;

    if (savedCents >= 0) {
      insights.push({
        id: 'savings-rate',
        tone: rate >= 20 ? 'positive' : 'neutral',
        title: `Você guardou ${rate.toFixed(0)}% do que recebeu`,
        description:
          rate >= 20
            ? 'Acima dos 20% que costumam ser recomendados como meta de poupança.'
            : 'Guardar 20% da renda é uma meta comum — dá para mirar nisso no próximo mês.',
        amountCents: savedCents,
        percent: rate,
      });
    } else {
      insights.push({
        id: 'savings-rate',
        tone: 'attention',
        title: 'Você gastou mais do que recebeu',
        description: `As saídas superaram as entradas neste mês. A diferença saiu do seu saldo acumulado.`,
        amountCents: Math.abs(savedCents),
      });
    }
  }

  // --- Concentração por categoria ------------------------------------------
  if (expenseCents > 0) {
    const perCategory = new Map<string, number>();
    for (const t of expenses) {
      perCategory.set(t.categoryId, (perCategory.get(t.categoryId) ?? 0) + t.amountCents);
    }

    const [topId, topCents] = [...perCategory.entries()].sort((a, b) => b[1] - a[1])[0]!;
    const share = (topCents / expenseCents) * 100;

    insights.push({
      id: 'top-category',
      // Metade do orçamento numa categoria só é concentração que merece atenção.
      tone: share >= 50 ? 'attention' : 'neutral',
      title: `${nameOf(topId)} concentra ${share.toFixed(0)}% dos seus gastos`,
      description:
        share >= 50
          ? 'Uma categoria sozinha leva metade do que você gasta. Se quiser cortar despesa, é aqui que o corte pesa mais.'
          : 'É sua maior categoria de gasto no mês — o melhor lugar para procurar economia.',
      amountCents: topCents,
      percent: share,
    });
  }

  // --- Comparação com o mês anterior ---------------------------------------
  const previous = addMonths(month, -1);
  const previousExpenses = transactions.filter(
    (t) => t.type === 'expense' && isInMonth(t.date, previous),
  );

  if (previousExpenses.length > 0 && expenseCents > 0) {
    const previousCents = sum(previousExpenses);
    const delta = expenseCents - previousCents;
    const percent = (delta / previousCents) * 100;

    // Variações abaixo de 10% são ruído de um mês para o outro.
    if (Math.abs(percent) >= 10) {
      insights.push({
        id: 'vs-previous',
        tone: delta > 0 ? 'attention' : 'positive',
        title:
          delta > 0
            ? `Você gastou ${percent.toFixed(0)}% a mais que em ${formatMonthLabel(previous)}`
            : `Você gastou ${Math.abs(percent).toFixed(0)}% a menos que em ${formatMonthLabel(previous)}`,
        description:
          delta > 0
            ? 'Vale olhar quais categorias cresceram para entender de onde veio a diferença.'
            : 'Boa — o mês fechou mais leve que o anterior.',
        amountCents: Math.abs(delta),
        percent,
      });
    }
  }

  // --- Categoria que mais cresceu ------------------------------------------
  if (previousExpenses.length > 0 && expenses.length > 0) {
    const before = new Map<string, number>();
    for (const t of previousExpenses) {
      before.set(t.categoryId, (before.get(t.categoryId) ?? 0) + t.amountCents);
    }
    const now = new Map<string, number>();
    for (const t of expenses) {
      now.set(t.categoryId, (now.get(t.categoryId) ?? 0) + t.amountCents);
    }

    let worstId: string | null = null;
    let worstDelta = 0;
    for (const [id, cents] of now) {
      const previousCents = before.get(id) ?? 0;
      // Só compara categorias que já existiam: do zero para qualquer coisa a
      // variação percentual é infinita e não diz nada.
      if (previousCents === 0) continue;
      const delta = cents - previousCents;
      if (delta > worstDelta) {
        worstDelta = delta;
        worstId = id;
      }
    }

    if (worstId && worstDelta > 0) {
      const previousCents = before.get(worstId)!;
      const percent = (worstDelta / previousCents) * 100;
      if (percent >= 25) {
        insights.push({
          id: 'category-growth',
          tone: 'attention',
          title: `${nameOf(worstId)} subiu ${percent.toFixed(0)}% em relação ao mês passado`,
          description: 'Foi a categoria que mais cresceu. Vale conferir se foi pontual ou virou hábito.',
          amountCents: worstDelta,
          percent,
        });
      }
    }
  }

  // --- Ritmo e projeção ----------------------------------------------------
  const days = elapsedDays(month, today);
  const monthDays = daysInMonth(Number(month.slice(0, 4)), Number(month.slice(5, 7)));
  const isCurrentMonth = monthOf(today) === month;

  if (expenseCents > 0 && days > 0) {
    const perDay = Math.round(expenseCents / days);

    if (isCurrentMonth && days < monthDays) {
      const projected = perDay * monthDays;
      insights.push({
        id: 'pace',
        tone: 'neutral',
        title: `No ritmo atual, o mês fecha em torno de ${formatCentsShort(projected)}`,
        description: `Você gastou ${formatCentsShort(perDay)} por dia em média nos primeiros ${days} dias.`,
        amountCents: projected,
      });
    } else {
      insights.push({
        id: 'pace',
        tone: 'neutral',
        title: `Média de ${formatCentsShort(perDay)} por dia`,
        description: `Somando ${formatCentsShort(expenseCents)} em ${days} dias de movimento.`,
        amountCents: perDay,
      });
    }
  }

  // --- Maior gasto único ---------------------------------------------------
  if (expenses.length > 0) {
    const biggest = expenses.reduce((max, t) => (t.amountCents > max.amountCents ? t : max));
    const share = (biggest.amountCents / expenseCents) * 100;

    if (share >= 15) {
      insights.push({
        id: 'biggest-expense',
        tone: 'neutral',
        title: `Seu maior gasto foi ${formatCentsShort(biggest.amountCents)}`,
        description: `"${truncate(biggest.description, 48)}" — sozinho, ${share.toFixed(0)}% de tudo que saiu no mês.`,
        amountCents: biggest.amountCents,
        percent: share,
      });
    }
  }

  return insights;
}

function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}

/** Formato curto para caber dentro de uma frase. */
function formatCentsShort(cents: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
  }).format(cents / 100);
}
