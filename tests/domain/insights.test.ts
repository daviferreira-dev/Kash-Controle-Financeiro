import { describe, it, expect } from 'vitest';
import { computeInsights, monthlySeries, spendingByWeekday } from '@/domain/insights';
import type { Category, Transaction } from '@/domain/types';

const categories: Category[] = [
  ['c-alim', 'Alimentação'],
  ['c-moradia', 'Moradia'],
  ['c-transp', 'Transporte'],
  ['c-outros', 'Outros'],
].map(([id, name]) => ({
  id: id!,
  name: name!,
  icon: 'tag',
  color: '#a03f2d',
  kind: 'expense' as const,
  archived: false,
  isDefault: true,
}));

let seq = 0;
function tx(date: string, amountCents: number, over: Partial<Transaction> = {}): Transaction {
  seq += 1;
  return {
    id: `t-${seq}`,
    type: 'expense',
    amountCents,
    description: `Lançamento ${seq}`,
    date,
    categoryId: 'c-alim',
    accountId: 'acc-1',
    notes: null,
    source: 'manual',
    sourceRecurrenceId: null,
    occurrenceDate: null,
    createdAt: '2026-08-01T00:00:00.000Z',
    updatedAt: '2026-08-01T00:00:00.000Z',
    ...over,
  };
}

const insights = (transactions: Transaction[], month = '2026-08', today = '2026-08-31') =>
  computeInsights({ transactions, categories, month, today });

const byId = (list: ReturnType<typeof insights>, id: string) => list.find((i) => i.id === id);

describe('computeInsights — taxa de poupança', () => {
  it('celebra quando sobra 20% ou mais', () => {
    const i = byId(
      insights([
        tx('2026-08-05', 500000, { type: 'income', categoryId: 'c-outros' }),
        tx('2026-08-10', 300000, { categoryId: 'c-moradia' }),
      ]),
      'savings-rate',
    );

    expect(i!.tone).toBe('positive');
    expect(i!.title).toContain('40%');
    expect(i!.amountCents).toBe(200000);
  });

  it('é neutro quando sobra pouco', () => {
    const i = byId(
      insights([
        tx('2026-08-05', 500000, { type: 'income', categoryId: 'c-outros' }),
        tx('2026-08-10', 475000, { categoryId: 'c-moradia' }),
      ]),
      'savings-rate',
    );
    expect(i!.tone).toBe('neutral');
  });

  it('alerta quando as saídas superam as entradas', () => {
    const i = byId(
      insights([
        tx('2026-08-05', 100000, { type: 'income', categoryId: 'c-outros' }),
        tx('2026-08-10', 150000, { categoryId: 'c-moradia' }),
      ]),
      'savings-rate',
    );

    expect(i!.tone).toBe('attention');
    expect(i!.amountCents).toBe(50000);
  });

  it('não fala de poupança sem receita no mês', () => {
    expect(byId(insights([tx('2026-08-10', 5000)]), 'savings-rate')).toBeUndefined();
  });
});

describe('computeInsights — concentração de gastos', () => {
  it('alerta quando uma categoria leva metade ou mais', () => {
    const i = byId(
      insights([
        tx('2026-08-05', 150000, { categoryId: 'c-moradia' }),
        tx('2026-08-10', 50000, { categoryId: 'c-alim' }),
      ]),
      'top-category',
    );

    expect(i!.tone).toBe('attention');
    expect(i!.title).toContain('Moradia');
    expect(i!.title).toContain('75%');
  });

  it('é neutro quando os gastos estão distribuídos', () => {
    const i = byId(
      insights([
        tx('2026-08-05', 40000, { categoryId: 'c-moradia' }),
        tx('2026-08-06', 35000, { categoryId: 'c-alim' }),
        tx('2026-08-07', 30000, { categoryId: 'c-transp' }),
      ]),
      'top-category',
    );
    expect(i!.tone).toBe('neutral');
  });
});

describe('computeInsights — comparação com o mês anterior', () => {
  const anterior = [tx('2026-07-10', 100000, { categoryId: 'c-alim' })];

  it('alerta quando o gasto cresce mais de 10%', () => {
    const i = byId(insights([...anterior, tx('2026-08-10', 150000)]), 'vs-previous');

    expect(i!.tone).toBe('attention');
    expect(i!.title).toContain('50%');
    expect(i!.title).toContain('a mais');
  });

  it('celebra quando o gasto cai mais de 10%', () => {
    const i = byId(insights([...anterior, tx('2026-08-10', 50000)]), 'vs-previous');

    expect(i!.tone).toBe('positive');
    expect(i!.title).toContain('a menos');
  });

  it('ignora variação pequena, que é ruído', () => {
    const i = byId(insights([...anterior, tx('2026-08-10', 105000)]), 'vs-previous');
    expect(i).toBeUndefined();
  });

  it('não compara quando não há mês anterior', () => {
    expect(byId(insights([tx('2026-08-10', 150000)]), 'vs-previous')).toBeUndefined();
  });
});

