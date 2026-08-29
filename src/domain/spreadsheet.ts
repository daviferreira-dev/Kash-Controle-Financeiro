import type { Account, Category, Transaction } from './types';
import { formatBR } from '@/lib/date';

/**
 * Exporta os lançamentos como uma planilha CSV para abrir no Excel ou no
 * Google Sheets.
 *
 * Decisões de formato, todas para o arquivo "simplesmente abrir" no Brasil:
 * - separador `;` (o padrão do Excel em pt-BR);
 * - valores com vírgula decimal e sinal (`-42,90`), para o Excel tratar como
 *   número e a soma da coluna já sair certa;
 * - data em `DD/MM/AAAA` e uma coluna `Mês` (`AAAA-MM`) para filtrar e agrupar;
 * - uma coluna `Saldo acumulado`, para ler como um extrato;
 * - o BOM UTF-8 é adicionado por quem gera o arquivo (fora daqui), para os
 *   acentos não saírem quebrados no Excel.
 */

const HEADERS = [
  'Data',
  'Mês',
  'Tipo',
  'Categoria',
  'Conta',
  'Descrição',
  'Valor',
  'Saldo acumulado',
  'Observações',
];

/** Envolve em aspas só quando o campo tem `;`, aspas ou quebra de linha. */
function csvField(value: string): string {
  if (/[";\r\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

/** 4290 -> "42,90"; -4290 -> "-42,90". */
function centsToSheet(cents: number): string {
  return (cents / 100).toFixed(2).replace('.', ',');
}

export function transactionsToCsv(
  transactions: Transaction[],
  categories: Category[],
  accounts: Account[],
): string {
  const categoryName = new Map(categories.map((c) => [c.id, c.name]));
  const accountName = new Map(accounts.map((a) => [a.id, a.name]));

  const sorted = [...transactions].sort((a, b) =>
    a.date === b.date ? a.createdAt.localeCompare(b.createdAt) : a.date.localeCompare(b.date),
  );

  // O saldo acumulado parte do saldo inicial somado de todas as contas, para
  // a última linha bater com o "saldo acumulado" da Visão geral.
  let running = accounts.reduce((sum, a) => sum + a.initialBalanceCents, 0);

  const rows = sorted.map((t) => {
    running += t.type === 'income' ? t.amountCents : -t.amountCents;
    return [
      formatBR(t.date),
      t.date.slice(0, 7),
      t.type === 'income' ? 'Receita' : 'Despesa',
      categoryName.get(t.categoryId) ?? '(categoria removida)',
      accountName.get(t.accountId) ?? '(conta removida)',
      t.description,
      centsToSheet(t.type === 'income' ? t.amountCents : -t.amountCents),
      centsToSheet(running),
      t.notes ?? '',
    ]
      .map((field) => csvField(String(field)))
      .join(';');
  });

  return [HEADERS.join(';'), ...rows].join('\r\n') + '\r\n';
}
