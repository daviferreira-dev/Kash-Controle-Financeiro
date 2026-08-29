import type { IsoDate, IsoMonth } from '@/domain/types';
import { ValidationError } from './errors';

/**
 * Datas civis como string 'YYYY-MM-DD' (decisão R-002).
 *
 * Um lançamento financeiro é uma data, não um instante. Guardar timestamp faz
 * a despesa do dia 01 aparecer no dia 31 do mês anterior em UTC-3. A string
 * também ordena lexicograficamente na ordem cronológica, o que torna filtro
 * por mês e ordenação operações baratas de string.
 *
 * Nenhuma função aqui constrói Date a partir de string sem fuso explícito:
 * usamos sempre os componentes numéricos e Date.UTC.
 */

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const BR_DATE_RE = /^(\d{2})\/(\d{2})\/(\d{4})$/;

const MONTH_NAMES = [
  'Janeiro',
  'Fevereiro',
  'Março',
  'Abril',
  'Maio',
  'Junho',
  'Julho',
  'Agosto',
  'Setembro',
  'Outubro',
  'Novembro',
  'Dezembro',
] as const;

function pad(value: number, size = 2): string {
  return String(value).padStart(size, '0');
}

function toIso(year: number, month: number, day: number): IsoDate {
  return `${pad(year, 4)}-${pad(month)}-${pad(day)}`;
}

/** Decompõe 'YYYY-MM-DD' em componentes numéricos, sem passar por Date. */
export function partsOf(date: IsoDate): { year: number; month: number; day: number } {
  if (!ISO_DATE_RE.test(date)) {
    throw new ValidationError(`Data inválida: ${date}`, 'date');
  }
  return {
    year: Number(date.slice(0, 4)),
    month: Number(date.slice(5, 7)),
    day: Number(date.slice(8, 10)),
  };
}

/** Quantidade de dias do mês, respeitando ano bissexto. */
export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function isValidIsoDate(value: string): boolean {
  if (!ISO_DATE_RE.test(value)) return false;
  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(5, 7));
  const day = Number(value.slice(8, 10));
  if (month < 1 || month > 12) return false;
  if (day < 1 || day > daysInMonth(year, month)) return false;
  return true;
}

/** Data de hoje pelo relógio local do dispositivo. */
export function today(): IsoDate {
  const now = new Date();
  return toIso(now.getFullYear(), now.getMonth() + 1, now.getDate());
}

/** '2026-08-29' -> '29/08/2026' (FR-006). */
export function formatBR(date: IsoDate): string {
  const { year, month, day } = partsOf(date);
  return `${pad(day)}/${pad(month)}/${pad(year, 4)}`;
}

/** '29/08/2026' -> '2026-08-29'. */
export function parseBR(input: string): IsoDate {
  const match = BR_DATE_RE.exec(input.trim());
  if (!match) {
    throw new ValidationError('Data inválida. Use DD/MM/AAAA', 'date');
  }
  const iso = `${match[3]}-${match[2]}-${match[1]}`;
  if (!isValidIsoDate(iso)) {
    throw new ValidationError('Data inválida', 'date');
  }
  return iso;
}

export function monthOf(date: IsoDate): IsoMonth {
  return date.slice(0, 7);
}

/** Mês corrente pelo relógio local. */
export function currentMonth(): IsoMonth {
  return monthOf(today());
}

export function firstDayOfMonth(month: IsoMonth): IsoDate {
  return `${month}-01`;
}

export function lastDayOfMonth(month: IsoMonth): IsoDate {
  const year = Number(month.slice(0, 4));
  const monthNumber = Number(month.slice(5, 7));
  return `${month}-${pad(daysInMonth(year, monthNumber))}`;
}

/** Desloca um mês 'YYYY-MM' por `delta` meses (pode ser negativo). */
export function addMonths(month: IsoMonth, delta: number): IsoMonth {
  const year = Number(month.slice(0, 4));
  const monthNumber = Number(month.slice(5, 7));
  const zeroBased = year * 12 + (monthNumber - 1) + delta;
  return `${pad(Math.floor(zeroBased / 12), 4)}-${pad((zeroBased % 12) + 1)}`;
}

export function addDaysToDate(date: IsoDate, days: number): IsoDate {
  const { year, month, day } = partsOf(date);
  const shifted = new Date(Date.UTC(year, month - 1, day + days));
  return toIso(shifted.getUTCFullYear(), shifted.getUTCMonth() + 1, shifted.getUTCDate());
}

/**
 * Soma meses preservando o dia-âncora e fazendo clamp no último dia do mês
 * quando ele não existe (FR-025).
 *
 * O `anchorDay` é o dia original da recorrência, não o dia da data recebida.
 * É o que faz 31/01 → 28/02 → 31/03, em vez de arrastar para 28/03.
 */
export function addMonthsClamped(date: IsoDate, months: number, anchorDay: number): IsoDate {
  const { year, month } = partsOf(date);
  const zeroBased = year * 12 + (month - 1) + months;
  const targetYear = Math.floor(zeroBased / 12);
  const targetMonth = (zeroBased % 12) + 1;
  const day = Math.min(anchorDay, daysInMonth(targetYear, targetMonth));
  return toIso(targetYear, targetMonth, day);
}

/** Soma anos com o mesmo clamp — resolve 29/02 em ano não bissexto. */
export function addYearsClamped(date: IsoDate, years: number, anchorDay: number): IsoDate {
  const { year, month } = partsOf(date);
  const targetYear = year + years;
  const day = Math.min(anchorDay, daysInMonth(targetYear, month));
  return toIso(targetYear, month, day);
}

/** '2026-08' -> 'Agosto de 2026'. */
export function formatMonthLabel(month: IsoMonth): string {
  const year = month.slice(0, 4);
  const index = Number(month.slice(5, 7)) - 1;
  return `${MONTH_NAMES[index] ?? month} de ${year}`;
}

/** true se `date` cai dentro de `month`. */
export function isInMonth(date: IsoDate, month: IsoMonth): boolean {
  return date.startsWith(month);
}
