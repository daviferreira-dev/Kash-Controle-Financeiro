import { describe, it, expect } from 'vitest';
import { computePendingOccurrences, nextOccurrenceDate } from '@/domain/recurrence';
import type { Recurrence } from '@/domain/types';

function recurrence(overrides: Partial<Recurrence> = {}): Recurrence {
  return {
    id: 'rec-1',
    type: 'expense',
    amountCents: 150000,
    description: 'Aluguel',
    categoryId: 'cat-moradia',
    accountId: 'acc-itau',
    notes: null,
    frequency: 'monthly',
    startDate: '2026-06-05',
    endDate: null,
    status: 'active',
    lastGeneratedDate: null,
    createdAt: '2026-06-01T00:00:00.000Z',
    updatedAt: '2026-06-01T00:00:00.000Z',
    ...overrides,
  };
}

const dates = (r: Recurrence, today: string) =>
  computePendingOccurrences({ recurrence: r, today }).map((o) => o.occurrenceDate);

describe('computePendingOccurrences — mensal', () => {
  it('gera as ocorrências vencidas e nenhuma futura (FR-022)', () => {
    // Cenário 1 da User Story 4: início 05/06, hoje 29/08.
    expect(dates(recurrence(), '2026-08-29')).toEqual(['2026-06-05', '2026-07-05', '2026-08-05']);
  });

  it('inclui a ocorrência que cai exatamente hoje', () => {
    expect(dates(recurrence(), '2026-06-05')).toEqual(['2026-06-05']);
  });

  it('não gera nada quando o início ainda não chegou', () => {
    expect(dates(recurrence(), '2026-06-04')).toEqual([]);
  });

  it('retoma de lastGeneratedDate sem repetir o que já foi gerado', () => {
    const r = recurrence({ lastGeneratedDate: '2026-07-05' });
    expect(dates(r, '2026-08-29')).toEqual(['2026-08-05']);
  });

  it('não gera nada quando já está em dia', () => {
    const r = recurrence({ lastGeneratedDate: '2026-08-05' });
    expect(dates(r, '2026-08-29')).toEqual([]);
  });
});

describe('computePendingOccurrences — clamp de fim de mês (FR-025)', () => {
  it('gera 31/01 → 28/02 → 31/03, preservando o dia-âncora', () => {
    // O ponto do cenário 7 do quickstart: fevereiro não arrasta março para 28.
    const r = recurrence({ startDate: '2026-01-31' });
    expect(dates(r, '2026-03-31')).toEqual(['2026-01-31', '2026-02-28', '2026-03-31']);
  });

  it('usa 29/02 em ano bissexto', () => {
    const r = recurrence({ startDate: '2024-01-31' });
    expect(dates(r, '2024-03-31')).toEqual(['2024-01-31', '2024-02-29', '2024-03-31']);
  });

  it('faz clamp em meses de 30 dias', () => {
    const r = recurrence({ startDate: '2026-03-31' });
    expect(dates(r, '2026-04-30')).toEqual(['2026-03-31', '2026-04-30']);
  });
});

describe('computePendingOccurrences — semanal e anual', () => {
  it('gera a cada 7 dias', () => {
    const r = recurrence({ frequency: 'weekly', startDate: '2026-08-01' });
    expect(dates(r, '2026-08-29')).toEqual([
      '2026-08-01',
      '2026-08-08',
      '2026-08-15',
      '2026-08-22',
      '2026-08-29',
    ]);
  });

  it('gera uma vez por ano', () => {
    const r = recurrence({ frequency: 'yearly', startDate: '2024-03-10' });
    expect(dates(r, '2026-08-29')).toEqual(['2024-03-10', '2025-03-10', '2026-03-10']);
  });

  it('faz clamp anual de 29/02', () => {
    const r = recurrence({ frequency: 'yearly', startDate: '2024-02-29' });
    expect(dates(r, '2025-12-31')).toEqual(['2024-02-29', '2025-02-28']);
  });
});

describe('computePendingOccurrences — status e limites', () => {
  it('não gera nada quando pausada (FR-023)', () => {
    const r = recurrence({ status: 'paused' });
    expect(dates(r, '2026-08-29')).toEqual([]);
  });

  it('para na data final (FR-019)', () => {
    const r = recurrence({ endDate: '2026-07-31' });
    expect(dates(r, '2026-08-29')).toEqual(['2026-06-05', '2026-07-05']);
  });

  it('inclui a ocorrência que cai exatamente na data final', () => {
    const r = recurrence({ endDate: '2026-07-05' });
    expect(dates(r, '2026-08-29')).toEqual(['2026-06-05', '2026-07-05']);
  });

  it('gera em lote quando a recorrência é muito antiga', () => {
    const r = recurrence({ startDate: '2024-09-05' });
    const result = dates(r, '2026-08-29');

    expect(result).toHaveLength(24);
    expect(result[0]).toBe('2024-09-05');
    expect(result[result.length - 1]).toBe('2026-08-05');
  });
});

describe('nextOccurrenceDate', () => {
  it('aponta a próxima ocorrência futura', () => {
    const r = recurrence({ lastGeneratedDate: '2026-08-05' });
    expect(nextOccurrenceDate(r, '2026-08-29')).toBe('2026-09-05');
  });

  it('retorna null para recorrência pausada', () => {
    expect(nextOccurrenceDate(recurrence({ status: 'paused' }), '2026-08-29')).toBeNull();
  });

  it('retorna null quando já passou da data final', () => {
    const r = recurrence({ lastGeneratedDate: '2026-07-05', endDate: '2026-07-31' });
    expect(nextOccurrenceDate(r, '2026-08-29')).toBeNull();
  });
});
