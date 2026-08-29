import { describe, it, expect } from 'vitest';
import {
  daysBetween,
  detectCadence,
  detectRecurrences,
  normalizeCounterparty,
  patternKey,
} from '@/domain/recurrenceDetection';
import type { Recurrence, Transaction } from '@/domain/types';

let seq = 0;
function tx(date: string, amountCents: number, description: string, over: Partial<Transaction> = {}): Transaction {
  seq += 1;
  return {
    id: `t-${seq}`,
    type: 'expense',
    amountCents,
    description,
    date,
    categoryId: 'cat-1',
    accountId: 'acc-1',
    notes: null,
    source: 'manual',
    sourceRecurrenceId: null,
    occurrenceDate: null,
    createdAt: '2026-08-01T00:00:00.000Z',
    updatedAt: '2026-08-01T00:00:00.000Z',
    ...over,
  };
}

const detect = (transactions: Transaction[], over = {}) =>
  detectRecurrences({ transactions, today: '2026-08-21', ...over });

describe('normalizeCounterparty', () => {
  it('remove o prefixo do tipo de operação', () => {
    expect(normalizeCounterparty('Compra no débito - NAGUMO')).toBe('NAGUMO');
    expect(normalizeCounterparty('Pagamento de boleto efetuado - IMOBILIARIA DANELLI LTDA')).toBe(
      'IMOBILIARIA DANELLI',
    );
  });

  it('corta o rabo com conta e agência', () => {
    expect(
      normalizeCounterparty('Transferência enviada pelo Pix - CLINICA ODONTO - Conta: 13004481-6'),
    ).toBe('CLINICA ODONTO');
  });

  it('remove CNPJ e CPF mascarado, e descarta iniciais soltas', () => {
    // "R.P.F." vira letras isoladas, que não ajudam a identificar ninguém;
    // o nome que agrupa de verdade é o que sobra.
    expect(normalizeCounterparty('R.P.F. DE CARVALHO SERVICOS - 43.061.443/0001-03')).toBe(
      'CARVALHO SERVICOS',
    );
  });

  it('agrupa descrições com código de pedido variável', () => {
    const a = normalizeCounterparty('IFOOD *PEDIDO 8213');
    const b = normalizeCounterparty('IFOOD *PEDIDO 9471');
    expect(a).toBe(b);
    expect(a).toBe('IFOOD PEDIDO');
  });

  it('ignora acento e caixa', () => {
    expect(normalizeCounterparty('Farmácia São João')).toBe(
      normalizeCounterparty('FARMACIA SAO JOAO'),
    );
  });

  it('trata sufixos societários como ruído', () => {
    expect(normalizeCounterparty('IMOBILIARIA DANELLI LTDA')).toBe(
      normalizeCounterparty('IMOBILIARIA DANELLI'),
    );
  });
});

describe('daysBetween', () => {
  it('conta os dias entre datas civis', () => {
    expect(daysBetween('2026-08-01', '2026-08-08')).toBe(7);
    expect(daysBetween('2026-07-10', '2026-08-10')).toBe(31);
    expect(daysBetween('2026-01-31', '2026-02-28')).toBe(28);
  });
});

describe('detectCadence', () => {
  it('reconhece cadência semanal', () => {
    const c = detectCadence(['2026-08-01', '2026-08-08', '2026-08-15', '2026-08-22']);
    expect(c!.frequency).toBe('weekly');
  });

  it('reconhece cadência mensal mesmo com o dia variando', () => {
    // O boleto cai em dia útil: 10, 10, 11.
    const c = detectCadence(['2026-06-10', '2026-07-10', '2026-08-11']);
    expect(c!.frequency).toBe('monthly');
  });

  it('reconhece cadência anual', () => {
    const c = detectCadence(['2024-03-10', '2025-03-10', '2026-03-10']);
    expect(c!.frequency).toBe('yearly');
  });

  it('recusa datas sem padrão', () => {
    expect(detectCadence(['2026-08-01', '2026-08-03', '2026-08-19'])).toBeNull();
  });

  it('precisa de pelo menos duas datas', () => {
    expect(detectCadence(['2026-08-01'])).toBeNull();
  });
});

