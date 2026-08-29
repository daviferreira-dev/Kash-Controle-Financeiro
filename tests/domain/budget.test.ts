import { describe, it, expect } from 'vitest';
import { budgetStatusOf, computeBudgetProgress, isBudgetActiveIn } from '@/domain/budget';
import type { Budget, Category, Transaction } from '@/domain/types';

const category: Category = {
  id: 'c-alim',
  name: 'Alimentação',
  icon: 'x',
  color: '#a03f2d',
  kind: 'expense',
  archived: false,
  isDefault: true,
};

const budget: Budget = {
  id: 'b-1',
  categoryId: 'c-alim',
  limitCents: 80000, // R$ 800,00
  startMonth: '2026-08',
  createdAt: '2026-08-01T00:00:00.000Z',
  updatedAt: '2026-08-01T00:00:00.000Z',
};

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
    accountId: 'a-1',
    notes: null,
    source: 'manual',
    sourceRecurrenceId: null,
    occurrenceDate: null,
    createdAt: '2026-08-15T00:00:00.000Z',
    updatedAt: '2026-08-15T00:00:00.000Z',
    ...overrides,
  };
}

const progress = (transactions: Transaction[], month = '2026-08') =>
  computeBudgetProgress(budget, category, transactions, month);

describe('consumo do orçamento (FR-015)', () => {
  it('reproduz o cenário V3: R$ 600 de R$ 800 = 75%', () => {
    const result = progress([tx({ amountCents: 60000 })]);

    expect(result.spentCents).toBe(60000);
    expect(result.percentUsed).toBe(75);
    expect(result.remainingCents).toBe(20000);
    expect(result.status).toBe('ok');
    expect(result.statusLabel).toBe('Dentro do limite');
  });

  it('mostra 0% e restante igual ao limite quando não há gastos', () => {
    const result = progress([]);

    expect(result.spentCents).toBe(0);
    expect(result.percentUsed).toBe(0);
    expect(result.remainingCents).toBe(80000);
    expect(result.status).toBe('ok');
  });

  it('soma várias despesas da categoria', () => {
    const result = progress([tx({ amountCents: 4290 }), tx({ amountCents: 5710 })]);
    expect(result.spentCents).toBe(10000);
  });
});

describe('faixas de status (FR-016)', () => {
  it('vira "Em atenção" a partir de 80%', () => {
    const result = progress([tx({ amountCents: 65000 })]); // 81,25%

    expect(result.status).toBe('warning');
    expect(result.statusLabel).toBe('Em atenção');
  });

  it('trata exatamente 80% como "Em atenção"', () => {
    const result = progress([tx({ amountCents: 64000 })]);

    expect(result.percentUsed).toBe(80);
    expect(result.status).toBe('warning');
  });

  it('trata exatamente 100% como "Em atenção", não estourado', () => {
    const result = progress([tx({ amountCents: 80000 })]);

    expect(result.percentUsed).toBe(100);
    expect(result.status).toBe('warning');
    expect(result.remainingCents).toBe(0);
  });

  it('vira "Estourado" acima de 100%, com excedente negativo', () => {
    const result = progress([tx({ amountCents: 85000 })]); // 106,25%

    expect(result.status).toBe('exceeded');
    expect(result.statusLabel).toBe('Estourado');
    expect(result.remainingCents).toBe(-5000);
  });

  it('classifica corretamente logo abaixo da fronteira de atenção', () => {
    expect(budgetStatusOf(79.99)).toBe('ok');
    expect(budgetStatusOf(80)).toBe('warning');
    expect(budgetStatusOf(100)).toBe('warning');
    expect(budgetStatusOf(100.01)).toBe('exceeded');
  });

  it('sempre acompanha o status de um rótulo textual, não só de cor', () => {
    for (const cents of [10000, 65000, 85000]) {
      expect(progress([tx({ amountCents: cents })]).statusLabel).not.toBe('');
    }
  });
});

describe('isolamento por mês e categoria (FR-018)', () => {
  it('ignora despesas de outro mês', () => {
    const result = progress([tx({ amountCents: 60000, date: '2026-07-15' })]);
    expect(result.spentCents).toBe(0);
  });

  it('ignora despesas de outra categoria', () => {
    const result = progress([tx({ amountCents: 60000, categoryId: 'c-transp' })]);
    expect(result.spentCents).toBe(0);
  });

  it('ignora receitas da mesma categoria', () => {
    const result = progress([tx({ amountCents: 60000, type: 'income' })]);
    expect(result.spentCents).toBe(0);
  });

  it('calcula um mês passado sem afetar o corrente', () => {
    const transactions = [
      tx({ amountCents: 30000, date: '2026-08-10' }),
      tx({ amountCents: 70000, date: '2026-09-10' }),
    ];

    expect(progress(transactions, '2026-08').spentCents).toBe(30000);
    expect(progress(transactions, '2026-09').spentCents).toBe(70000);
  });
});

describe('vigência do orçamento', () => {
  it('vale do mês de início em diante', () => {
    expect(isBudgetActiveIn(budget, '2026-07')).toBe(false);
    expect(isBudgetActiveIn(budget, '2026-08')).toBe(true);
    expect(isBudgetActiveIn(budget, '2027-01')).toBe(true);
  });
});
