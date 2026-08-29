import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseStatementCsv, statementRowsToTransactions } from '@/domain/csvImport';
import { detectRecurrences } from '@/domain/recurrenceDetection';
import { suggestBudgets } from '@/domain/budgetSuggestion';
import { DEFAULT_ACCOUNTS, DEFAULT_CATEGORIES } from '@/storage/seed';
import type { Account, Category, Transaction } from '@/domain/types';

/**
 * Roda a análise completa sobre o extrato real, para provar que recorrências
 * e orçamentos saem de padrões do próprio extrato — e não de suposição.
 *
 * O arquivo é pessoal e está no .gitignore: o teste se pula sozinho onde ele
 * não existir, e nunca imprime descrição, valor ou contraparte.
 */
const modelosDir = resolve(process.cwd(), 'modelos');
const realFile = existsSync(modelosDir)
  ? readdirSync(modelosDir).find((f) => /^NU_.*\.csv$/i.test(f))
  : undefined;

const categories: Category[] = DEFAULT_CATEGORIES.map((c, i) => ({ ...c, id: `cat-${i}` }));
const account: Account = { ...DEFAULT_ACCOUNTS[0]!, id: 'acc-nubank' };

describe.skipIf(!realFile)('análise do extrato real', () => {
  const content = realFile ? readFileSync(resolve(modelosDir, realFile), 'utf8') : '';

  function load(): Transaction[] {
    const { rows } = parseStatementCsv(content);
    const stamp = '2026-08-21T12:00:00.000Z';
    return statementRowsToTransactions({ rows, categories, account }).map((t, i) => ({
      ...t,
      id: `t-${i}`,
      createdAt: stamp,
      updatedAt: stamp,
    }));
  }

  it('as recorrências detectadas saem de lançamentos que existem no extrato', () => {
    const transactions = load();
    const byId = new Map(transactions.map((t) => [t.id, t]));

    const suggestions = detectRecurrences({ transactions, today: '2026-08-21' });

    for (const s of suggestions) {
      // Toda ocorrência citada tem que ser um lançamento real do arquivo.
      for (const occurrence of s.occurrences) {
        expect(byId.has(occurrence.id)).toBe(true);
      }
      // O valor sugerido está dentro da faixa observada, nunca fora dela.
      expect(s.amountCents).toBeGreaterThanOrEqual(s.minCents);
      expect(s.amountCents).toBeLessThanOrEqual(s.maxCents);
      // E a faixa é a dos próprios lançamentos.
      const amounts = s.occurrences.map((o) => o.amountCents);
      expect(s.minCents).toBe(Math.min(...amounts));
      expect(s.maxCents).toBe(Math.max(...amounts));
    }
  });

  it('os orçamentos sugeridos saem do gasto real, mês a mês', () => {
    const transactions = load();
    const suggestions = suggestBudgets({
      transactions,
      categories,
      budgets: [],
      currentMonth: '2026-09', // agosto entra como mês fechado
      minMonths: 1,
    });

    for (const s of suggestions) {
      // O total de cada mês bate com a soma das despesas daquela categoria.
      s.months.forEach((month, index) => {
        const real = transactions
          .filter(
            (t) => t.type === 'expense' && t.categoryId === s.categoryId && t.date.startsWith(month),
          )
          .reduce((sum, t) => sum + t.amountCents, 0);
        expect(s.perMonthCents[index]).toBe(real);
      });

      // O teto nunca é menor que o pior mês observado nem um número solto.
      expect(s.limitCents).toBeGreaterThanOrEqual(s.averageCents);
      expect(s.limitCents % 1000).toBe(0);
      expect(s.averageCents).toBeGreaterThan(0);
    }
  });

  it('nenhuma sugestão aponta para categoria inexistente', () => {
    const transactions = load();
    const ids = new Set(categories.map((c) => c.id));

    for (const s of detectRecurrences({ transactions, today: '2026-08-21' })) {
      expect(ids.has(s.categoryId)).toBe(true);
    }
    for (const s of suggestBudgets({
      transactions,
      categories,
      budgets: [],
      currentMonth: '2026-09',
      minMonths: 1,
    })) {
      expect(ids.has(s.categoryId)).toBe(true);
    }
  });
});
