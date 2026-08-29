import type { IsoDate, NewTransaction, Recurrence } from './types';
import { addDaysToDate, addMonthsClamped, addYearsClamped, partsOf } from '@/lib/date';
import type { KashDatabase } from '@/storage/repository';

/**
 * Engine de recorrências (decisão R-005).
 *
 * `computePendingOccurrences` é pura e recebe `today` por parâmetro — é o que
 * torna testável "abrir o app em 29/08/2026" sem mockar o relógio global.
 */

export interface GenerateOccurrencesInput {
  recurrence: Recurrence;
  today: IsoDate;
}

export interface GeneratedOccurrence {
  occurrenceDate: IsoDate;
}

/** Teto de segurança contra uma recorrência com início absurdamente antigo. */
const MAX_OCCURRENCES_PER_RUN = 1000;

/** Avança uma data conforme a frequência, preservando o dia-âncora. */
function nextOccurrence(date: IsoDate, recurrence: Recurrence, anchorDay: number): IsoDate {
  switch (recurrence.frequency) {
    case 'weekly':
      return addDaysToDate(date, 7);
    case 'monthly':
      return addMonthsClamped(date, 1, anchorDay);
    case 'yearly':
      return addYearsClamped(date, 1, anchorDay);
  }
}

/**
 * Datas teóricas ainda não materializadas, até `today` inclusive.
 *
 * Nada é retornado para recorrências pausadas, para datas futuras (FR-022) ou
 * além de `endDate`.
 */
export function computePendingOccurrences({
  recurrence,
  today,
}: GenerateOccurrencesInput): GeneratedOccurrence[] {
  if (recurrence.status !== 'active') return [];

  const anchorDay = partsOf(recurrence.startDate).day;
  const occurrences: GeneratedOccurrence[] = [];

  // Ponto de partida: o início, ou a ocorrência seguinte à última gerada.
  let cursor: IsoDate =
    recurrence.lastGeneratedDate === null
      ? recurrence.startDate
      : nextOccurrence(recurrence.lastGeneratedDate, recurrence, anchorDay);

  while (cursor <= today && occurrences.length < MAX_OCCURRENCES_PER_RUN) {
    if (recurrence.endDate !== null && cursor > recurrence.endDate) break;
    occurrences.push({ occurrenceDate: cursor });
    cursor = nextOccurrence(cursor, recurrence, anchorDay);
  }

  return occurrences;
}

export interface RunRecurrencesResult {
  createdCount: number;
  byRecurrence: Record<string, number>;
}

/**
 * Materializa as ocorrências vencidas de todas as recorrências ativas.
 *
 * A idempotência (FR-021) vem da chave determinística
 * (`sourceRecurrenceId`, `occurrenceDate`), verificada antes de inserir: só o
 * `lastGeneratedDate` não bastaria, porque duas abas abertas no mesmo
 * localStorage duplicariam os lançamentos.
 */
export async function runRecurrences(
  db: KashDatabase,
  today: IsoDate,
): Promise<RunRecurrencesResult> {
  const active = await db.recurrences.listActive();
  const byRecurrence: Record<string, number> = {};
  let createdCount = 0;

  for (const recurrence of active) {
    const pending = computePendingOccurrences({ recurrence, today });
    if (pending.length === 0) continue;

    const toCreate: NewTransaction[] = [];

    for (const { occurrenceDate } of pending) {
      const existing = await db.transactions.findByOccurrence(recurrence.id, occurrenceDate);
      if (existing) continue;

      toCreate.push({
        type: recurrence.type,
        amountCents: recurrence.amountCents,
        description: recurrence.description,
        date: occurrenceDate,
        categoryId: recurrence.categoryId,
        accountId: recurrence.accountId,
        notes: recurrence.notes,
        source: 'recurrence',
        sourceRecurrenceId: recurrence.id,
        occurrenceDate,
      });
    }

    if (toCreate.length > 0) {
      await db.transactions.createMany(toCreate);
      createdCount += toCreate.length;
      byRecurrence[recurrence.id] = toCreate.length;
    }

    // O cursor avança mesmo quando tudo já existia, para que a próxima
    // execução não reprocesse o mesmo intervalo.
    const last = pending[pending.length - 1]!.occurrenceDate;
    if (last !== recurrence.lastGeneratedDate) {
      await db.recurrences.markGenerated(recurrence.id, last);
    }
  }

  return { createdCount, byRecurrence };
}

/** Próxima data em que a recorrência vai gerar um lançamento, para exibição. */
export function nextOccurrenceDate(recurrence: Recurrence, today: IsoDate): IsoDate | null {
  if (recurrence.status !== 'active') return null;

  const anchorDay = partsOf(recurrence.startDate).day;
  let cursor: IsoDate =
    recurrence.lastGeneratedDate === null
      ? recurrence.startDate
      : nextOccurrence(recurrence.lastGeneratedDate, recurrence, anchorDay);

  let guard = 0;
  while (cursor <= today && guard < MAX_OCCURRENCES_PER_RUN) {
    cursor = nextOccurrence(cursor, recurrence, anchorDay);
    guard += 1;
  }

  if (recurrence.endDate !== null && cursor > recurrence.endDate) return null;
  return cursor;
}
