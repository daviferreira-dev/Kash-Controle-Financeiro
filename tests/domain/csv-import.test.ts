import { describe, it, expect } from 'vitest';
import {
  dedupeKey,
  parseStatementAmount,
  parseStatementCsv,
  parseStatementDate,
  splitCsvLine,
  statementRowsToTransactions,
  suggestCategoryId,
} from '@/domain/csvImport';
import { validateTransaction } from '@/domain/validation';
import type { Account, Category } from '@/domain/types';

const categories: Category[] = [
  ['Alimentação', '#a03f2d'],
  ['Transporte', '#705c1e'],
  ['Moradia', '#56423e'],
  ['Lazer', '#c3a963'],
  ['Saúde', '#8a726d'],
  ['Educação', '#2f6b4f'],
  ['Assinaturas', '#e8755f'],
  ['Outros', '#5f5e5e'],
].map(([name, color], i) => ({
  id: `cat-${i}`,
  name: name!,
  icon: 'tag',
  color: color!,
  kind: name === 'Outros' ? 'both' : 'expense',
  archived: false,
  isDefault: true,
}));

const account: Account = {
  id: 'acc-nubank',
  name: 'Nubank',
  initialBalanceCents: 0,
  archived: false,
  isDefault: true,
};

/** Formato do CSV de extrato de conta do Nubank. */
const NUBANK_CSV = `Data,Valor,Identificador,Descrição
04/08/2026,-13.53,6864a1f0-0001-4000-8000-000000000001,Compra no débito - NAGUMO
05/08/2026,100.00,6864a1f0-0001-4000-8000-000000000002,Transferência recebida pelo Pix - FULANO DE TAL
05/08/2026,-175.00,6864a1f0-0001-4000-8000-000000000003,Transferência enviada pelo Pix - CLINICA ODONTOLOGIA LTDA
07/08/2026,15.00,6864a1f0-0001-4000-8000-000000000004,Transferência recebida pelo Pix - CICLANA
10/08/2026,-1500.00,6864a1f0-0001-4000-8000-000000000005,Pagamento de boleto efetuado - IMOBILIARIA DANELLI LTDA
12/08/2026,-39.90,6864a1f0-0001-4000-8000-000000000006,Compra no débito - NETFLIX.COM
15/08/2026,-25.00,6864a1f0-0001-4000-8000-000000000007,Compra no débito - UBER *TRIP
`;

describe('splitCsvLine', () => {
  it('respeita vírgulas dentro de aspas', () => {
    expect(splitCsvLine('a,"b,c",d', ',')).toEqual(['a', 'b,c', 'd']);
  });

  it('trata aspas escapadas', () => {
    expect(splitCsvLine('a,"diz ""oi""",c', ',')).toEqual(['a', 'diz "oi"', 'c']);
  });

  it('aceita ponto e vírgula', () => {
    expect(splitCsvLine('a;b;c', ';')).toEqual(['a', 'b', 'c']);
  });
});

describe('parseStatementDate', () => {
  it('aceita DD/MM/AAAA', () => {
    expect(parseStatementDate('04/08/2026')).toBe('2026-08-04');
  });

  it('aceita ISO e DD-MM-AAAA', () => {
    expect(parseStatementDate('2026-08-04')).toBe('2026-08-04');
    expect(parseStatementDate('04-08-2026')).toBe('2026-08-04');
  });

  it('rejeita data impossível e lixo', () => {
    expect(parseStatementDate('31/02/2026')).toBeNull();
    expect(parseStatementDate('ontem')).toBeNull();
    expect(parseStatementDate('')).toBeNull();
  });
});

describe('parseStatementAmount', () => {
  it('lê ponto decimal, como o Nubank exporta', () => {
    expect(parseStatementAmount('-13.53')).toBe(-1353);
    expect(parseStatementAmount('100.00')).toBe(10000);
  });

  it('lê vírgula decimal, como planilhas brasileiras exportam', () => {
    expect(parseStatementAmount('-13,53')).toBe(-1353);
    expect(parseStatementAmount('1.234,56')).toBe(123456);
  });

  it('lê separador de milhar com ponto decimal', () => {
    expect(parseStatementAmount('-1500.00')).toBe(-150000);
  });

  it('aceita prefixo R$ e parênteses como negativo', () => {
    expect(parseStatementAmount('R$ 42,90')).toBe(4290);
    expect(parseStatementAmount('(42,90)')).toBe(-4290);
  });

  it('rejeita entrada inválida', () => {
    expect(parseStatementAmount('abc')).toBeNull();
    expect(parseStatementAmount('')).toBeNull();
  });
});

