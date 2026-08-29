import type { Account, Category, IsoDate, NewTransaction, TransactionType } from './types';
import { isValidIsoDate } from '@/lib/date';

/**
 * Importação de extrato em CSV (Nubank e formatos equivalentes).
 *
 * Diferente do backup JSON, aqui a origem é externa e imperfeita: colunas em
 * ordem variável, valores com vírgula ou ponto, linhas em branco. O parser é
 * tolerante na entrada e rígido na saída — uma linha que não vira uma
 * transação válida é reportada, nunca adivinhada.
 */

/** Uma linha do extrato, já normalizada mas ainda não convertida. */
export interface StatementRow {
  date: IsoDate;
  /** Inteiro em centavos, sempre positivo. O sinal vira `type`. */
  amountCents: number;
  type: TransactionType;
  description: string;
  /** Id do banco, quando existe. É a chave de de-duplicação exata. */
  externalId: string | null;
  /** Número da linha no arquivo, para a mensagem de erro. */
  line: number;
}

export interface ParseError {
  line: number;
  message: string;
  /** Conteúdo cru, para a pessoa localizar a linha no arquivo. */
  raw: string;
}

export interface ParseResult {
  rows: StatementRow[];
  errors: ParseError[];
}

/** Divide uma linha de CSV respeitando aspas e vírgulas dentro delas. */
export function splitCsvLine(line: string, separator: string): string[] {
  const fields: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === separator && !inQuotes) {
      fields.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  fields.push(current);
  return fields.map((f) => f.trim());
}

/** Vírgula ou ponto e vírgula, o que aparecer mais no cabeçalho. */
function detectSeparator(headerLine: string): string {
  const commas = (headerLine.match(/,/g) || []).length;
  const semicolons = (headerLine.match(/;/g) || []).length;
  return semicolons > commas ? ';' : ',';
}

function normalizeHeader(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z]/g, '');
}

/** Aceita "01/08/2026", "2026-08-01" e "01-08-2026". */
export function parseStatementDate(input: string): IsoDate | null {
  const value = input.trim();

  const br = /^(\d{2})[/-](\d{2})[/-](\d{4})$/.exec(value);
  if (br) {
    const iso = `${br[3]}-${br[2]}-${br[1]}`;
    return isValidIsoDate(iso) ? iso : null;
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return isValidIsoDate(value) ? value : null;
  }

  return null;
}

/**
 * Converte o valor do extrato em centavos com sinal.
 *
 * O extrato usa ponto decimal ("-43.10"), mas planilhas brasileiras exportam
 * com vírgula ("-43,10") — os dois são aceitos. O separador decimal é o
 * último ponto ou vírgula seguido de 1 ou 2 dígitos.
 */
export function parseStatementAmount(input: string): number | null {
  const raw = input.trim().replace(/\s/g, '').replace(/^R\$/i, '');
  if (raw === '') return null;

  const negative = raw.startsWith('-') || /^\(.*\)$/.test(raw);
  const digits = raw.replace(/[()+-]/g, '');
  if (!/^[\d.,]+$/.test(digits) || digits === '') return null;

  const lastSep = Math.max(digits.lastIndexOf(','), digits.lastIndexOf('.'));
  const decimals = lastSep === -1 ? 0 : digits.length - lastSep - 1;

  let integerPart: string;
  let decimalPart: string;
  if (lastSep !== -1 && decimals >= 1 && decimals <= 2) {
    integerPart = digits.slice(0, lastSep).replace(/[.,]/g, '');
    decimalPart = digits.slice(lastSep + 1).padEnd(2, '0');
  } else {
    integerPart = digits.replace(/[.,]/g, '');
    decimalPart = '00';
  }

  const cents = Number(integerPart || '0') * 100 + Number(decimalPart);
  if (!Number.isFinite(cents)) return null;
  return negative ? -cents : cents;
}

const HEADER_ALIASES = {
  date: ['data', 'datalancamento', 'datadatransacao', 'date'],
  amount: ['valor', 'valorrs', 'amount', 'quantia'],
  description: ['descricao', 'description', 'historico', 'lancamento', 'detalhes', 'titulo'],
  externalId: ['identificador', 'id', 'idtransacao', 'fitid'],
} as const;

function findColumn(headers: string[], aliases: readonly string[]): number {
  return headers.findIndex((h) => aliases.includes(h));
}

/**
 * Lê um CSV de extrato. Reconhece o cabeçalho pelo nome das colunas, então
 * funciona com a ordem que o banco usar.
 */
