import { describe, it, expect } from 'vitest';
import { roundLimit, suggestBudgets } from '@/domain/budgetSuggestion';
import { accountBalance, initialBalanceForTarget } from '@/domain/accountBalance';
import type { Account, Budget, Category, Transaction } from '@/domain/types';

const categories: Category[] = [
  ['c-alim', 'Alimentação', '#a03f2d'],
  ['c-transp', 'Transporte', '#705c1e'],
  ['c-moradia', 'Moradia', '#56423e'],
].map(([id, name, color]) => ({
  id: id!,
  name: name!,
  icon: 'tag',
  color: color!,
  kind: 'expense' as const,
  archived: false,
  isDefault: true,
}));

let seq = 0;
function tx(date: string, amountCents: number, categoryId: string, over: Partial<Transaction> = {}): Transaction {
  seq += 1;
  return {
    id: `t-${seq}`,
    type: 'expense',
    amountCents,
    description: `Compra ${seq}`,
    date,
    categoryId,
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

const suggest = (transactions: Transaction[], over = {}) =>
  suggestBudgets({
    transactions,
    categories,
    budgets: [],
    currentMonth: '2026-08',
    ...over,
  });

describe('roundLimit', () => {
  it('arredonda para cima em passos legíveis', () => {
    expect(roundLimit(4321)).toBe(5000); // R$ 43,21 -> R$ 50,00
    expect(roundLimit(63500)).toBe(65000); // R$ 635,00 -> R$ 650,00
    expect(roundLimit(147300)).toBe(150000); // R$ 1.473,00 -> R$ 1.500,00
  });

  it('não inventa limite para gasto zero', () => {
    expect(roundLimit(0)).toBe(0);
  });
});

describe('suggestBudgets — sugestão a partir do gasto real', () => {
  const alimentacao = [
    tx('2026-06-05', 30000, 'c-alim'),
    tx('2026-06-20', 32000, 'c-alim'),
    tx('2026-07-05', 28000, 'c-alim'),
    tx('2026-07-22', 33000, 'c-alim'),
  ];

  it('propõe um limite baseado no que a pessoa gasta', () => {
    const [sugestao] = suggest(alimentacao);

    expect(sugestao!.categoryName).toBe('Alimentação');
    expect(sugestao!.months).toEqual(['2026-06', '2026-07']);
    // Junho: 620,00 · Julho: 610,00 · média 615,00 -> teto R$ 650,00
    expect(sugestao!.perMonthCents).toEqual([62000, 61000]);
    expect(sugestao!.averageCents).toBe(61500);
    expect(sugestao!.limitCents).toBe(65000);
    expect(sugestao!.stable).toBe(true);
  });

  it('ignora o mês corrente, que ainda está incompleto', () => {
    const comMesCorrente = [...alimentacao, tx('2026-08-02', 5000, 'c-alim')];
    const [sugestao] = suggest(comMesCorrente);

    expect(sugestao!.months).toEqual(['2026-06', '2026-07']);
    expect(sugestao!.averageCents).toBe(61500);
  });

  it('basta um mês fechado para sugerir', () => {
    const umMes = [tx('2026-07-05', 28000, 'c-alim'), tx('2026-07-22', 33000, 'c-alim')];
    const [sugestao] = suggest(umMes);

    expect(sugestao!.months).toEqual(['2026-07']);
    expect(sugestao!.averageCents).toBe(61000);
    expect(sugestao!.usaProjecao).toBe(false);
  });

  it('respeita um mínimo de meses mais exigente', () => {
    expect(suggest(alimentacao, { minMonths: 3 })).toHaveLength(0);
  });

  it('sem mês fechado, projeta o mês corrente já decorrido', () => {
    // Só agosto, e hoje é dia 29 de 31: 93% do mês já passou.
    const soMesCorrente = [tx('2026-08-05', 30000, 'c-alim'), tx('2026-08-20', 32000, 'c-alim')];
    const [sugestao] = suggest(soMesCorrente, { today: '2026-08-29' });

    expect(sugestao!.usaProjecao).toBe(true);
    expect(sugestao!.months).toEqual(['2026-08']);
    // 620,00 em 29/31 do mês -> ~662,00 projetado -> teto R$ 700,00
    expect(sugestao!.averageCents).toBe(66276);
    expect(sugestao!.limitCents).toBe(70000);
  });

  it('não projeta quando o mês mal começou', () => {
    const soMesCorrente = [tx('2026-08-02', 30000, 'c-alim')];
    expect(suggest(soMesCorrente, { today: '2026-08-05' })).toHaveLength(0);
  });

  it('meses fechados têm precedência sobre a projeção', () => {
    const misto = [...alimentacao, tx('2026-08-10', 99900, 'c-alim')];
    const [sugestao] = suggest(misto, { today: '2026-08-29' });

    expect(sugestao!.usaProjecao).toBe(false);
    expect(sugestao!.months).toEqual(['2026-06', '2026-07']);
  });

  it('dá folga quando o gasto varia muito', () => {
    const instavel = [
      tx('2026-06-10', 10000, 'c-transp'),
      tx('2026-07-10', 40000, 'c-transp'),
    ];
    const [sugestao] = suggest(instavel);

    expect(sugestao!.stable).toBe(false);
    // Média 250,00 e pior mês 400,00: o teto fica entre os dois, não na média.
    expect(sugestao!.limitCents).toBeGreaterThan(sugestao!.averageCents);
    expect(sugestao!.limitCents).toBeLessThanOrEqual(40000);
  });

  it('não sugere para categoria que já tem orçamento', () => {
    const budget: Budget = {
      id: 'b-1',
      categoryId: 'c-alim',
      limitCents: 80000,
      startMonth: '2026-08',
      createdAt: '2026-08-01T00:00:00.000Z',
      updatedAt: '2026-08-01T00:00:00.000Z',
    };
    expect(suggest(alimentacao, { budgets: [budget] })).toHaveLength(0);
  });

  it('ignora receitas', () => {
    const receitas = [
      tx('2026-06-05', 500000, 'c-alim', { type: 'income' }),
      tx('2026-07-05', 500000, 'c-alim', { type: 'income' }),
    ];
    expect(suggest(receitas)).toHaveLength(0);
  });

  it('ignora categoria arquivada', () => {
    const arquivadas = categories.map((c) =>
      c.id === 'c-alim' ? { ...c, archived: true } : c,
    );
    expect(suggest(alimentacao, { categories: arquivadas })).toHaveLength(0);
  });

  it('ordena por peso no orçamento, do maior gasto para o menor', () => {
    const transactions = [
      tx('2026-06-10', 150000, 'c-moradia'),
      tx('2026-07-10', 150000, 'c-moradia'),
      ...alimentacao,
      tx('2026-06-01', 5000, 'c-transp'),
      tx('2026-07-01', 5000, 'c-transp'),
    ];

    expect(suggest(transactions).map((s) => s.categoryName)).toEqual([
      'Moradia',
      'Alimentação',
      'Transporte',
    ]);
  });
});

describe('saldo da conta', () => {
  const account: Account = {
    id: 'acc-1',
    name: 'Nubank',
    initialBalanceCents: 925358, // R$ 9.253,58, o saldo inicial do extrato
    archived: false,
    isDefault: true,
  };

  const movimento = [
    tx('2026-08-05', 139376, 'c-alim', { type: 'income' }),
    tx('2026-08-10', 288964, 'c-alim'),
  ];

  it('soma o saldo inicial com o movimento até hoje', () => {
    // 9.253,58 + 1.393,76 − 2.889,64 = 7.757,70
    expect(accountBalance(account, movimento, '2026-08-21')).toBe(775770);
  });

  it('não conta lançamentos futuros', () => {
    const comFuturo = [...movimento, tx('2026-12-01', 100000, 'c-alim')];
    expect(accountBalance(account, comFuturo, '2026-08-21')).toBe(775770);
  });

  it('ignora lançamentos de outra conta', () => {
    const outraConta = [...movimento, tx('2026-08-11', 50000, 'c-alim', { accountId: 'acc-2' })];
    expect(accountBalance(account, outraConta, '2026-08-21')).toBe(775770);
  });

  it('calcula o saldo inicial que faz fechar com o saldo informado', () => {
    // O extrato em CSV não traz o rendimento de R$ 36,09; informar o saldo
    // real do banco (7.793,79) absorve a diferença no ponto de partida.
    const inicial = initialBalanceForTarget(account, movimento, '2026-08-21', 779379);

    expect(inicial).toBe(928967); // 9.253,58 + 36,09
    expect(accountBalance({ ...account, initialBalanceCents: inicial }, movimento, '2026-08-21')).toBe(
      779379,
    );
  });

  it('aceita saldo negativo', () => {
    const inicial = initialBalanceForTarget(account, movimento, '2026-08-21', -10000);
    expect(accountBalance({ ...account, initialBalanceCents: inicial }, movimento, '2026-08-21')).toBe(
      -10000,
    );
  });
});
