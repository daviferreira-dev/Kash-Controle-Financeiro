import { describe, it, expect, beforeEach } from 'vitest';
import { dedupeKey, parseStatementCsv, statementRowsToTransactions } from '@/domain/csvImport';
import { LocalKashDatabase } from '@/storage/database';
import type { Account, Category, Transaction } from '@/domain/types';

/**
 * Fluxo real do usuário: toda semana ele exporta o extrato do mês inteiro até
 * a data corrente. Cada arquivo contém de novo tudo que já veio antes, então
 * a de-duplicação é o que impede o saldo de dobrar a cada importação.
 */

function linha(dia: string, valor: string, id: string, descricao: string) {
  return `${dia}/08/2026,${valor},${id},${descricao}`;
}

const CABECALHO = 'Data,Valor,Identificador,Descrição';

// Semana 1: extrato de 01 a 07/08.
const SEMANA_1 = [
  CABECALHO,
  linha('04', '-13.53', 'id-001', 'Compra no débito - NAGUMO'),
  linha('05', '100.00', 'id-002', 'Transferência recebida pelo Pix - FULANO'),
  linha('07', '15.00', 'id-003', 'Transferência recebida pelo Pix - CICLANA'),
].join('\n');

// Semana 2: mesmo período + a semana nova. Repete os três primeiros.
const SEMANA_2 = [
  CABECALHO,
  linha('04', '-13.53', 'id-001', 'Compra no débito - NAGUMO'),
  linha('05', '100.00', 'id-002', 'Transferência recebida pelo Pix - FULANO'),
  linha('07', '15.00', 'id-003', 'Transferência recebida pelo Pix - CICLANA'),
  linha('10', '-1500.00', 'id-004', 'Pagamento de boleto efetuado - IMOBILIARIA'),
  linha('12', '-39.90', 'id-005', 'Compra no débito - NETFLIX.COM'),
].join('\n');

// Semana 3: tudo de novo + mais duas.
const SEMANA_3 = [
  SEMANA_2,
  linha('15', '-25.00', 'id-006', 'Compra no débito - UBER *TRIP'),
  linha('20', '3500.00', 'id-007', 'Transferência recebida pelo Pix - SALARIO'),
].join('\n');

let db: LocalKashDatabase;
let categories: Category[];
let account: Account;

beforeEach(async () => {
  window.localStorage.clear();
  db = new LocalKashDatabase();
  await db.seedIfEmpty();
  categories = await db.categories.list();
  account = (await db.accounts.list()).find((a) => a.name === 'Nubank')!;
});

/** Reproduz o modo "Adicionar" da tela: pula o que já existe. */
async function importarAdicionando(csv: string): Promise<number> {
  const existing = await db.transactions.list();
  const existingKeys = new Set(existing.map(chaveDaTransacao));

  const { rows } = parseStatementCsv(csv);
  const novas = rows.filter((row) => !existingKeys.has(dedupeKey(row)));

  await db.transactions.createMany(
    statementRowsToTransactions({ rows: novas, categories, account }),
  );
  return novas.length;
}

/** Reproduz o modo "Substituir": apaga os lançamentos e regrava. */
async function importarSubstituindo(csv: string): Promise<number> {
  const snapshot = await db.exportAll();
  await db.importAll({ ...snapshot, transactions: [] });

  const { rows } = parseStatementCsv(csv);
  await db.transactions.createMany(statementRowsToTransactions({ rows, categories, account }));
  return rows.length;
}

function chaveDaTransacao(t: Transaction): string {
  const match = /·\s*id\s+(\S+)/.exec(t.notes ?? '');
  return dedupeKey({
    externalId: match ? match[1]! : null,
    date: t.date,
    amountCents: t.amountCents,
    type: t.type,
    description: t.description,
  });
}

const saldo = (ts: Transaction[]) =>
  ts.reduce((s, t) => s + (t.type === 'income' ? t.amountCents : -t.amountCents), 0);

