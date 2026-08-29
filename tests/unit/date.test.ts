import { describe, it, expect } from 'vitest';
import {
  addDaysToDate,
  addMonths,
  addMonthsClamped,
  addYearsClamped,
  daysInMonth,
  firstDayOfMonth,
  formatBR,
  formatMonthLabel,
  isInMonth,
  isValidIsoDate,
  lastDayOfMonth,
  monthOf,
  parseBR,
} from '@/lib/date';
import { ValidationError } from '@/lib/errors';

describe('formatBR / parseBR', () => {
  it('converte ISO para o formato brasileiro', () => {
    expect(formatBR('2026-08-29')).toBe('29/08/2026');
  });

  it('converte o formato brasileiro para ISO', () => {
    expect(parseBR('29/08/2026')).toBe('2026-08-29');
  });

  it('rejeita data inexistente', () => {
    expect(() => parseBR('31/02/2026')).toThrow(ValidationError);
  });

  it('rejeita formato inválido', () => {
    expect(() => parseBR('2026-08-29')).toThrow(ValidationError);
  });
});

describe('isValidIsoDate', () => {
  it('aceita datas reais', () => {
    expect(isValidIsoDate('2026-08-29')).toBe(true);
    expect(isValidIsoDate('2024-02-29')).toBe(true); // bissexto
  });

  it('rejeita datas impossíveis', () => {
    expect(isValidIsoDate('2026-02-29')).toBe(false); // não bissexto
    expect(isValidIsoDate('2026-13-01')).toBe(false);
    expect(isValidIsoDate('2026-04-31')).toBe(false);
    expect(isValidIsoDate('29/08/2026')).toBe(false);
  });
});

describe('daysInMonth', () => {
  it('conhece os meses curtos e o ano bissexto', () => {
    expect(daysInMonth(2026, 2)).toBe(28);
    expect(daysInMonth(2024, 2)).toBe(29);
    expect(daysInMonth(2026, 4)).toBe(30);
    expect(daysInMonth(2026, 12)).toBe(31);
  });
});

describe('limites de mês', () => {
  it('calcula primeiro e último dia', () => {
    expect(firstDayOfMonth('2026-02')).toBe('2026-02-01');
    expect(lastDayOfMonth('2026-02')).toBe('2026-02-28');
    expect(lastDayOfMonth('2024-02')).toBe('2024-02-29');
    expect(lastDayOfMonth('2026-08')).toBe('2026-08-31');
  });

  it('extrai o mês de uma data', () => {
    expect(monthOf('2026-08-29')).toBe('2026-08');
  });

  it('reconhece se a data cai no mês', () => {
    expect(isInMonth('2026-08-29', '2026-08')).toBe(true);
    expect(isInMonth('2026-09-01', '2026-08')).toBe(false);
  });
});

describe('addMonths', () => {
  it('avança e retrocede atravessando a virada de ano', () => {
    expect(addMonths('2026-08', 1)).toBe('2026-09');
    expect(addMonths('2026-12', 1)).toBe('2027-01');
    expect(addMonths('2026-01', -1)).toBe('2025-12');
    expect(addMonths('2026-08', 12)).toBe('2027-08');
  });
});

describe('addDaysToDate', () => {
  it('soma dias atravessando meses e anos', () => {
    expect(addDaysToDate('2026-08-29', 7)).toBe('2026-09-05');
    expect(addDaysToDate('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDaysToDate('2024-02-28', 1)).toBe('2024-02-29');
  });

  it('não desloca a data por causa de fuso (UTC-3)', () => {
    // O bug clássico: construir Date a partir de string e perder um dia.
    expect(addDaysToDate('2026-08-01', 0)).toBe('2026-08-01');
    expect(addDaysToDate('2026-01-01', 0)).toBe('2026-01-01');
  });
});

describe('addMonthsClamped (FR-025)', () => {
  it('faz clamp no último dia quando o dia não existe no mês', () => {
    expect(addMonthsClamped('2026-01-31', 1, 31)).toBe('2026-02-28');
    expect(addMonthsClamped('2026-03-31', 1, 31)).toBe('2026-04-30');
  });

  it('preserva o dia-âncora nos meses seguintes, sem arrastar para trás', () => {
    // A sequência que a User Story 4 exige: 31/01 -> 28/02 -> 31/03.
    const jan = '2026-01-31';
    const fev = addMonthsClamped(jan, 1, 31);
    const mar = addMonthsClamped(fev, 1, 31);

    expect(fev).toBe('2026-02-28');
    expect(mar).toBe('2026-03-31');
  });

  it('mantém o dia quando ele existe no mês de destino', () => {
    expect(addMonthsClamped('2026-06-05', 1, 5)).toBe('2026-07-05');
  });

  it('atravessa a virada de ano', () => {
    expect(addMonthsClamped('2026-12-15', 1, 15)).toBe('2027-01-15');
  });

  it('usa o fevereiro bissexto quando disponível', () => {
    expect(addMonthsClamped('2024-01-31', 1, 31)).toBe('2024-02-29');
  });
});

describe('addYearsClamped', () => {
  it('faz clamp de 29/02 em ano não bissexto', () => {
    expect(addYearsClamped('2024-02-29', 1, 29)).toBe('2025-02-28');
  });

  it('mantém 29/02 quando o destino é bissexto', () => {
    expect(addYearsClamped('2024-02-29', 4, 29)).toBe('2028-02-29');
  });

  it('preserva datas comuns', () => {
    expect(addYearsClamped('2026-08-29', 1, 29)).toBe('2027-08-29');
  });
});

describe('formatMonthLabel', () => {
  it('escreve o mês por extenso em português', () => {
    expect(formatMonthLabel('2026-08')).toBe('Agosto de 2026');
    expect(formatMonthLabel('2026-03')).toBe('Março de 2026');
    expect(formatMonthLabel('2026-12')).toBe('Dezembro de 2026');
  });
});

describe('ordenação lexicográfica', () => {
  it('ordena datas ISO como strings na ordem cronológica', () => {
    const dates = ['2026-09-01', '2026-08-29', '2025-12-31', '2026-08-05'];
    expect([...dates].sort()).toEqual([
      '2025-12-31',
      '2026-08-05',
      '2026-08-29',
      '2026-09-01',
    ]);
  });
});
