import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { computeMonthOverview } from '@/domain/overview';
import { computeBudgetProgress } from '@/domain/budget';
import { LocalKashDatabase } from '@/storage/database';
import type { KashSnapshot } from '@/domain/types';

/**
 * SC-005: com 1.000 lançamentos, abrir o Overview, filtrar a lista e salvar um
 * novo lançamento respondem em menos de 1 segundo cada.
 *
 * O limite aqui é bem mais apertado que 1s de propósito: se a operação passar
 * de algumas dezenas de milissegundos, algo regrediu de forma relevante.
 */
const BUDGET_MS = 250;

// O ambiente jsdom não expõe import.meta.url como file:, então resolvemos a
// fixture a partir da raiz do projeto, que é o cwd do Vitest.
const snapshot = JSON.parse(
  readFileSync(resolve(process.cwd(), 'fixtures/seed-1000.json'), 'utf8'),
) as KashSnapshot;

let db: LocalKashDatabase;

beforeEach(async () => {
  window.localStorage.clear();
  db = new LocalKashDatabase();
  const result = await db.importAll(snapshot);
  expect(result.ok).toBe(true);
});

function elapsed(fn: () => void): number {
  const start = performance.now();
  fn();
  return performance.now() - start;
}

describe('desempenho com 1.000 lançamentos (SC-005)', () => {
  it('a fixture realmente tem 1.000 lançamentos', () => {
    expect(snapshot.transactions).toHaveLength(1000);
  });

  it('calcula o Overview do mês rapidamente', async () => {
    const transactions = await db.transactions.list();
    const categories = await db.categories.list();
    const accounts = await db.accounts.list();

    const ms = elapsed(() => {
      computeMonthOverview(transactions, categories, accounts, '2026-08', '2026-08-29');
    });

    expect(ms).toBeLessThan(BUDGET_MS);
  });

  it('filtra a lista rapidamente', async () => {
    const start = performance.now();
    const result = await db.transactions.listByFilters({
      month: '2026-08',
      type: 'expense',
      search: 'mercado',
    });
    const ms = performance.now() - start;

    expect(ms).toBeLessThan(BUDGET_MS);
    expect(Array.isArray(result)).toBe(true);
  });

  it('salva um novo lançamento rapidamente', async () => {
    const categories = await db.categories.list();
    const accounts = await db.accounts.list();

    const start = performance.now();
    await db.transactions.create({
      type: 'expense',
      amountCents: 4290,
      description: 'Almoço',
      date: '2026-08-29',
      categoryId: categories[0]!.id,
      accountId: accounts[0]!.id,
      notes: null,
      source: 'manual',
      sourceRecurrenceId: null,
      occurrenceDate: null,
    });
    const ms = performance.now() - start;

    expect(ms).toBeLessThan(BUDGET_MS);
    expect(await db.transactions.list()).toHaveLength(1001);
  });

  it('calcula o consumo de um orçamento rapidamente', async () => {
    const transactions = await db.transactions.list();
    const categories = await db.categories.list();
    const budgets = await db.budgets.list();
    const budget = budgets[0]!;

    const ms = elapsed(() => {
      computeBudgetProgress(
        budget,
        categories.find((c) => c.id === budget.categoryId),
        transactions,
        '2026-08',
      );
    });

    expect(ms).toBeLessThan(BUDGET_MS);
  });

  it('mantém a base dentro de um tamanho razoável para o localStorage', () => {
    const bytes = new Blob([JSON.stringify(snapshot)]).size;
    // Folgado dentro dos ~5MB típicos — premissa da decisão R-003.
    expect(bytes).toBeLessThan(2_000_000);
  });
});
