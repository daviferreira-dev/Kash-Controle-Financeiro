import { describe, it, expect } from 'vitest';
import {
  validateAccount,
  validateBudget,
  validateCategory,
  validateRecurrence,
  validateTransaction,
} from '@/domain/validation';
import { MAX_AMOUNT_CENTS } from '@/lib/money';
import type { Account, Category, NewRecurrence, NewTransaction } from '@/domain/types';

function tx(overrides: Partial<NewTransaction> = {}): NewTransaction {
  return {
    type: 'expense',
    amountCents: 4290,
    description: 'Almoço',
    date: '2026-08-29',
    categoryId: 'cat-1',
    accountId: 'acc-1',
    notes: null,
    source: 'manual',
    sourceRecurrenceId: null,
    occurrenceDate: null,
    ...overrides,
  };
}

function rec(overrides: Partial<NewRecurrence> = {}): NewRecurrence {
  return {
    type: 'expense',
    amountCents: 150000,
    description: 'Aluguel',
    categoryId: 'cat-1',
    accountId: 'acc-1',
    notes: null,
    frequency: 'monthly',
    startDate: '2026-06-05',
    endDate: null,
    status: 'active',
    lastGeneratedDate: null,
    ...overrides,
  };
}

const fieldsOf = (errors: { field?: string }[]) => errors.map((e) => e.field);

describe('validateTransaction', () => {
  it('aceita um lançamento completo', () => {
    expect(validateTransaction(tx())).toEqual([]);
  });

  it('rejeita valor zero', () => {
    expect(fieldsOf(validateTransaction(tx({ amountCents: 0 })))).toContain('amountCents');
  });

  it('rejeita valor negativo — o sinal vem do tipo, não do número', () => {
    expect(fieldsOf(validateTransaction(tx({ amountCents: -100 })))).toContain('amountCents');
  });

  it('rejeita valor acima do teto', () => {
    expect(fieldsOf(validateTransaction(tx({ amountCents: MAX_AMOUNT_CENTS + 1 })))).toContain(
      'amountCents',
    );
  });

  it('aceita exatamente o teto', () => {
    expect(validateTransaction(tx({ amountCents: MAX_AMOUNT_CENTS }))).toEqual([]);
  });

  it('rejeita descrição vazia ou só de espaços', () => {
    expect(fieldsOf(validateTransaction(tx({ description: '' })))).toContain('description');
    expect(fieldsOf(validateTransaction(tx({ description: '   ' })))).toContain('description');
  });

  it('rejeita descrição longa demais', () => {
    expect(fieldsOf(validateTransaction(tx({ description: 'x'.repeat(121) })))).toContain(
      'description',
    );
  });

  it('rejeita observações longas demais', () => {
    expect(fieldsOf(validateTransaction(tx({ notes: 'x'.repeat(501) })))).toContain('notes');
  });

  it('rejeita data inválida', () => {
    expect(fieldsOf(validateTransaction(tx({ date: '2026-02-30' })))).toContain('date');
    expect(fieldsOf(validateTransaction(tx({ date: '29/08/2026' })))).toContain('date');
  });

  it('aceita data futura (decisão registrada nos edge cases)', () => {
    expect(validateTransaction(tx({ date: '2030-01-15' }))).toEqual([]);
  });

  it('exige categoria e conta', () => {
    const errors = validateTransaction(tx({ categoryId: '', accountId: '' }));
    expect(fieldsOf(errors)).toEqual(expect.arrayContaining(['categoryId', 'accountId']));
  });

  it('exige rastro completo em lançamento de recorrência', () => {
    expect(fieldsOf(validateTransaction(tx({ source: 'recurrence' })))).toContain('source');
    expect(
      validateTransaction(
        tx({ source: 'recurrence', sourceRecurrenceId: 'rec-1', occurrenceDate: '2026-08-05' }),
      ),
    ).toEqual([]);
  });

  it('impede lançamento manual referenciar recorrência', () => {
    expect(fieldsOf(validateTransaction(tx({ sourceRecurrenceId: 'rec-1' })))).toContain('source');
  });

  it('acumula todos os erros de uma vez', () => {
    const errors = validateTransaction(tx({ amountCents: 0, description: '', categoryId: '' }));
    expect(errors.length).toBeGreaterThanOrEqual(3);
  });
});

