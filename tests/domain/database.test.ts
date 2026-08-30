import { describe, it, expect, beforeEach } from 'vitest';
import { LocalKashDatabase } from '@/storage/database';
import { SCHEMA_VERSION } from '@/domain/types';
import type { NewTransaction } from '@/domain/types';
import { IntegrityError, NotFoundError } from '@/lib/errors';

function makeTransaction(overrides: Partial<NewTransaction> = {}): NewTransaction {
  return {
    type: 'expense',
    amountCents: 4290,
    description: 'Almoço no restaurante',
    date: '2026-08-29',
    categoryId: 'cat-1',
    accountId: 'acc-1',
    notes: null,
    source: 'manual',
    sourceRecurrenceId: null,
    occurrenceDate: null,
    ...overrides,
  };
}

let db: LocalKashDatabase;

beforeEach(() => {
  window.localStorage.clear();
  db = new LocalKashDatabase();
});

describe('seedIfEmpty (FR-026)', () => {
  it('cria as 9 categorias e as 2 contas padrão', async () => {
    await db.seedIfEmpty();

    const categories = await db.categories.list();
    const accounts = await db.accounts.list();

    expect(categories).toHaveLength(9);
    expect(accounts).toHaveLength(2);
    expect(categories.map((c) => c.name)).toEqual([
      'Alimentação',
      'Transporte',
      'Moradia',
      'Contas de casa',
      'Lazer',
      'Saúde',
      'Educação',
      'Assinaturas',
      'Outros',
    ]);
    expect(accounts.map((a) => a.name)).toEqual(['Nubank', 'Itaú']);
  });

  it('é idempotente: rodar de novo não duplica nada', async () => {
    await db.seedIfEmpty();
    await db.seedIfEmpty();
    await db.seedIfEmpty();

    expect(await db.categories.list()).toHaveLength(9);
    expect(await db.accounts.list()).toHaveLength(2);
  });

  it('não duplica quando chamado em paralelo (StrictMode)', async () => {
    // Regressão: o StrictMode do React monta o efeito duas vezes, e a versão
    // antiga — que dava await entre ler e escrever — semeava 16 categorias.
    await Promise.all([db.seedIfEmpty(), db.seedIfEmpty(), db.seedIfEmpty()]);

    const categories = await db.categories.list();
    const accounts = await db.accounts.list();

    expect(categories).toHaveLength(9);
    expect(accounts).toHaveLength(2);
    // E cada nome aparece uma única vez.
    expect(new Set(categories.map((c) => c.name)).size).toBe(9);
    expect(new Set(accounts.map((a) => a.name)).size).toBe(2);
  });

  it('não duplica quando duas instâncias semeiam em paralelo (duas abas)', async () => {
    const other = new LocalKashDatabase();
    await Promise.all([db.seedIfEmpty(), other.seedIfEmpty()]);

    expect(await db.categories.list()).toHaveLength(9);
  });

  it('numa base antiga, acrescenta só as categorias da allowlist que faltam', async () => {
    // Simula quem começou antes de "Contas de casa" existir e que também
    // apagou "Lazer" da base (via import de backup, por exemplo).
    await db.seedIfEmpty();
    const base = (await db.categories.list()).filter(
      (c) => c.name !== 'Contas de casa' && c.name !== 'Lazer',
    );
    db.categories.replaceAll(base);
    expect(await db.categories.list()).toHaveLength(7);

    await db.seedIfEmpty();

    const nomes = (await db.categories.list()).map((c) => c.name);
    expect(nomes).toContain('Contas de casa'); // está na allowlist -> volta
    expect(nomes).not.toContain('Lazer'); // não está -> fica como a pessoa deixou
    expect(nomes).toHaveLength(8);
    expect(nomes.filter((n) => n === 'Alimentação')).toHaveLength(1);
  });
});

