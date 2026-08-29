import { describe, it, expect } from 'vitest';
import { transactionsToCsv } from '@/domain/spreadsheet';
import type { Account, Category, Transaction } from '@/domain/types';

const categories: Category[] = [
  { id: 'c1', name: 'Alimentação', icon: 'x', color: '#000', kind: 'expense', archived: false, isDefault: true },
  { id: 'c2', name: 'Salário; extra', icon: 'x', color: '#000', kind: 'income', archived: false, isDefault: false },
];
const accounts: Account[] = [
  { id: 'a1', name: 'Nubank', initialBalanceCents: 10000, archived: false, isDefault: true },
];

function tx(over: Partial<Transaction>): Transaction {
  return {
    id: 'id',
    type: 'expense',
    amountCents: 4290,
    description: 'Almoço',
    date: '2026-08-10',
    categoryId: 'c1',
    accountId: 'a1',
    notes: null,
    source: 'manual',
    sourceRecurrenceId: null,
    occurrenceDate: null,
    createdAt: '2026-08-10T12:00:00.000Z',
    updatedAt: '2026-08-10T12:00:00.000Z',
    ...over,
  };
}

describe('transactionsToCsv', () => {
  it('cabeçalho na ordem definida e uma linha por lançamento, por data', () => {
    const csv = transactionsToCsv(
      [
        tx({ id: '1', date: '2026-08-20', description: 'B' }),
        tx({ id: '2', date: '2026-08-05', description: 'A' }),
      ],
      categories,
      accounts,
    );
    const lines = csv.trim().split('\r\n');

    expect(lines[0]).toBe('Data;Mês;Tipo;Categoria;Conta;Descrição;Valor;Saldo acumulado;Observações');
    expect(lines[1]!.startsWith('05/08/2026;2026-08;Despesa;Alimentação;Nubank;A;')).toBe(true);
    expect(lines[2]!.startsWith('20/08/2026;2026-08;Despesa;Alimentação;Nubank;B;')).toBe(true);
  });

  it('despesa negativa, receita positiva, com vírgula decimal', () => {
    const csv = transactionsToCsv(
      [
        tx({ id: '1', type: 'expense', amountCents: 4290 }),
        tx({ id: '2', type: 'income', amountCents: 500000, categoryId: 'c2' }),
      ],
      categories,
      accounts,
    );
    const lines = csv.trim().split('\r\n');

    expect(lines[1]).toContain(';-42,90;');
    expect(lines[2]).toContain(';5000,00;');
  });

  it('saldo acumulado parte do saldo inicial das contas e acompanha cada linha', () => {
    const csv = transactionsToCsv(
      [
        tx({ id: '1', date: '2026-08-01', type: 'income', amountCents: 20000, categoryId: 'c1' }),
        tx({ id: '2', date: '2026-08-02', type: 'expense', amountCents: 5000, categoryId: 'c1' }),
      ],
      categories,
      accounts,
    );
    const lines = csv.trim().split('\r\n');

    // saldo inicial 100,00 + 200,00 = 300,00; depois - 50,00 = 250,00
    expect(lines[1]!.split(';')[7]).toBe('300,00');
    expect(lines[2]!.split(';')[7]).toBe('250,00');
  });

  it('protege campos com ponto-e-vírgula ou aspas', () => {
    const csv = transactionsToCsv(
      [tx({ description: 'Padaria; e café', notes: 'com "desconto"', categoryId: 'c2' })],
      categories,
      accounts,
    );
    const line = csv.trim().split('\r\n')[1]!;

    expect(line).toContain('"Padaria; e café"');
    expect(line).toContain('"Salário; extra"');
    expect(line).toContain('"com ""desconto"""');
  });

  it('não quebra quando a categoria ou a conta não existem mais', () => {
    const csv = transactionsToCsv([tx({ categoryId: 'sumiu', accountId: 'sumiu' })], categories, accounts);
    const line = csv.trim().split('\r\n')[1]!;

    expect(line).toContain('(categoria removida)');
    expect(line).toContain('(conta removida)');
  });
});