describe('parseStatementCsv — extrato do Nubank', () => {
  it('lê todas as linhas', () => {
    const { rows, errors } = parseStatementCsv(NUBANK_CSV);

    expect(errors).toEqual([]);
    expect(rows).toHaveLength(7);
  });

  it('converte valores para centavos positivos, com o sinal no tipo', () => {
    const { rows } = parseStatementCsv(NUBANK_CSV);

    const nagumo = rows.find((r) => r.description.includes('NAGUMO'))!;
    expect(nagumo.amountCents).toBe(1353);
    expect(nagumo.type).toBe('expense');

    const recebida = rows.find((r) => r.description.includes('FULANO'))!;
    expect(recebida.amountCents).toBe(10000);
    expect(recebida.type).toBe('income');
  });

  it('converte as datas para o formato interno', () => {
    const { rows } = parseStatementCsv(NUBANK_CSV);
    expect(rows[0]!.date).toBe('2026-08-04');
    expect(rows[4]!.date).toBe('2026-08-10');
  });

  it('guarda o identificador do banco', () => {
    const { rows } = parseStatementCsv(NUBANK_CSV);
    expect(rows[0]!.externalId).toBe('6864a1f0-0001-4000-8000-000000000001');
  });

  it('não confunde o valor com números da descrição', () => {
    // A armadilha do PDF: "Conta: 13004481-6" colado em "175,00".
    const csv = `Data,Valor,Identificador,Descrição
05/08/2026,-175.00,abc,Transferência enviada - CLINICA - 43.061.443/0001-03 - BCO Conta: 13004481-6`;

    const { rows, errors } = parseStatementCsv(csv);

    expect(errors).toEqual([]);
    expect(rows[0]!.amountCents).toBe(17500);
  });
});

describe('parseStatementCsv — robustez', () => {
  it('aceita ponto e vírgula como separador', () => {
    const csv = 'Data;Valor;Descrição\n04/08/2026;-13,53;NAGUMO';
    const { rows, errors } = parseStatementCsv(csv);

    expect(errors).toEqual([]);
    expect(rows[0]!.amountCents).toBe(1353);
  });

  it('aceita colunas em ordem diferente', () => {
    const csv = 'Descrição,Data,Valor\nNAGUMO,04/08/2026,-13.53';
    const { rows } = parseStatementCsv(csv);

    expect(rows[0]).toMatchObject({ description: 'NAGUMO', date: '2026-08-04', amountCents: 1353 });
  });

  it('aceita cabeçalho sem acento e com maiúsculas', () => {
    const csv = 'DATA,VALOR,DESCRICAO\n04/08/2026,-13.53,NAGUMO';
    expect(parseStatementCsv(csv).rows).toHaveLength(1);
  });

  it('remove o BOM que o Excel adiciona', () => {
    const csv = '﻿Data,Valor,Descrição\n04/08/2026,-13.53,NAGUMO';
    expect(parseStatementCsv(csv).rows).toHaveLength(1);
  });

  it('ignora linhas em branco', () => {
    const csv = 'Data,Valor,Descrição\n\n04/08/2026,-13.53,NAGUMO\n\n';
    expect(parseStatementCsv(csv).rows).toHaveLength(1);
  });

  it('reporta a linha problemática sem descartar as boas', () => {
    const csv = `Data,Valor,Descrição
04/08/2026,-13.53,NAGUMO
data-ruim,-10.00,QUALQUER
06/08/2026,-20.00,OUTRA`;

    const { rows, errors } = parseStatementCsv(csv);

    expect(rows).toHaveLength(2);
    expect(errors).toHaveLength(1);
    expect(errors[0]!.line).toBe(3);
    expect(errors[0]!.message).toContain('Data inválida');
  });

  it('avisa quando falta uma coluna obrigatória, sem importar nada', () => {
    const { rows, errors } = parseStatementCsv('Foo,Bar\n1,2');

    expect(rows).toEqual([]);
    expect(errors[0]!.message).toContain('Data');
    expect(errors[0]!.message).toContain('Valor');
  });

  it('trata arquivo vazio', () => {
    expect(parseStatementCsv('').errors[0]!.message).toContain('vazio');
  });
});