describe('CRUD básico', () => {
  it('gera id e timestamps na criação, ignorando os que vierem no input', async () => {
    const created = await db.transactions.create({
      ...makeTransaction(),
      id: 'id-forjado',
      createdAt: '1999-01-01T00:00:00.000Z',
    });

    expect(created.id).not.toBe('id-forjado');
    expect(created.createdAt).not.toBe('1999-01-01T00:00:00.000Z');
    expect(created.updatedAt).toBe(created.createdAt);
  });

  it('atualiza e renova updatedAt', async () => {
    const created = await db.transactions.create(makeTransaction());
    const updated = await db.transactions.update(created.id, { amountCents: 5500 });

    expect(updated.amountCents).toBe(5500);
    expect(updated.id).toBe(created.id);
    expect(updated.createdAt).toBe(created.createdAt);
  });

  it('lança NotFoundError ao atualizar id inexistente', async () => {
    await expect(db.transactions.update('inexistente', { amountCents: 1 })).rejects.toThrow(
      NotFoundError,
    );
  });

  it('remove de forma idempotente', async () => {
    const created = await db.transactions.create(makeTransaction());

    await db.transactions.remove(created.id);
    await expect(db.transactions.remove(created.id)).resolves.toBeUndefined();
    expect(await db.transactions.list()).toHaveLength(0);
  });

  it('persiste entre instâncias, como entre sessões do navegador (FR-028)', async () => {
    await db.transactions.create(makeTransaction());

    const reopened = new LocalKashDatabase();
    expect(await reopened.transactions.list()).toHaveLength(1);
  });
});

describe('listByFilters (FR-005)', () => {
  beforeEach(async () => {
    await db.transactions.create(makeTransaction({ date: '2026-08-29', description: 'Almoço' }));
    await db.transactions.create(
      makeTransaction({ date: '2026-08-05', type: 'income', description: 'Salário', categoryId: 'cat-2' }),
    );
    await db.transactions.create(
      makeTransaction({ date: '2026-07-15', description: 'Uber', accountId: 'acc-2' }),
    );
  });

  it('ordena por data decrescente', async () => {
    const all = await db.transactions.listByFilters({});
    expect(all.map((t) => t.date)).toEqual(['2026-08-29', '2026-08-05', '2026-07-15']);
  });

  it('filtra por mês', async () => {
    const august = await db.transactions.listByFilters({ month: '2026-08' });
    expect(august).toHaveLength(2);
  });

  it('filtra por tipo, categoria e conta', async () => {
    expect(await db.transactions.listByFilters({ type: 'income' })).toHaveLength(1);
    expect(await db.transactions.listByFilters({ categoryId: 'cat-2' })).toHaveLength(1);
    expect(await db.transactions.listByFilters({ accountId: 'acc-2' })).toHaveLength(1);
  });

  it('busca por descrição sem diferenciar maiúsculas', async () => {
    expect(await db.transactions.listByFilters({ search: 'sal' })).toHaveLength(1);
    expect(await db.transactions.listByFilters({ search: 'UBER' })).toHaveLength(1);
  });

  it('combina filtros com E lógico', async () => {
    const result = await db.transactions.listByFilters({ month: '2026-08', type: 'expense' });
    expect(result).toHaveLength(1);
    expect(result[0]!.description).toBe('Almoço');
  });
});

describe('upsertForCategory (FR-017)', () => {
  it('cria o orçamento quando não existe', async () => {
    const budget = await db.budgets.upsertForCategory('cat-1', 80000, '2026-08');

    expect(budget.limitCents).toBe(80000);
    expect(await db.budgets.list()).toHaveLength(1);
  });

  it('substitui o limite anterior em vez de criar um segundo', async () => {
    const first = await db.budgets.upsertForCategory('cat-1', 80000, '2026-08');
    const second = await db.budgets.upsertForCategory('cat-1', 100000, '2026-08');

    expect(second.id).toBe(first.id);
    expect(second.limitCents).toBe(100000);
    expect(await db.budgets.list()).toHaveLength(1);
  });
});