describe('computeInsights — categoria que mais cresceu', () => {
  it('aponta a categoria com maior alta', () => {
    const i = byId(
      insights([
        tx('2026-07-10', 20000, { categoryId: 'c-alim' }),
        tx('2026-07-11', 100000, { categoryId: 'c-moradia' }),
        tx('2026-08-10', 60000, { categoryId: 'c-alim' }),
        tx('2026-08-11', 100000, { categoryId: 'c-moradia' }),
      ]),
      'category-growth',
    );

    expect(i!.title).toContain('Alimentação');
    expect(i!.title).toContain('200%');
  });

  it('não aponta categoria que não existia antes — a variação seria infinita', () => {
    const i = byId(
      insights([
        tx('2026-07-10', 100000, { categoryId: 'c-moradia' }),
        tx('2026-08-10', 100000, { categoryId: 'c-moradia' }),
        tx('2026-08-11', 90000, { categoryId: 'c-transp' }),
      ]),
      'category-growth',
    );
    expect(i).toBeUndefined();
  });
});

describe('computeInsights — ritmo e projeção', () => {
  it('projeta o fechamento quando o mês ainda corre', () => {
    // R$ 300,00 em 10 dias -> R$ 30,00/dia -> ~R$ 930,00 em 31 dias.
    const i = byId(insights([tx('2026-08-05', 30000)], '2026-08', '2026-08-10'), 'pace');

    expect(i!.title).toContain('ritmo atual');
    expect(i!.amountCents).toBe(93000);
  });

  it('mostra só a média quando o mês já fechou', () => {
    const i = byId(insights([tx('2026-07-05', 31000)], '2026-07', '2026-08-15'), 'pace');

    expect(i!.title).toContain('por dia');
    expect(i!.title).not.toContain('ritmo atual');
  });
});

describe('computeInsights — maior gasto', () => {
  it('destaca um gasto que pesa 15% ou mais', () => {
    const i = byId(
      insights([tx('2026-08-05', 100000, { description: 'Aluguel' }), tx('2026-08-06', 10000)]),
      'biggest-expense',
    );

    expect(i!.description).toContain('Aluguel');
    expect(i!.amountCents).toBe(100000);
  });

  it('ignora quando nenhum gasto se destaca', () => {
    const iguais = Array.from({ length: 10 }, (_, k) => tx(`2026-08-0${(k % 9) + 1}`, 10000));
    expect(byId(insights(iguais), 'biggest-expense')).toBeUndefined();
  });
});

describe('computeInsights — sem dados', () => {
  it('não inventa insight em mês vazio', () => {
    expect(insights([])).toEqual([]);
    expect(insights([tx('2026-07-10', 5000)])).toEqual([]);
  });
});

describe('monthlySeries', () => {
  it('devolve os últimos meses em ordem, terminando no mês pedido', () => {
    const s = monthlySeries([], '2026-08', 6);

    expect(s).toHaveLength(6);
    expect(s[0]!.month).toBe('2026-03');
    expect(s[5]!.month).toBe('2026-08');
  });

  it('separa entradas, saídas e saldo por mês', () => {
    const s = monthlySeries(
      [
        tx('2026-07-05', 500000, { type: 'income' }),
        tx('2026-07-10', 200000),
        tx('2026-08-10', 100000),
      ],
      '2026-08',
      2,
    );

    expect(s[0]).toMatchObject({ incomeCents: 500000, expenseCents: 200000, balanceCents: 300000 });
    expect(s[1]).toMatchObject({ incomeCents: 0, expenseCents: 100000, balanceCents: -100000 });
  });

  it('atravessa a virada de ano', () => {
    const s = monthlySeries([], '2026-01', 3);
    expect(s.map((p) => p.month)).toEqual(['2025-11', '2025-12', '2026-01']);
  });
});

describe('spendingByWeekday', () => {
  it('agrupa as despesas pelo dia da semana', () => {
    // 03/08/2026 é segunda; 08/08/2026 é sábado.
    const dias = spendingByWeekday(
      [tx('2026-08-03', 10000), tx('2026-08-08', 30000), tx('2026-08-08', 5000)],
      '2026-08',
    );

    expect(dias).toHaveLength(7);
    expect(dias[1]).toMatchObject({ label: 'Seg', totalCents: 10000, count: 1 });
    expect(dias[6]).toMatchObject({ label: 'Sáb', totalCents: 35000, count: 2 });
  });

  it('ignora receitas e outros meses', () => {
    const dias = spendingByWeekday(
      [tx('2026-08-03', 10000, { type: 'income' }), tx('2026-07-06', 10000)],
      '2026-08',
    );
    expect(dias.every((d) => d.totalCents === 0)).toBe(true);
  });
});
