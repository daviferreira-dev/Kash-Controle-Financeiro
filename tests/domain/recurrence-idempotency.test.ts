import { describe, it, expect, beforeEach } from 'vitest';
import { runRecurrences } from '@/domain/recurrence';
import { LocalKashDatabase } from '@/storage/database';
import type { NewRecurrence } from '@/domain/types';

function newRecurrence(overrides: Partial<NewRecurrence> = {}): NewRecurrence {
  return {
    type: 'expense',
    amountCents: 150000,
    description: 'Aluguel',
    categoryId: 'cat-moradia',
    accountId: 'acc-itau',
    notes: null,
    frequency: 'monthly',
    startDate: '2026-06-05',
    endDate: null,
    status: 'active',
    lastGeneratedDate: null,
    ...overrides,
  };
}

let db: LocalKashDatabase;

beforeEach(() => {
  window.localStorage.clear();
  db = new LocalKashDatabase();
});

describe('runRecurrences (FR-020, FR-021)', () => {
  it('materializa as ocorrências vencidas com o rastro de origem', async () => {
    await db.recurrences.create(newRecurrence());

    const result = await runRecurrences(db, '2026-08-29');
    const transactions = await db.transactions.list();

    expect(result.createdCount).toBe(3);
    expect(transactions.map((t) => t.date).sort()).toEqual([
      '2026-06-05',
      '2026-07-05',
      '2026-08-05',
    ]);
    for (const t of transactions) {
      expect(t.source).toBe('recurrence');
      expect(t.sourceRecurrenceId).toBeTruthy();
      expect(t.occurrenceDate).toBe(t.date);
      expect(t.amountCents).toBe(150000);
    }
  });

  it('é idempotente: a segunda execução não cria nada', async () => {
    await db.recurrences.create(newRecurrence());

    const first = await runRecurrences(db, '2026-08-29');
    const second = await runRecurrences(db, '2026-08-29');
    const third = await runRecurrences(db, '2026-08-29');

    expect(first.createdCount).toBe(3);
    expect(second.createdCount).toBe(0);
    expect(third.createdCount).toBe(0);
    expect(await db.transactions.list()).toHaveLength(3);
  });

  it('avança lastGeneratedDate para a última ocorrência gerada', async () => {
    const created = await db.recurrences.create(newRecurrence());

    await runRecurrences(db, '2026-08-29');
    const updated = await db.recurrences.getById(created.id);

    expect(updated!.lastGeneratedDate).toBe('2026-08-05');
  });

  it('não recria um lançamento gerado e depois excluído (cenário 5 da US4)', async () => {
    await db.recurrences.create(newRecurrence());
    await runRecurrences(db, '2026-08-29');

    const transactions = await db.transactions.list();
    const july = transactions.find((t) => t.date === '2026-07-05')!;
    await db.transactions.remove(july.id);

    const rerun = await runRecurrences(db, '2026-08-29');

    expect(rerun.createdCount).toBe(0);
    expect(await db.transactions.list()).toHaveLength(2);
  });

  it('não duplica quando a chave já existe mas o cursor ficou para trás', async () => {
    // Simula duas abas abertas: o lastGeneratedDate não acompanhou a escrita.
    const created = await db.recurrences.create(newRecurrence());
    await runRecurrences(db, '2026-08-29');
    await db.recurrences.update(created.id, { lastGeneratedDate: null });

    const rerun = await runRecurrences(db, '2026-08-29');

    expect(rerun.createdCount).toBe(0);
    expect(await db.transactions.list()).toHaveLength(3);
  });

  it('retoma corretamente ao avançar o relógio', async () => {
    await db.recurrences.create(newRecurrence());

    await runRecurrences(db, '2026-08-29');
    const next = await runRecurrences(db, '2026-09-30');

    expect(next.createdCount).toBe(1);
    expect((await db.transactions.list()).map((t) => t.date)).toContain('2026-09-05');
  });

  it('ignora recorrências pausadas e as retoma depois', async () => {
    const created = await db.recurrences.create(newRecurrence({ status: 'paused' }));

    expect((await runRecurrences(db, '2026-08-29')).createdCount).toBe(0);

    await db.recurrences.update(created.id, { status: 'active' });
    expect((await runRecurrences(db, '2026-08-29')).createdCount).toBe(3);
  });

  it('não gera além da data final', async () => {
    await db.recurrences.create(newRecurrence({ endDate: '2026-07-31' }));

    const result = await runRecurrences(db, '2026-08-29');

    expect(result.createdCount).toBe(2);
  });

  it('reporta a contagem por recorrência', async () => {
    const a = await db.recurrences.create(newRecurrence());
    const b = await db.recurrences.create(
      newRecurrence({ description: 'Streaming', frequency: 'weekly', startDate: '2026-08-01' }),
    );

    const result = await runRecurrences(db, '2026-08-29');

    expect(result.byRecurrence[a.id]).toBe(3);
    expect(result.byRecurrence[b.id]).toBe(5);
    expect(result.createdCount).toBe(8);
  });

  it('não toca em lançamentos manuais', async () => {
    await db.transactions.create({
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
    });
    await db.recurrences.create(newRecurrence());

    await runRecurrences(db, '2026-08-29');
    const manual = (await db.transactions.list()).filter((t) => t.source === 'manual');

    expect(manual).toHaveLength(1);
  });
});
