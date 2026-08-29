import { ValidationError } from './errors';
import type { TransactionType } from '@/domain/types';

/**
 * Todo valor monetário é um inteiro em centavos (decisão R-001).
 *
 * Somar floats acumula erro de IEEE-754 e faz um orçamento "estourar" por
 * R$ 0,01 depois de algumas centenas de lançamentos. Inteiros eliminam a
 * classe inteira de bugs e serializam em JSON sem perda.
 */

/** R$ 99.999.999,99 — teto de FR-003, acima do qual a formatação quebraria. */
export const MAX_AMOUNT_CENTS = 9_999_999_999;

const BRL_FORMATTER = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/**
 * Converte a entrada do usuário em centavos.
 *
 * Aceita "1.234,56", "1234,56", "1234.56" e "1234". A heurística: o último
 * separador presente é o decimal quando sobram 1 ou 2 dígitos depois dele;
 * os demais são separadores de milhar e são descartados.
 *
 * @throws {ValidationError} para entrada vazia ou não numérica.
 */
export function parseBRL(input: string): number {
  const raw = input.trim().replace(/^R\$\s*/i, '');
  if (raw === '') {
    throw new ValidationError('Informe um valor', 'amountCents');
  }
  if (!/^[\d.,]+$/.test(raw)) {
    throw new ValidationError('Valor inválido', 'amountCents');
  }

  const lastComma = raw.lastIndexOf(',');
  const lastDot = raw.lastIndexOf('.');
  const sepIndex = Math.max(lastComma, lastDot);

  let integerPart: string;
  let decimalPart: string;

  const decimalDigits = sepIndex === -1 ? 0 : raw.length - sepIndex - 1;
  if (sepIndex !== -1 && decimalDigits >= 1 && decimalDigits <= 2) {
    integerPart = raw.slice(0, sepIndex).replace(/[.,]/g, '');
    decimalPart = raw.slice(sepIndex + 1);
  } else {
    // Sem separador decimal: tudo é parte inteira ("1.234" são mil duzentos e trinta e quatro).
    integerPart = raw.replace(/[.,]/g, '');
    decimalPart = '';
  }

  if (integerPart === '' && decimalPart === '') {
    throw new ValidationError('Valor inválido', 'amountCents');
  }

  const cents =
    Number(integerPart || '0') * 100 + Number(decimalPart.padEnd(2, '0').slice(0, 2) || '0');

  if (!Number.isFinite(cents)) {
    throw new ValidationError('Valor inválido', 'amountCents');
  }
  return cents;
}

/** 123456 -> "R$ 1.234,56" (FR-006). */
export function formatBRL(cents: number): string {
  return BRL_FORMATTER.format(cents / 100);
}

/**
 * Prefixa o sinal conforme o tipo, para que receita e despesa se distingam
 * sem depender apenas da cor (FR-007).
 */
export function formatBRLSigned(cents: number, type: TransactionType): string {
  const sign = type === 'income' ? '+' : '−';
  return `${sign} ${formatBRL(Math.abs(cents))}`;
}

/** Formata em centavos para preencher um input de edição ("1234,56"). */
export function centsToInputValue(cents: number): string {
  const abs = Math.abs(cents);
  return `${Math.floor(abs / 100)},${String(abs % 100).padStart(2, '0')}`;
}