describe('integridade de categorias e contas (FR-027)', () => {
  it('impede excluir categoria em uso e sugere arquivar', async () => {
    const category = await db.categories.create({
      name: 'Pets',
      icon: 'tag',
      color: '#000000',
      kind: 'expense',
      archived: false,
      isDefault: false,
    });
    await db.transactions.create(makeTransaction({ categoryId: category.id }));

    await expect(db.categories.remove(category.id)).rejects.toThrow(IntegrityError);
    expect(await db.categories.list()).toHaveLength(1);
  });

  it('impede excluir categoria padrão', async () => {
    await db.seedIfEmpty();
    const [first] = await db.categories.list();

    await expect(db.categories.remove(first!.id)).rejects.toThrow(IntegrityError);
  });

  it('permite excluir categoria sem dependentes', async () => {
    const category = await db.categories.create({
      name: 'Pets',
      icon: 'tag',
      color: '#000000',
      kind: 'expense',
      archived: false,
      isDefault: false,
    });

    await db.categories.remove(category.id);
    expect(await db.categories.list()).toHaveLength(0);
  });

  it('arquivar preserva o registro e o esconde de listActive', async () => {
    await db.seedIfEmpty();
    const [first] = await db.categories.list();

    await db.categories.archive(first!.id);

    expect(await db.categories.list()).toHaveLength(9);
    expect(await db.categories.listActive()).toHaveLength(8);
  });

  it('impede excluir conta em uso', async () => {
    const account = await db.accounts.create({
      name: 'Inter',
      initialBalanceCents: 0,
      archived: false,
      isDefault: false,
    });
    await db.transactions.create(makeTransaction({ accountId: account.id }));

    await expect(db.accounts.remove(account.id)).rejects.toThrow(IntegrityError);
  });
});

describe('export e import (FR-030)', () => {
  it('exporta tudo com a versão do formato', async () => {
    await db.seedIfEmpty();
    await db.transactions.create(makeTransaction());

    const snapshot = await db.exportAll();

    expect(snapshot.schemaVersion).toBe(SCHEMA_VERSION);
    expect(snapshot.transactions).toHaveLength(1);
    expect(snapshot.categories).toHaveLength(9);
    expect(snapshot.exportedAt).toBeTruthy();
  });

  it('reimporta um snapshot exportado, restaurando a base', async () => {
    await db.seedIfEmpty();
    await db.transactions.create(makeTransaction());
    const snapshot = await db.exportAll();

    window.localStorage.clear();
    const restored = new LocalKashDatabase();
    const result = await restored.importAll(snapshot);

    expect(result.ok).toBe(true);
    expect(result.counts.transactions).toBe(1);
    expect(await restored.categories.list()).toHaveLength(9);
  });

  it('rejeita arquivo inválido SEM sobrescrever a base existente', async () => {
    await db.seedIfEmpty();
    await db.transactions.create(makeTransaction());

    const result = await db.importAll({ schemaVersion: 1, transactions: 'não é array' });

    expect(result.ok).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
    // A base continua intacta — é o ponto do requisito.
    expect(await db.transactions.list()).toHaveLength(1);
    expect(await db.categories.list()).toHaveLength(9);
  });

  it('rejeita conteúdo que nem é objeto', async () => {
    const result = await db.importAll('lixo');
    expect(result.ok).toBe(false);
  });

  it('rejeita formato mais novo que o suportado', async () => {
    const result = await db.importAll({
      schemaVersion: SCHEMA_VERSION + 1,
      transactions: [],
      categories: [],
      accounts: [],
      budgets: [],
      recurrences: [],
    });

    expect(result.ok).toBe(false);
    expect(result.errors[0]).toContain('versão mais nova');
  });
});

describe('findByOccurrence (FR-021)', () => {
  it('encontra a transação pela chave determinística', async () => {
    await db.transactions.create(
      makeTransaction({
        source: 'recurrence',
        sourceRecurrenceId: 'rec-1',
        occurrenceDate: '2026-08-05',
      }),
    );

    expect(await db.transactions.findByOccurrence('rec-1', '2026-08-05')).not.toBeNull();
    expect(await db.transactions.findByOccurrence('rec-1', '2026-09-05')).toBeNull();
    expect(await db.transactions.findByOccurrence('rec-2', '2026-08-05')).toBeNull();
  });
});
