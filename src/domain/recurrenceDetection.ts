import type { IsoDate, Recurrence, RecurrenceFrequency, Transaction, TransactionType } from './types';
import { addDaysToDate, addMonthsClamped, addYearsClamped, partsOf } from '@/lib/date';

/**
 * Detecção de recorrências a partir do histórico (extratos importados ou
 * lançamentos manuais).
 *
 * O problema não é achar lançamentos idênticos — esses são duplicatas, e a
 * importação já os remove. O problema é reconhecer que
 * "Pagamento de boleto efetuado - IMOBILIARIA DANELLI LTDA" em 10/06, 10/07 e
 * 11/08, com valores próximos, é **a mesma conta fixa**.
 *
 * Toda a análise é pura e determinística: recebe as transações e a data de
 * hoje, e devolve sugestões. Nada é criado sem a pessoa confirmar.
 */

export interface RecurrenceSuggestion {
  /** Chave estável do padrão, usada para dispensar a sugestão. */
  key: string;
  /** Nome limpo do destinatário/estabelecimento, para exibição. */
  label: string;
  type: TransactionType;
  frequency: RecurrenceFrequency;
  /** Mediana dos valores observados, em centavos. */
  amountCents: number;
  /** Menor e maior valor observados — revela contas que variam (luz, água). */
  minCents: number;
  maxCents: number;
  /** true quando os valores são praticamente iguais. */
  stableAmount: boolean;
  occurrences: Transaction[];
  firstDate: IsoDate;
  lastDate: IsoDate;
  /** Próxima data esperada, projetada a partir da última ocorrência. */
  nextDate: IsoDate;
  /** 0 a 1. Combina número de ocorrências e regularidade dos intervalos. */
  confidence: number;
  categoryId: string;
  accountId: string;
}

export interface DetectOptions {
  transactions: Transaction[];
  today: IsoDate;
  /** Recorrências já cadastradas — seus padrões não são sugeridos de novo. */
  existingRecurrences?: Recurrence[];
  /** Chaves que a pessoa já dispensou. */
  dismissedKeys?: string[];
  /** Mínimo de ocorrências para sugerir. Padrão 2. */
  minOccurrences?: number;
}

/** Prefixos que o banco usa e que não identificam o destinatário. */
const NOISE_PREFIXES = [
  /^compra\s+no\s+d[eé]bito\s*-\s*/i,
  /^compra\s+no\s+cr[eé]dito\s*-\s*/i,
  /^transfer[eê]ncia\s+enviada(\s+pelo\s+pix)?\s*-\s*/i,
  /^transfer[eê]ncia\s+recebida(\s+pelo\s+pix)?\s*-\s*/i,
  /^pagamento\s+de\s+boleto\s+efetuado\s*-\s*/i,
  /^pagamento\s+efetuado\s*-\s*/i,
  /^d[eé]bito\s+autom[aá]tico\s*-\s*/i,
  /^dep[oó]sito\s*-\s*/i,
  /^pix\s+(enviado|recebido)\s*-\s*/i,
];

/**
 * Reduz a descrição ao destinatário, para agrupar lançamentos que o banco
 * escreve de formas ligeiramente diferentes.
 */