export function parseStatementCsv(content: string): ParseResult {
  const rows: StatementRow[] = [];
  const errors: ParseError[] = [];

  // Remove BOM, que o Excel adiciona e quebraria o nome da primeira coluna.
  const text = content.replace(/^\uFEFF/, '');
  const lines = text.split(/\r?\n/);

  const headerIndex = lines.findIndex((l) => l.trim() !== '');
  if (headerIndex === -1) {
    return { rows, errors: [{ line: 1, message: 'O arquivo está vazio.', raw: '' }] };
  }

  const separator = detectSeparator(lines[headerIndex]!);
  const headers = splitCsvLine(lines[headerIndex]!, separator).map(normalizeHeader);

  const dateCol = findColumn(headers, HEADER_ALIASES.date);
  const amountCol = findColumn(headers, HEADER_ALIASES.amount);
  const descriptionCol = findColumn(headers, HEADER_ALIASES.description);
  const externalIdCol = findColumn(headers, HEADER_ALIASES.externalId);

  const missing: string[] = [];
  if (dateCol === -1) missing.push('Data');
  if (amountCol === -1) missing.push('Valor');
  if (descriptionCol === -1) missing.push('Descrição');

  if (missing.length > 0) {
    return {
      rows,
      errors: [
        {
          line: headerIndex + 1,
          message: `Não encontrei a(s) coluna(s): ${missing.join(', ')}. O cabeçalho lido foi: ${lines[headerIndex]!.trim()}`,
          raw: lines[headerIndex]!,
        },
      ],
    };
  }

  for (let i = headerIndex + 1; i < lines.length; i++) {
    const raw = lines[i]!;
    if (raw.trim() === '') continue;

    const lineNumber = i + 1;
    const fields = splitCsvLine(raw, separator);

    const date = parseStatementDate(fields[dateCol] ?? '');
    if (!date) {
      errors.push({ line: lineNumber, message: `Data inválida: "${fields[dateCol] ?? ''}"`, raw });
      continue;
    }

    const signed = parseStatementAmount(fields[amountCol] ?? '');
    if (signed === null) {
      errors.push({ line: lineNumber, message: `Valor inválido: "${fields[amountCol] ?? ''}"`, raw });
      continue;
    }
    if (signed === 0) {
      errors.push({ line: lineNumber, message: 'Valor zerado — linha ignorada.', raw });
      continue;
    }

    const description = (fields[descriptionCol] ?? '').trim();
    if (description === '') {
      errors.push({ line: lineNumber, message: 'Descrição vazia.', raw });
      continue;
    }

    const externalId = externalIdCol === -1 ? null : (fields[externalIdCol] ?? '').trim() || null;

    rows.push({
      date,
      amountCents: Math.abs(signed),
      type: signed < 0 ? 'expense' : 'income',
      description: description.slice(0, 120),
      externalId,
      line: lineNumber,
    });
  }

  return { rows, errors };
}

/**
 * Palavras que sugerem uma categoria. A classificação é um palpite útil, não
 * uma verdade: a pessoa revisa e corrige depois na lista de transações.
 */
const CATEGORY_HINTS: Array<{ category: string; patterns: RegExp }> = [
  {
    category: 'Alimentação',
    patterns:
      /ifood|rappi|restaurante|lanchonete|padaria|pizza|burger|mercado|supermercado|nagumo|carrefour|assai|atacad|hortifruti|acougue|cafe|bar\b|food/i,
  },
  {
    category: 'Transporte',
    patterns: /uber|99app|99\s?pop|cabify|posto|combustivel|gasolina|shell|ipiranga|estacionamento|metro|onibus|passagem|taxi/i,
  },
  {
    category: 'Moradia',
    patterns: /aluguel|condominio|imobiliaria|energia|eletropaulo|enel|cpfl|sabesp|agua|gas\b|internet|vivo|claro|tim\b|telefonica|net\b/i,
  },
  {
    category: 'Saúde',
    patterns: /farmacia|drogaria|drogasil|raia|pague\s?menos|hospital|clinica|odontolog|dentist|laborator|exame|unimed|amil|psicolog/i,
  },
  {
    category: 'Educação',
    patterns: /escola|colegio|faculdade|universidade|curso|udemy|alura|livraria|mensalidade/i,
  },
  {
    category: 'Assinaturas',
    patterns: /netflix|spotify|amazon\s?prime|disney|hbo|max\b|youtube|globoplay|apple\.com|google\s?one|assinatura|icloud/i,
  },
  {
    category: 'Lazer',
    patterns: /cinema|ingresso|teatro|show|steam|playstation|xbox|nintendo|viagem|hotel|airbnb|booking/i,
  },
];

/**
 * Sugere uma categoria a partir da descrição. Cai em "Outros" quando não
 * reconhece — nunca chuta uma categoria específica sem evidência.
 */
export function suggestCategoryId(description: string, categories: Category[]): string {
  const active = categories.filter((c) => !c.archived);
  const byName = (name: string) => active.find((c) => c.name === name);

  for (const hint of CATEGORY_HINTS) {
    if (hint.patterns.test(description)) {
      const match = byName(hint.category);
      if (match) return match.id;
    }
  }

  return (byName('Outros') ?? active[0])?.id ?? '';
}

export interface ToTransactionsOptions {
  rows: StatementRow[];
  categories: Category[];
  account: Account;
}

/**
 * Converte as linhas em transações do Kash.
 *
 * O `externalId` do banco vai para as observações: é o que permite conferir
 * um lançamento contra o extrato depois, e serve de chave de de-duplicação.
 */
export function statementRowsToTransactions({
  rows,
  categories,
  account,
}: ToTransactionsOptions): NewTransaction[] {
  return rows.map((row) => ({
    type: row.type,
    amountCents: row.amountCents,
    description: row.description,
    date: row.date,
    categoryId: suggestCategoryId(row.description, categories),
    accountId: account.id,
    notes: row.externalId ? `Extrato ${account.name} · id ${row.externalId}` : `Extrato ${account.name}`,
    source: 'manual',
    sourceRecurrenceId: null,
    occurrenceDate: null,
  }));
}

/** Chave de de-duplicação: id do banco quando houver, senão data+valor+descrição. */
export function dedupeKey(row: {
  externalId?: string | null;
  date: string;
  amountCents: number;
  type: TransactionType;
  description: string;
}): string {
  if (row.externalId) return `id:${row.externalId}`;
  return `nat:${row.date}|${row.type}|${row.amountCents}|${row.description.trim().toLowerCase()}`;
}
