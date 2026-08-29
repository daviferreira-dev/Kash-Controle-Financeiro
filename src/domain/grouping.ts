import type { IsoDate, Transaction } from './types';
import { formatBR, today } from '@/lib/date';

/**
 * Agrupamento da lista por dia.
 *
 * Numa lista corrida, a data se repete linha após linha e some no meio do
 * ruído. Extrato de banco agrupa por dia justamente porque a pergunta é
 * "o que aconteceu neste dia" — e o subtotal responde "quanto sobrou dele".
 */
export interface DayGroup {
  date: IsoDate;
  /** "Hoje", "Ontem" ou a data em DD/MM/AAAA. */
  label: string;
  transactions: Transaction[];
  incomeCents: number;
  expenseCents: number;
  /** Entradas menos saídas do dia. */
  netCents: number;
}

/** Rótulo relativo para os dias recentes, absoluto para o resto. */
export function dayLabel(date: IsoDate, reference: IsoDate = today()): string {
  if (date === reference) return 'Hoje';

  // Ontem: um dia civil antes da referência.
  const [ano, mes, dia] = reference.split('-').map(Number);
  const anterior = new Date(Date.UTC(ano!, mes! - 1, dia! - 1));
  const ontem = `${anterior.getUTCFullYear()}-${String(anterior.getUTCMonth() + 1).padStart(2, '0')}-${String(anterior.getUTCDate()).padStart(2, '0')}`;
  if (date === ontem) return 'Ontem';

  return formatBR(date);
}

/**
 * Agrupa as transações por data, preservando a ordem recebida dentro do dia.
 * A lista já chega ordenada por data decrescente, então os grupos saem na
 * mesma ordem.
 */
export function groupByDay(transactions: Transaction[], reference?: IsoDate): DayGroup[] {
  const groups = new Map<IsoDate, Transaction[]>();

  for (const transaction of transactions) {
    if (!groups.has(transaction.date)) groups.set(transaction.date, []);
    groups.get(transaction.date)!.push(transaction);
  }

  return [...groups.entries()].map(([date, items]) => {
    let incomeCents = 0;
    let expenseCents = 0;
    for (const t of items) {
      if (t.type === 'income') incomeCents += t.amountCents;
      else expenseCents += t.amountCents;
    }

    return {
      date,
      label: dayLabel(date, reference),
      transactions: items,
      incomeCents,
      expenseCents,
      netCents: incomeCents - expenseCents,
    };
  });
}