export function normalizeCounterparty(description: string): string {
  let text = description.trim();

  for (const prefix of NOISE_PREFIXES) {
    text = text.replace(prefix, '');
  }

  text = text
    // Corta o rabo do banco: " - Conta: 12345-6", " - Agência: 1"
    .replace(/\s*-\s*(conta|ag[eê]ncia|banco|bco)\s*:?.*$/i, '')
    // CPF/CNPJ, mascarados ou não
    .replace(/[•·•*.\d]{3}\.\d{3}\.\d{3}-[\d•·*]{2}/g, '')
    .replace(/\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}/g, '')
    // Códigos de pedido: "IFOOD *PEDIDO 8213", "UBER *TRIP"
    .replace(/\*/g, ' ')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    // Sequências longas de dígitos são identificadores, não nome
    .replace(/\b\d{3,}\b/g, ' ')
    .replace(/[^A-Z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  // Nomes longos: as primeiras palavras já identificam ("IMOBILIARIA DANELLI
  // LTDA" e "IMOBILIARIA DANELLI" caem no mesmo grupo).
  const words = text.split(' ').filter((w) => w.length > 1 && !STOP_WORDS.has(w));
  return words.slice(0, 3).join(' ');
}

const STOP_WORDS = new Set(['LTDA', 'ME', 'SA', 'EIRELI', 'EPP', 'DE', 'DA', 'DO', 'DOS', 'DAS']);

/** Diferença em dias entre duas datas civis. */
export function daysBetween(from: IsoDate, to: IsoDate): number {
  const a = partsOf(from);
  const b = partsOf(to);
  const ms =
    Date.UTC(b.year, b.month - 1, b.day) - Date.UTC(a.year, a.month - 1, a.day);
  return Math.round(ms / 86_400_000);
}

interface Cadence {
  frequency: RecurrenceFrequency;
  /** 0 a 1: quão regulares são os intervalos. */
  regularity: number;
}

const CADENCE_BUCKETS: Array<{ frequency: RecurrenceFrequency; ideal: number; tolerance: number }> = [
  { frequency: 'weekly', ideal: 7, tolerance: 2 },
  { frequency: 'monthly', ideal: 30, tolerance: 6 },
  { frequency: 'yearly', ideal: 365, tolerance: 30 },
];

/**
 * Classifica os intervalos entre ocorrências numa frequência conhecida.
 * Devolve null quando os intervalos não formam um padrão reconhecível.
 */
export function detectCadence(dates: IsoDate[]): Cadence | null {
  if (dates.length < 2) return null;

  const gaps: number[] = [];
  for (let i = 1; i < dates.length; i++) {
    gaps.push(daysBetween(dates[i - 1]!, dates[i]!));
  }

  let best: Cadence | null = null;

  for (const bucket of CADENCE_BUCKETS) {
    const matching = gaps.filter((g) => Math.abs(g - bucket.ideal) <= bucket.tolerance);
    if (matching.length === 0) continue;

    // Proporção dos intervalos que caem no balde, ponderada pelo desvio médio.
    const share = matching.length / gaps.length;
    const meanDeviation =
      matching.reduce((sum, g) => sum + Math.abs(g - bucket.ideal), 0) / matching.length;
    const tightness = 1 - meanDeviation / (bucket.tolerance + 1);
    const regularity = share * 0.7 + tightness * 0.3;

    if (!best || regularity > best.regularity) {
      best = { frequency: bucket.frequency, regularity };
    }
  }

  // Abaixo disso os intervalos são aleatórios demais para chamar de padrão.
  return best && best.regularity >= 0.5 ? best : null;
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? Math.round((sorted[middle - 1]! + sorted[middle]!) / 2)
    : sorted[middle]!;
}

function projectNext(last: IsoDate, frequency: RecurrenceFrequency, anchorDay: number): IsoDate {
  switch (frequency) {
    case 'weekly':
      return addDaysToDate(last, 7);
    case 'monthly':
      return addMonthsClamped(last, 1, anchorDay);
    case 'yearly':
      return addYearsClamped(last, 1, anchorDay);
  }
}

/** Chave do padrão: destinatário + tipo. Estável entre importações. */
export function patternKey(counterparty: string, type: TransactionType): string {
  return `${type}:${counterparty}`;
}

/**
 * Analisa o histórico e devolve os padrões que parecem recorrências,
 * ordenados por relevância (confiança e valor).
 */
export function detectRecurrences({
  transactions,
  today,
  existingRecurrences = [],
  dismissedKeys = [],
  minOccurrences = 2,
}: DetectOptions): RecurrenceSuggestion[] {
  const dismissed = new Set(dismissedKeys);

  // Padrões já cobertos por uma recorrência cadastrada não são sugeridos.
  const covered = new Set(
    existingRecurrences.map((r) => patternKey(normalizeCounterparty(r.description), r.type)),
  );

  const groups = new Map<string, Transaction[]>();
  for (const transaction of transactions) {
    // Lançamentos gerados por recorrência já são a recorrência.
    if (transaction.source === 'recurrence') continue;

    const counterparty = normalizeCounterparty(transaction.description);
    if (counterparty.length < 3) continue;

    const key = patternKey(counterparty, transaction.type);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(transaction);
  }

  const suggestions: RecurrenceSuggestion[] = [];

  for (const [key, group] of groups) {
    if (group.length < minOccurrences) continue;
    if (dismissed.has(key) || covered.has(key)) continue;

    const ordered = [...group].sort((a, b) => (a.date < b.date ? -1 : 1));

    // Duas ocorrências no mesmo dia são uma compra repetida, não um padrão.
    const uniqueDates = [...new Set(ordered.map((t) => t.date))];
    if (uniqueDates.length < minOccurrences) continue;

    const cadence = detectCadence(uniqueDates);
    if (!cadence) continue;

    const amounts = ordered.map((t) => t.amountCents);
    const amountCents = median(amounts);
    const minCents = Math.min(...amounts);
    const maxCents = Math.max(...amounts);
    // Até 15% de variação ainda é "o mesmo valor" (juros, reajuste pequeno).
    const stableAmount = maxCents <= minCents * 1.15;

    // Mais ocorrências e intervalos mais regulares elevam a confiança;
    // valor instável a reduz, porque pode ser coincidência de destinatário.
    const volume = Math.min(ordered.length / 4, 1);
    const confidence = Math.min(
      cadence.regularity * 0.5 + volume * 0.35 + (stableAmount ? 0.15 : 0),
      1,
    );

    const last = ordered[ordered.length - 1]!;
    const anchorDay = partsOf(ordered[0]!.date).day;

    suggestions.push({
      key,
      label: titleCase(key.split(':')[1]!),
      type: last.type,
      frequency: cadence.frequency,
      amountCents,
      minCents,
      maxCents,
      stableAmount,
      occurrences: ordered,
      firstDate: ordered[0]!.date,
      lastDate: last.date,
      nextDate: projectNext(last.date, cadence.frequency, anchorDay),
      confidence,
      categoryId: last.categoryId,
      accountId: last.accountId,
    });
  }

  return suggestions.sort((a, b) => {
    if (Math.abs(b.confidence - a.confidence) > 0.05) return b.confidence - a.confidence;
    return b.amountCents * b.occurrences.length - a.amountCents * a.occurrences.length;
  });

  void today;
}

function titleCase(text: string): string {
  return text
    .toLowerCase()
    .split(' ')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

/** Rótulo legível da frequência. */
export const FREQUENCY_LABEL: Record<RecurrenceFrequency, string> = {
  weekly: 'Semanal',
  monthly: 'Mensal',
  yearly: 'Anual',
};

/** Faixa de confiança, para a UI não expor um número cru. */
export function confidenceLabel(confidence: number): string {
  if (confidence >= 0.75) return 'Padrão claro';
  if (confidence >= 0.55) return 'Provável';
  return 'Possível';
}
