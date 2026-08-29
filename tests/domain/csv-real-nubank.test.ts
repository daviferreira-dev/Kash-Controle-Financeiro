import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseStatementCsv, statementRowsToTransactions } from '@/domain/csvImport';
import { detectRecurrences } from '@/domain/recurrenceDetection';
import { validateTransaction } from '@/domain/validation';
import { DEFAULT_ACCOUNTS, DEFAULT_CATEGORIES } from '@/storage/seed';
import type { Account, Category } from '@/domain/types';

/**
 * Valida o parser contra um extrato REAL do Nubank, quando existir um em
 * `private/`. O arquivo é pessoal e está no .gitignore — por isso o teste se
 * pula sozinho em qualquer máquina que não o tenha, e nunca imprime conteúdo.
 */
const modelosDir = resolve(process.cwd(), 'private');
const realStatement = existsSync(modelosDir)
  ? readdirSync(modelosDir).find((f) => /^NU_.*\.csv$/i.test(f))
  : undefined;

const categories: Category[] = DEFAULT_CATEGORIES.map((c, i) => ({ ...c, id: `cat-${i}` }));
const account: Account = { ...DEFAULT_ACCOUNTS[0]!, id: 'acc-nubank' };

describe.skipIf(!realStatement)('extrato real do Nubank', () => {
  const content = realStatement ? readFileSync(resolve(modelosDir, realStatement), 'utf8') : '';

  it('lê todas as linhas sem erro', () => {
    const { rows, errors } = parseStatementCsv(content);
    const dataLines = content.split(/\r?\n/).filter((l) => l.trim() !== '').length - 1;

    expect(errors).toEqual([]);
    expect(rows).toHaveLength(dataLines);
  });

  it('todo lançamento tem valor positivo em centavos e tipo coerente', () => {
    const { rows } = parseStatementCsv(content);

    for (const row of rows) {
      expect(Number.isInteger(row.amountCents)).toBe(true);
      expect(row.amountCents).toBeGreaterThan(0);
      expect(['income', 'expense']).toContain(row.type);
      expect(row.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it('todo identificador do banco é preservado e único', () => {
    const { rows } = parseStatementCsv(content);
    const ids = rows.map((r) => r.externalId).filter(Boolean);

    expect(ids).toHaveLength(rows.length);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('os totais batem com a soma independente do arquivo', () => {
    const { rows } = parseStatementCsv(content);

    // Soma feita direto do texto, sem passar pelo parser.
    let expectedIncome = 0;
    let expectedExpense = 0;
    for (const line of content.split(/\r?\n/).slice(1)) {
      if (line.trim() === '') continue;
      const value = Number(line.split(',')[1]);
      if (value < 0) expectedExpense += Math.round(-value * 100);
      else expectedIncome += Math.round(value * 100);
    }

    const income = rows.filter((r) => r.type === 'income').reduce((s, r) => s + r.amountCents, 0);
    const expense = rows.filter((r) => r.type === 'expense').reduce((s, r) => s + r.amountCents, 0);

    expect(income).toBe(expectedIncome);
    expect(expense).toBe(expectedExpense);
  });

  it('todas as transações geradas passam na validação do domínio', () => {
    const { rows } = parseStatementCsv(content);
    const transactions = statementRowsToTransactions({ rows, categories, account });

    for (const transaction of transactions) {
      expect(validateTransaction(transaction)).toEqual([]);
    }
  });

  it('a detecção de padrões roda sobre o extrato real sem quebrar', () => {
    const { rows } = parseStatementCsv(content);
    const now = new Date().toISOString().slice(0, 10);
    const transactions = statementRowsToTransactions({ rows, categories, account }).map(
      (t, i) => ({ ...t, id: `t-${i}`, createdAt: now, updatedAt: now }),
    );

    const suggestions = detectRecurrences({ transactions, today: now });

    // Não afirmamos quantos padrões existem — isso depende dos dados de quem
    // roda. Afirmamos que cada sugestão é internamente coerente.
    for (const s of suggestions) {
      expect(s.occurrences.length).toBeGreaterThanOrEqual(2);
      expect(s.amountCents).toBeGreaterThan(0);
      expect(s.minCents).toBeLessThanOrEqual(s.amountCents);
      expect(s.maxCents).toBeGreaterThanOrEqual(s.amountCents);
      expect(s.confidence).toBeGreaterThan(0);
      expect(s.confidence).toBeLessThanOrEqual(1);
      expect(s.nextDate > s.lastDate).toBe(true);
    }
  });
});