describe('atualização semanal com extratos sobrepostos', () => {
  it('modo Adicionar: só importa o que é novo a cada semana', async () => {
    expect(await importarAdicionando(SEMANA_1)).toBe(3);
    expect(await importarAdicionando(SEMANA_2)).toBe(2); // 3 repetidas puladas
    expect(await importarAdicionando(SEMANA_3)).toBe(2); // 5 repetidas puladas

    const todas = await db.transactions.list();
    expect(todas).toHaveLength(7);
  });

  it('modo Adicionar: o saldo não dobra ao reimportar o mesmo arquivo', async () => {
    await importarAdicionando(SEMANA_3);
    const saldoInicial = saldo(await db.transactions.list());

    // Subir o mesmo extrato de novo, por engano.
    expect(await importarAdicionando(SEMANA_3)).toBe(0);

    expect(saldo(await db.transactions.list())).toBe(saldoInicial);
    expect(await db.transactions.list()).toHaveLength(7);
  });

  it('modo Adicionar preserva lançamentos manuais e de outras contas', async () => {
    const carteira = (await db.accounts.list()).find((a) => a.name === 'Carteira')!;

    await db.transactions.create({
      type: 'expense',
      amountCents: 2000,
      description: 'Pão na padaria (dinheiro)',
      date: '2026-08-06',
      categoryId: categories[0]!.id,
      accountId: carteira.id,
      notes: null,
      source: 'manual',
      sourceRecurrenceId: null,
      occurrenceDate: null,
    });

    await importarAdicionando(SEMANA_1);
    await importarAdicionando(SEMANA_2);

    const manuais = (await db.transactions.list()).filter((t) => t.accountId === carteira.id);
    expect(manuais).toHaveLength(1);
    expect(await db.transactions.list()).toHaveLength(6);
  });

  it('modo Substituir APAGA os lançamentos manuais e de outras contas', async () => {
    const carteira = (await db.accounts.list()).find((a) => a.name === 'Carteira')!;
    await db.transactions.create({
      type: 'expense',
      amountCents: 2000,
      description: 'Pão na padaria (dinheiro)',
      date: '2026-08-06',
      categoryId: categories[0]!.id,
      accountId: carteira.id,
      notes: null,
      source: 'manual',
      sourceRecurrenceId: null,
      occurrenceDate: null,
    });

    await importarSubstituindo(SEMANA_2);

    // É o risco do modo Substituir num uso semanal: o que não veio no
    // extrato do Nubank desaparece.
    const restantes = await db.transactions.list();
    expect(restantes.every((t) => t.accountId === account.id)).toBe(true);
    expect(restantes.find((t) => t.description.includes('padaria'))).toBeUndefined();
  });

  it('modo Substituir preserva categorias, contas, orçamentos e recorrências', async () => {
    await db.budgets.upsertForCategory(categories[0]!.id, 80000, '2026-08');
    await importarSubstituindo(SEMANA_2);

    expect(await db.categories.list()).toHaveLength(9);
    expect(await db.accounts.list()).toHaveLength(3);
    expect(await db.budgets.list()).toHaveLength(1);
  });

  it('a de-duplicação sobrevive a editar a descrição do lançamento', async () => {
    await importarAdicionando(SEMANA_1);

    const nagumo = (await db.transactions.list()).find((t) => t.description.includes('NAGUMO'))!;
    await db.transactions.update(nagumo.id, { description: 'Mercado da esquina' });

    // O id do banco continua nas observações, então não duplica.
    expect(await importarAdicionando(SEMANA_2)).toBe(2);
    expect(await db.transactions.list()).toHaveLength(5);
  });

  it('duas compras iguais no mesmo dia são mantidas, não confundidas', async () => {
    const csv = [
      CABECALHO,
      linha('04', '-13.53', 'id-a', 'Compra no débito - NAGUMO'),
      linha('04', '-13.53', 'id-b', 'Compra no débito - NAGUMO'),
    ].join('\n');

    expect(await importarAdicionando(csv)).toBe(2);
    expect(await importarAdicionando(csv)).toBe(0);
    expect(await db.transactions.list()).toHaveLength(2);
  });

  it('sem coluna Identificador, cai na chave natural e ainda não duplica', async () => {
    const semana1 = 'Data,Valor,Descrição\n04/08/2026,-13.53,NAGUMO\n05/08/2026,100.00,PIX FULANO';
    const semana2 = `${semana1}\n10/08/2026,-1500.00,BOLETO`;

    expect(await importarAdicionando(semana1)).toBe(2);
    expect(await importarAdicionando(semana2)).toBe(1);
    expect(await db.transactions.list()).toHaveLength(3);
  });
});

describe('virada de mês', () => {
  it('o extrato do mês seguinte não mexe no mês anterior', async () => {
    await importarAdicionando(SEMANA_3);

    const setembro = [
      'Data,Valor,Identificador,Descrição',
      '02/09/2026,-50.00,id-set-1,Compra no débito - PADARIA',
    ].join('\n');

    expect(await importarAdicionando(setembro)).toBe(1);

    const todas = await db.transactions.list();
    expect(todas.filter((t) => t.date.startsWith('2026-08'))).toHaveLength(7);
    expect(todas.filter((t) => t.date.startsWith('2026-09'))).toHaveLength(1);
  });
});
