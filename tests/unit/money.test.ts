import { describe, it, expect } from 'vitest';
import {
  parseBRL,
  formatBRL,
  formatBRLSigned,
  centsToInputValue,
  MAX_AMOUNT_CENTS,
} from '@/lib/money';
import { ValidationError } from '@/lib/errors';

/** Normaliza o espaço não-quebrável (U+00A0) que o Intl insere depois de "R$". */
const NBSP = String.fromCharCode(0x00a0);
const norm = (s: string) => s.split(NBSP).join(' ');

describe('parseBRL', () => {
  it('aceita separador de milhar e vírgula decimal', () => {
    expect(parseBRL('1.234,56')).toBe(123456);
  });

  it('aceita vírgula decimal sem separador de milhar', () => {
    expect(parseBRL('1234,56')).toBe(123456);
  });

  it('aceita ponto como separador decimal', () => {
    expect(parseBRL('1234.56')).toBe(123456);
  });

  it('trata inteiro sem separador decimal', () => {
    expect(parseBRL('1234')).toBe(123400);
  });

  it('trata ponto de milhar sem decimais como parte inteira', () => {
    expect(parseBRL('1.234')).toBe(123400);
  });

  it('completa uma casa decimal isolada', () => {
    expect(parseBRL('10,5')).toBe(1050);
  });

  it('aceita o prefixo R$', () => {
    expect(parseBRL('R$ 42,90')).toBe(4290);
  });

  it('rejeita entrada vazia com o campo do formulário', () => {
    expect(() => parseBRL('   ')).toThrow(ValidationError);
    try {
      parseBRL('');
    } catch (error) {
      expect((error as ValidationError).field).toBe('amountCents');
    }
  });

  it('rejeita entrada não numérica', () => {
    expect(() => parseBRL('abc')).toThrow(ValidationError);
  });

  it('converte o valor do teto sem perda', () => {
    expect(parseBRL('99.999.999,99')).toBe(MAX_AMOUNT_CENTS);
  });
});

describe('formatBRL', () => {
  it('formata no padrão brasileiro', () => {
    expect(norm(formatBRL(123456))).toBe('R$ 1.234,56');
  });

  it('formata zero', () => {
    expect(norm(formatBRL(0))).toBe('R$ 0,00');
  });

  it('formata o teto', () => {
    expect(norm(formatBRL(MAX_AMOUNT_CENTS))).toBe('R$ 99.999.999,99');
  });
});

describe('formatBRLSigned', () => {
  it('prefixa + em receita e − em despesa, para não depender só da cor', () => {
    expect(norm(formatBRLSigned(4290, 'income'))).toBe('+ R$ 42,90');
    expect(norm(formatBRLSigned(4290, 'expense'))).toBe('− R$ 42,90');
  });
});

describe('centsToInputValue', () => {
  it('produz um valor editável no formato brasileiro', () => {
    expect(centsToInputValue(123456)).toBe('1234,56');
    expect(centsToInputValue(5)).toBe('0,05');
  });
});

describe('aritmética em centavos', () => {
  it('soma 1.000 valores sem erro de arredondamento', () => {
    // O caso que motiva a decisão R-001: em float, 1000 × 0,10 não dá 100,00.
    const cents = Array.from({ length: 1000 }, () => parseBRL('0,10'));
    const total = cents.reduce((acc, value) => acc + value, 0);

    expect(total).toBe(10000);
    expect(norm(formatBRL(total))).toBe('R$ 100,00');
  });

  it('soma valores quebrados exatamente', () => {
    const total = parseBRL('0,10') + parseBRL('0,20');
    expect(total).toBe(30);
    expect(norm(formatBRL(total))).toBe('R$ 0,30');
  });
});
