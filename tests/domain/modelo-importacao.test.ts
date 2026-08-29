import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { LocalKashDatabase } from '@/storage/database';
import { validateTransaction } from '@/domain/validation';
import { computeBudgetProgress } from '@/domain/budget';
import type { KashSnapshot } from '@/domain/types';

/**
 * O arquivo de exemplo em fixtures/ precisa ser aceito pelo importador de
 * verdade. Sem este teste, ele viraria documentação que envelhece calada.
 */
const modelo = JSON.parse(
  readFileSync(resolve(process.cwd(), 'fixtures/modelo-importacao.json'), 'utf8'),
) as KashSnapshot;

let db: LocalKashDatabase;

beforeEach(() => {
  window.localStorage.clear();
  db = new LocalKashDatabase();
});

describe('fixtures/modelo-importacao.json', () => {
  it('é aceito pelo importador', async () => {
    const result = await db.importAll(modelo);

    expect(result.errors).toEqual([]);
    expect(result.ok).toBe(true);
  });

  it('restaura todas as coleções', async () => {
    await db.importAll(modelo);

    expect(await db.transactions.list()).toHaveLength(5);
    expect(await db.categories.list()).toHaveLength(8);
    expect(await db.accounts.list()).toHaveLength(3);
    expect(await db.budgets.list()).toHaveLength(1);
    expect(await db.recurrences.list()).toHaveLength(1);
  });

  it('não deixa referência órfã: toda transação aponta para categoria e conta do arquivo', async () => {
    await db.importAll(modelo);

    const categoryIds = new Set((await db.categories.list()).map((c) => c.id));
    const accountIds = new Set((await db.accounts.list()).map((a) => a.id));

    for (const transaction of await db.transactions.list()) {
      expect(categoryIds.has(transaction.categoryId)).toBe(true);
      expect(accountIds.has(transaction.accountId)).toBe(true);
    }

    for (const budget of await db.budgets.list()) {
      expect(categoryIds.has(budget.categoryId)).toBe(true);
    }

    for (const recurrence of await db.recurrences.list()) {
      expect(categoryIds.has(recurrence.categoryId)).toBe(true);
      expect(accountIds.has(recurrence.accountId)).toBe(true);
    }
  });

  it('toda transação do modelo passa na validação do domínio', () => {
    for (const transaction of modelo.transactions) {
      expect(validateTransaction(transaction)).toEqual([]);
    }
  });

  it('os valores estão em centavos, como o README promete', async () => {
    await db.importAll(modelo);
    const transactions = await db.transactions.list();

    const almoco = transactions.find((t) => t.description === 'Almoço no restaurante')!;
    expect(almoco.amountCents).toBe(4290); // R$ 42,90

    // Todos inteiros e positivos — o sinal vem do `type`.
    for (const t of transactions) {
      expect(Number.isInteger(t.amountCents)).toBe(true);
      expect(t.amountCents).toBeGreaterThan(0);
    }
  });

  it('o orçamento do modelo produz um progresso coerente', async () => {
    await db.importAll(modelo);

    const [budget] = await db.budgets.list();
    const categories = await db.categories.list();
    const progress = computeBudgetProgress(
      budget!,
      categories.find((c) => c.id === budget!.categoryId),
      await db.transactions.list(),
      '2026-08',
    );

    // R$ 42,90 de almoço contra um teto de R$ 800,00.
    expect(progress.spentCents).toBe(4290);
    expect(progress.status).toBe('ok');
  });

  it('ids são únicos dentro de cada coleção', () => {
    const unique = (items: Array<{ id: string }>) => new Set(items.map((i) => i.id)).size;

    expect(unique(modelo.transactions)).toBe(modelo.transactions.length);
    expect(unique(modelo.categories)).toBe(modelo.categories.length);
    expect(unique(modelo.accounts)).toBe(modelo.accounts.length);
  });
});