describe('suggestCategoryId', () => {
  const nameOf = (id: string) => categories.find((c) => c.id === id)!.name;

  it('reconhece alimentação', () => {
    expect(nameOf(suggestCategoryId('Compra no débito - NAGUMO', categories))).toBe('Alimentação');
    expect(nameOf(suggestCategoryId('IFOOD *PEDIDO', categories))).toBe('Alimentação');
  });

  it('reconhece transporte', () => {
    expect(nameOf(suggestCategoryId('UBER *TRIP', categories))).toBe('Transporte');
    expect(nameOf(suggestCategoryId('POSTO IPIRANGA', categories))).toBe('Transporte');
  });

  it('reconhece assinaturas', () => {
    expect(nameOf(suggestCategoryId('NETFLIX.COM', categories))).toBe('Assinaturas');
    expect(nameOf(suggestCategoryId('Spotify', categories))).toBe('Assinaturas');
  });

  it('reconhece moradia e saúde', () => {
    expect(nameOf(suggestCategoryId('Pagamento de aluguel', categories))).toBe('Moradia');
    expect(nameOf(suggestCategoryId('DROGARIA SAO PAULO', categories))).toBe('Saúde');
  });

  it('cai em Outros quando não reconhece — não chuta', () => {
    expect(nameOf(suggestCategoryId('TRANSFERENCIA FULANO DE TAL', categories))).toBe('Outros');
  });
});

describe('statementRowsToTransactions', () => {
  it('gera transações válidas para o domínio', () => {
    const { rows } = parseStatementCsv(NUBANK_CSV);
    const transactions = statementRowsToTransactions({ rows, categories, account });

    expect(transactions).toHaveLength(7);
    for (const transaction of transactions) {
      expect(validateTransaction(transaction)).toEqual([]);
      expect(transaction.accountId).toBe('acc-nubank');
      expect(transaction.source).toBe('manual');
    }
  });

  it('guarda o id do banco nas observações, para conferência', () => {
    const { rows } = parseStatementCsv(NUBANK_CSV);
    const [first] = statementRowsToTransactions({ rows, categories, account });

    expect(first!.notes).toContain('Nubank');
    expect(first!.notes).toContain('6864a1f0-0001-4000-8000-000000000001');
  });

  it('classifica pelo texto da descrição', () => {
    const { rows } = parseStatementCsv(NUBANK_CSV);
    const transactions = statementRowsToTransactions({ rows, categories, account });
    const nameOf = (id: string) => categories.find((c) => c.id === id)!.name;

    expect(nameOf(transactions[0]!.categoryId)).toBe('Alimentação'); // NAGUMO
    expect(nameOf(transactions[5]!.categoryId)).toBe('Assinaturas'); // NETFLIX
    expect(nameOf(transactions[6]!.categoryId)).toBe('Transporte'); // UBER
  });
});

describe('dedupeKey', () => {
  it('usa o id do banco quando existe', () => {
    const key = dedupeKey({
      externalId: 'abc',
      date: '2026-08-04',
      amountCents: 1353,
      type: 'expense',
      description: 'NAGUMO',
    });
    expect(key).toBe('id:abc');
  });

  it('cai para data+valor+descrição quando não há id', () => {
    const base = {
      externalId: null,
      date: '2026-08-04',
      amountCents: 1353,
      type: 'expense' as const,
      description: 'NAGUMO',
    };

    expect(dedupeKey(base)).toBe(dedupeKey({ ...base, description: '  nagumo  ' }));
    expect(dedupeKey(base)).not.toBe(dedupeKey({ ...base, amountCents: 1354 }));
  });

  it('distingue duas compras iguais em dias diferentes', () => {
    const a = { externalId: null, date: '2026-08-04', amountCents: 1353, type: 'expense' as const, description: 'NAGUMO' };
    const b = { ...a, date: '2026-08-05' };
    expect(dedupeKey(a)).not.toBe(dedupeKey(b));
  });
});