describe('validateRecurrence', () => {
  it('aceita uma recorrência completa', () => {
    expect(validateRecurrence(rec())).toEqual([]);
  });

  it('rejeita data final anterior ao início', () => {
    expect(fieldsOf(validateRecurrence(rec({ endDate: '2026-01-01' })))).toContain('endDate');
  });

  it('aceita data final posterior ao início', () => {
    expect(validateRecurrence(rec({ endDate: '2027-06-05' }))).toEqual([]);
  });

  it('rejeita início inválido', () => {
    expect(fieldsOf(validateRecurrence(rec({ startDate: '2026-13-01' })))).toContain('startDate');
  });
});

describe('validateBudget', () => {
  it('aceita um orçamento válido', () => {
    expect(validateBudget({ categoryId: 'cat-1', limitCents: 80000, startMonth: '2026-08' })).toEqual(
      [],
    );
  });

  it('rejeita limite zero ou negativo', () => {
    expect(
      fieldsOf(validateBudget({ categoryId: 'cat-1', limitCents: 0, startMonth: '2026-08' })),
    ).toContain('limitCents');
  });

  it('rejeita mês de vigência malformado', () => {
    expect(
      fieldsOf(validateBudget({ categoryId: 'cat-1', limitCents: 100, startMonth: '2026-08-01' })),
    ).toContain('startMonth');
  });
});

describe('validateCategory', () => {
  const existing: Category[] = [
    { id: 'c1', name: 'Alimentação', icon: 'tag', color: '#a03f2d', kind: 'expense', archived: false, isDefault: true },
    { id: 'c2', name: 'Antiga', icon: 'tag', color: '#000000', kind: 'expense', archived: true, isDefault: false },
  ];

  const base = { icon: 'tag', color: '#123456', kind: 'expense' as const, archived: false, isDefault: false };

  it('aceita nome novo', () => {
    expect(validateCategory({ ...base, name: 'Pets' }, existing)).toEqual([]);
  });

  it('rejeita nome duplicado entre ativas, ignorando maiúsculas', () => {
    expect(fieldsOf(validateCategory({ ...base, name: 'alimentação' }, existing))).toContain('name');
  });

  it('permite reutilizar o nome de uma categoria arquivada', () => {
    expect(validateCategory({ ...base, name: 'Antiga' }, existing)).toEqual([]);
  });

  it('não acusa conflito consigo mesma ao renomear', () => {
    expect(validateCategory({ ...base, name: 'Alimentação' }, existing, 'c1')).toEqual([]);
  });

  it('rejeita nome vazio e cor inválida', () => {
    expect(fieldsOf(validateCategory({ ...base, name: '  ' }, existing))).toContain('name');
    expect(fieldsOf(validateCategory({ ...base, name: 'Pets', color: 'vermelho' }, existing))).toContain(
      'color',
    );
  });
});

describe('validateAccount', () => {
  const existing: Account[] = [
    { id: 'a1', name: 'Nubank', initialBalanceCents: 0, archived: false, isDefault: true },
  ];

  it('aceita conta nova e saldo inicial negativo', () => {
    expect(
      validateAccount(
        { name: 'Inter', initialBalanceCents: -5000, archived: false, isDefault: false },
        existing,
      ),
    ).toEqual([]);
  });

  it('rejeita nome duplicado', () => {
    expect(
      fieldsOf(
        validateAccount(
          { name: 'nubank', initialBalanceCents: 0, archived: false, isDefault: false },
          existing,
        ),
      ),
    ).toContain('name');
  });
});
