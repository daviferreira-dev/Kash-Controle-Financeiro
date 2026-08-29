import { describe, it, expect } from 'vitest';
import { dayLabel, groupByDay } from '@/domain/grouping';
import type { Transaction } from '@/domain/types';

let seq = 0;
function tx(date: string, amountCents: number, over: Partial<Transaction> = {}): Transaction {
  seq += 1;
  return {
    id: `t-${seq}`,
    type: 'expense',
    amountCents,
    description: `Lançamento ${seq}`,
    date,
    categoryId: 'c-1',
    accountId: 'a-1',
    notes: null,
    source: 'manual',
    sourceRecurrenceId: null,
    occurrenceDate: null,
    createdAt: '2026-08-01T00:00:00.000Z',
    updatedAt: '2026-08-01T00:00:00.000Z',
    ...over,
  };
}

describe('dayLabel', () => {
  it('usa rótulos relativos para hoje e ontem', () => {
    expect(dayLabel('2026-08-29', '2026-08-29')).toBe('Hoje');
    expect(dayLabel('2026-08-28', '2026-08-29')).toBe('Ontem');
  });

  it('atravessa a virada de mês', () => {
    expect(dayLabel('2026-07-31', '2026-08-01')).toBe('Ontem');
  });

  it('atravessa a virada de ano', () => {
    expect(dayLabel('2025-12-31', '2026-01-01')).toBe('Ontem');
  });

  it('usa a data cheia para os demais dias', () => {
    expect(dayLabel('2026-08-20', '2026-08-29')).toBe('20/08/2026');
  });
});

describe('groupByDay', () => {
  it('junta os lançamentos do mesmo dia', () => {
    const grupos = groupByDay(
      [tx('2026-08-28', 20000), tx('2026-08-28', 5000), tx('2026-08-25', 1350)],
      '2026-08-29',
    );

    expect(grupos).toHaveLength(2);
    expect(grupos[0]!.transactions).toHaveLength(2);
    expect(grupos[1]!.transactions).toHaveLength(1);
  });

  it('calcula entradas, saídas e o líquido de cada dia', () => {
    const grupos = groupByDay(
      [
        tx('2026-08-28', 162100, { type: 'income' }),
        tx('2026-08-28', 90000, { type: 'income' }),
        tx('2026-08-28', 2000),
      ],
      '2026-08-29',
    );

    expect(grupos[0]).toMatchObject({
      incomeCents: 252100,
      expenseCents: 2000,
      netCents: 250100,
    });
  });

  it('preserva a ordem recebida — a lista já chega ordenada', () => {
    const grupos = groupByDay(
      [tx('2026-08-28', 100), tx('2026-08-25', 200), tx('2026-08-20', 300)],
      '2026-08-29',
    );

    expect(grupos.map((g) => g.date)).toEqual(['2026-08-28', '2026-08-25', '2026-08-20']);
  });

  it('rotula os grupos', () => {
    const grupos = groupByDay([tx('2026-08-29', 100), tx('2026-08-28', 100)], '2026-08-29');
    expect(grupos.map((g) => g.label)).toEqual(['Hoje', 'Ontem']);
  });

  it('devolve vazio para lista vazia', () => {
    expect(groupByDay([], '2026-08-29')).toEqual([]);
  });

  it('um dia só de saídas tem líquido negativo', () => {
    const grupos = groupByDay([tx('2026-08-20', 5000)], '2026-08-29');
    expect(grupos[0]!.netCents).toBe(-5000);
  });
});