describe('detectRecurrences — o caso do aluguel', () => {
  const aluguel = [
    tx('2026-06-10', 150000, 'Pagamento de boleto efetuado - IMOBILIARIA DANELLI LTDA'),
    tx('2026-07-10', 150000, 'Pagamento de boleto efetuado - IMOBILIARIA DANELLI LTDA'),
    tx('2026-08-11', 152000, 'Pagamento de boleto efetuado - IMOBILIARIA DANELLI'),
  ];

  it('identifica o padrão mesmo com descrição e valor diferentes', () => {
    const [sugestao] = detect(aluguel);

    expect(sugestao).toBeDefined();
    expect(sugestao!.label).toBe('Imobiliaria Danelli');
    expect(sugestao!.frequency).toBe('monthly');
    expect(sugestao!.type).toBe('expense');
  });

  it('usa a mediana como valor e expõe a faixa observada', () => {
    const [sugestao] = detect(aluguel);

    expect(sugestao!.amountCents).toBe(150000);
    expect(sugestao!.minCents).toBe(150000);
    expect(sugestao!.maxCents).toBe(152000);
    expect(sugestao!.stableAmount).toBe(true);
  });

  it('projeta a próxima data esperada', () => {
    const [sugestao] = detect(aluguel);
    expect(sugestao!.nextDate).toBe('2026-09-10');
  });

  it('reporta confiança alta para três ocorrências regulares', () => {
    const [sugestao] = detect(aluguel);
    expect(sugestao!.confidence).toBeGreaterThan(0.6);
  });
});

describe('detectRecurrences — dois extratos no mesmo mês', () => {
  it('encontra um padrão semanal a partir de poucas ocorrências', () => {
    // O cenário que o usuário descreveu: sobe o extrato duas vezes no mês.
    const feira = [
      tx('2026-08-01', 12000, 'Compra no débito - NAGUMO'),
      tx('2026-08-08', 13500, 'Compra no débito - NAGUMO'),
      tx('2026-08-15', 11800, 'Compra no débito - NAGUMO'),
    ];

    const [sugestao] = detect(feira);

    expect(sugestao!.frequency).toBe('weekly');
    expect(sugestao!.label).toBe('Nagumo');
    expect(sugestao!.occurrences).toHaveLength(3);
  });

  it('sugere com apenas duas ocorrências, mas com confiança menor', () => {
    const duas = detect([
      tx('2026-07-05', 3990, 'NETFLIX.COM'),
      tx('2026-08-05', 3990, 'NETFLIX.COM'),
    ]);
    const tres = detect([
      tx('2026-06-05', 3990, 'NETFLIX.COM'),
      tx('2026-07-05', 3990, 'NETFLIX.COM'),
      tx('2026-08-05', 3990, 'NETFLIX.COM'),
    ]);

    expect(duas).toHaveLength(1);
    expect(tres[0]!.confidence).toBeGreaterThan(duas[0]!.confidence);
  });

  it('respeita um mínimo de ocorrências mais exigente', () => {
    const transactions = [
      tx('2026-07-05', 3990, 'NETFLIX.COM'),
      tx('2026-08-05', 3990, 'NETFLIX.COM'),
    ];
    expect(detect(transactions, { minOccurrences: 3 })).toHaveLength(0);
  });
});

describe('detectRecurrences — o que NÃO deve virar sugestão', () => {
  it('compras avulsas no mesmo lugar, sem cadência', () => {
    const avulsas = [
      tx('2026-08-01', 5000, 'Compra no débito - POSTO SHELL'),
      tx('2026-08-03', 9000, 'Compra no débito - POSTO SHELL'),
      tx('2026-08-19', 4000, 'Compra no débito - POSTO SHELL'),
    ];
    expect(detect(avulsas)).toHaveLength(0);
  });

  it('duas compras no mesmo dia', () => {
    const mesmoDia = [
      tx('2026-08-04', 1353, 'Compra no débito - NAGUMO'),
      tx('2026-08-04', 2200, 'Compra no débito - NAGUMO'),
    ];
    expect(detect(mesmoDia)).toHaveLength(0);
  });

  it('um lançamento isolado', () => {
    expect(detect([tx('2026-08-04', 1353, 'Compra no débito - NAGUMO')])).toHaveLength(0);
  });

  it('padrões já cobertos por uma recorrência cadastrada', () => {
    const existente: Recurrence = {
      id: 'r-1',
      type: 'expense',
      amountCents: 150000,
      description: 'IMOBILIARIA DANELLI LTDA',
      categoryId: 'cat-1',
      accountId: 'acc-1',
      notes: null,
      frequency: 'monthly',
      startDate: '2026-06-10',
      endDate: null,
      status: 'active',
      lastGeneratedDate: '2026-08-10',
      createdAt: '2026-06-01T00:00:00.000Z',
      updatedAt: '2026-06-01T00:00:00.000Z',
    };

    const transactions = [
      tx('2026-06-10', 150000, 'Pagamento de boleto efetuado - IMOBILIARIA DANELLI LTDA'),
      tx('2026-07-10', 150000, 'Pagamento de boleto efetuado - IMOBILIARIA DANELLI LTDA'),
    ];

    expect(detect(transactions, { existingRecurrences: [existente] })).toHaveLength(0);
  });

  it('padrões dispensados pela pessoa', () => {
    const transactions = [
      tx('2026-07-05', 3990, 'NETFLIX.COM'),
      tx('2026-08-05', 3990, 'NETFLIX.COM'),
    ];
    const [sugestao] = detect(transactions);

    expect(detect(transactions, { dismissedKeys: [sugestao!.key] })).toHaveLength(0);
  });

  it('lançamentos que já vieram de uma recorrência', () => {
    const gerados = [
      tx('2026-07-10', 150000, 'Aluguel', { source: 'recurrence', sourceRecurrenceId: 'r-1', occurrenceDate: '2026-07-10' }),
      tx('2026-08-10', 150000, 'Aluguel', { source: 'recurrence', sourceRecurrenceId: 'r-1', occurrenceDate: '2026-08-10' }),
    ];
    expect(detect(gerados)).toHaveLength(0);
  });
});

