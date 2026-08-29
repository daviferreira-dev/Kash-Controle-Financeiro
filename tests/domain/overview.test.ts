import { describe, it, expect } from 'vitest';
import { computeMonthOverview } from '@/domain/overview';
import type { Account, Category, Transaction } from '@/domain/types';

const categories: Category[] = [
  { id: 'c-alim', name: 'Alimentação', icon: 'x', color: '#a03f2d', kind: 'expense', archived: false, isDefault: true },
  { id: 'c-transp', name: 'Transporte', icon: 'x', color: '#705c1e', kind: 'expense', archived: false, isDefault: true },
  { id: 'c-outros', name: 'Outros', icon: 'x', color: '#5f5e5e', kind: 'both', archived: false, isDefault: true },
];

const accounts: Account[] = [
  { id: 'a-nu', name: 'Nubank', initialBalanceCents: 0, archived: false, isDefault: true },
  { id: 'a-old', name: 'Antiga', initialBalanceCents: 50000, archived: true, isDefault: false },
];

let seq = 0;
function tx(overrides: Partial<Transaction> = {}): Transaction {
  seq += 1;
  return {
    id: `t-${seq}`,
    type: 'expense',
    amountCents: 10000,
    description: `Lançamento ${seq}`,
    date: '2026-08-15',
    categoryId: 'c-alim',
    accountId: 'a-nu',
    notes: null,
    source: 'manual',
    sourceRecurrenceId: null,
    occurrenceDate: null,
    createdAt: `2026-08-15T00:00:${String(seq).padStart(2, '0')}.000Z`,
    updatedAt: '2026-08-15T00:00:00.000Z',
    ...overrides,
  };
}

const overview = (transactions: Transaction[], month = '2026-08', today = '2026-08-29') =>
  computeMonthOverview(transactions, categories, accounts, month, today);

describe('totais do mês (FR-008)', () => {
  it('calcula o saldo do cenário V2 do quickstart', () => {
    // R$ 5.000,00 de receita − R$ 3.200,00 de despesa = R$ 1.800,00.
    const result = overview([
      tx({ type: 'income', amountCents: 500000, categoryId: 'c-outros' }),
      tx({ amountCents: 200000 }),
      tx({ amountCents: 120000, categoryId: 'c-transp' }),
    ]);

    expect(result.incomeCents).toBe(500000);
    expect(result.expenseCents).toBe(320000);
    expect(result.balanceCents).toBe(180000);
  });

  it('trata mês sem lançamentos como vazio, sem números quebrados', () => {
    const result = overview([tx({ date: '2026-07-10' })]);

    expect(result.isEmpty).toBe(true);
    expect(result.incomeCents).toBe(0);
    expect(result.expenseCents).toBe(0);
    expect(result.balanceCents).toBe(0);
    expect(result.breakdown).toEqual([]);
  });

  it('isola o mês selecionado', () => {
    const result = overview([tx({ amountCents: 10000 }), tx({ amountCents: 99900, date: '2026-07-15' })]);
    expect(result.expenseCents).toBe(10000);
  });

  it('produz saldo negativo quando as despesas superam as receitas', () => {
    const result = overview([
      tx({ type: 'income', amountCents: 100000, categoryId: 'c-outros' }),
      tx({ amountCents: 150000 }),
    ]);
    expect(result.balanceCents).toBe(-50000);
  });
});

describe('saldo acumulado (FR-009)', () => {
  it('soma os saldos iniciais, inclusive de contas arquivadas', () => {
    const result = overview([]);
    expect(result.accumulatedBalanceCents).toBe(50000);
  });

  it('considera todos os meses, não só o selecionado', () => {
    const result = overview([
      tx({ type: 'income', amountCents: 100000, date: '2026-06-10', categoryId: 'c-outros' }),
      tx({ amountCents: 30000, date: '2026-08-15' }),
    ]);

    // 50.000 (inicial) + 100.000 − 30.000
    expect(result.accumulatedBalanceCents).toBe(120000);
  });

  it('ignora lançamentos futuros — é "quanto eu tenho hoje"', () => {
    const result = overview([
      tx({ type: 'income', amountCents: 100000, date: '2026-12-01', categoryId: 'c-outros' }),
    ]);
    expect(result.accumulatedBalanceCents).toBe(50000);
  });
});

describe('distribuição por categoria (FR-010)', () => {
  it('agrupa despesas por categoria com valor e percentual', () => {
    const result = overview([
      tx({ amountCents: 75000, categoryId: 'c-alim' }),
      tx({ amountCents: 25000, categoryId: 'c-transp' }),
    ]);

    expect(result.breakdown).toHaveLength(2);
    expect(result.breakdown[0]).toMatchObject({
      categoryName: 'Alimentação',
      totalCents: 75000,
      percent: 75,
      color: '#a03f2d',
    });
    expect(result.breakdown[1]!.percent).toBe(25);
  });

  it('soma exatamente 100% quando há despesas', () => {
    const result = overview([
      tx({ amountCents: 33333, categoryId: 'c-alim' }),
      tx({ amountCents: 33333, categoryId: 'c-transp' }),
      tx({ amountCents: 33334, categoryId: 'c-outros' }),
    ]);

    const total = result.breakdown.reduce((sum, item) => sum + item.percent, 0);
    expect(total).toBeCloseTo(100, 6);
  });

  it('ordena por valor decrescente', () => {
    const result = overview([
      tx({ amountCents: 10000, categoryId: 'c-alim' }),
      tx({ amountCents: 90000, categoryId: 'c-transp' }),
    ]);
    expect(result.breakdown.map((i) => i.categoryName)).toEqual(['Transporte', 'Alimentação']);
  });

  it('não inclui receitas na distribuição', () => {
    const result = overview([
      tx({ type: 'income', amountCents: 500000, categoryId: 'c-outros' }),
      tx({ amountCents: 10000, categoryId: 'c-alim' }),
    ]);

    expect(result.breakdown).toHaveLength(1);
    expect(result.breakdown[0]!.categoryName).toBe('Alimentação');
  });

  it('agrega várias transações da mesma categoria', () => {
    const result = overview([
      tx({ amountCents: 4290, categoryId: 'c-alim' }),
      tx({ amountCents: 5710, categoryId: 'c-alim' }),
    ]);

    expect(result.breakdown).toHaveLength(1);
    expect(result.breakdown[0]!.totalCents).toBe(10000);
  });

  it('sobrevive a uma categoria removida do cadastro', () => {
    const result = overview([tx({ categoryId: 'c-fantasma' })]);
    expect(result.breakdown[0]!.categoryName).toBe('Sem categoria');
  });
});

describe('lançamentos recentes (FR-011)', () => {
  it('devolve no máximo 5, em ordem decrescente de data', () => {
    const transactions = [
      tx({ date: '2026-08-01' }),
      tx({ date: '2026-08-20' }),
      tx({ date: '2026-08-10' }),
      tx({ date: '2026-08-25' }),
      tx({ date: '2026-08-05' }),
      tx({ date: '2026-08-15' }),
    ].sort((a, b) => (a.date < b.date ? 1 : -1));

    const result = overview(transactions);

    expect(result.recent).toHaveLength(5);
    expect(result.recent[0]!.date).toBe('2026-08-25');
  });
});