describe('detectRecurrences — receitas e contas variáveis', () => {
  it('detecta o salário como recorrência de receita', () => {
    const salario = [
      tx('2026-06-05', 500000, 'Transferência recebida pelo Pix - SALARIO', { type: 'income' }),
      tx('2026-07-05', 500000, 'Transferência recebida pelo Pix - SALARIO', { type: 'income' }),
      tx('2026-08-05', 520000, 'Transferência recebida pelo Pix - SALARIO', { type: 'income' }),
    ];

    const [sugestao] = detect(salario);
    expect(sugestao!.type).toBe('income');
    expect(sugestao!.frequency).toBe('monthly');
  });

  it('marca como valor instável uma conta que varia muito', () => {
    const luz = [
      tx('2026-06-15', 12000, 'Débito automático - ENEL'),
      tx('2026-07-15', 21000, 'Débito automático - ENEL'),
      tx('2026-08-15', 18000, 'Débito automático - ENEL'),
    ];

    const [sugestao] = detect(luz);
    expect(sugestao!.stableAmount).toBe(false);
    expect(sugestao!.minCents).toBe(12000);
    expect(sugestao!.maxCents).toBe(21000);
  });

  it('não confunde a mesma loja em receita e despesa', () => {
    const transactions = [
      tx('2026-07-05', 10000, 'PIX FULANO', { type: 'income' }),
      tx('2026-08-05', 10000, 'PIX FULANO', { type: 'income' }),
      tx('2026-07-20', 5000, 'PIX FULANO'),
      tx('2026-08-20', 5000, 'PIX FULANO'),
    ];

    const sugestoes = detect(transactions);
    expect(sugestoes).toHaveLength(2);
    expect(new Set(sugestoes.map((s) => s.type))).toEqual(new Set(['income', 'expense']));
  });
});

describe('ordenação das sugestões', () => {
  it('coloca os padrões mais confiáveis primeiro', () => {
    const transactions = [
      // Padrão forte: 4 ocorrências mensais, valor fixo.
      tx('2026-05-10', 150000, 'IMOBILIARIA DANELLI'),
      tx('2026-06-10', 150000, 'IMOBILIARIA DANELLI'),
      tx('2026-07-10', 150000, 'IMOBILIARIA DANELLI'),
      tx('2026-08-10', 150000, 'IMOBILIARIA DANELLI'),
      // Padrão fraco: 2 ocorrências, valor variável.
      tx('2026-07-03', 3000, 'PADARIA CENTRAL'),
      tx('2026-08-06', 5000, 'PADARIA CENTRAL'),
    ];

    const sugestoes = detect(transactions);
    expect(sugestoes[0]!.label).toBe('Imobiliaria Danelli');
    expect(sugestoes[0]!.confidence).toBeGreaterThan(sugestoes[1]!.confidence);
  });
});

describe('patternKey', () => {
  it('é estável entre importações e separa por tipo', () => {
    expect(patternKey('NAGUMO', 'expense')).toBe('expense:NAGUMO');
    expect(patternKey('NAGUMO', 'expense')).not.toBe(patternKey('NAGUMO', 'income'));
  });
});
