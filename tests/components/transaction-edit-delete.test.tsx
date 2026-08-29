import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { KashProvider } from '@/state/KashProvider';
import { LocalKashDatabase } from '@/storage/database';
import { TransactionsPage } from '@/pages/TransactionsPage';
import { currentMonth } from '@/lib/date';
import type { NewTransaction } from '@/domain/types';

/** Semeia direto no banco para focar o teste em editar/excluir. */
async function seed(db: LocalKashDatabase) {
  await db.seedIfEmpty();
  const [category] = await db.categories.list();
  const [account] = await db.accounts.list();
  const month = currentMonth();

  const base: NewTransaction = {
    type: 'expense',
    amountCents: 4290,
    description: 'Almoço no restaurante',
    date: `${month}-15`,
    categoryId: category!.id,
    accountId: account!.id,
    notes: null,
    source: 'manual',
    sourceRecurrenceId: null,
    occurrenceDate: null,
  };

  await db.transactions.create(base);
  await db.transactions.create({
    ...base,
    type: 'income',
    amountCents: 500000,
    description: 'Salário',
    date: `${month}-05`,
  });
}

async function setup() {
  window.localStorage.clear();
  const db = new LocalKashDatabase();
  await seed(db);

  render(
    <MemoryRouter>
      <KashProvider db={db}>
        <TransactionsPage />
      </KashProvider>
    </MemoryRouter>,
  );

  await screen.findByText('Almoço no restaurante');
  return { db, user: userEvent.setup() };
}

beforeEach(() => {
  window.localStorage.clear();
});

describe('edição (FR-004)', () => {
  it('atualiza o valor e reflete na lista e nos totais imediatamente', async () => {
    const { db, user } = await setup();

    await user.click(screen.getByRole('button', { name: 'Editar Almoço no restaurante' }));
    const form = within(await screen.findByRole('dialog'));

    const amountField = form.getByLabelText('Valor');
    await user.clear(amountField);
    await user.type(amountField, '55,00');
    await user.click(form.getByRole('button', { name: 'Salvar transação' }));

    const item = (await screen.findByText('Almoço no restaurante')).closest('li')!;
    expect(within(item).getByText(/−\s*R\$\s*55,00/)).toBeInTheDocument();

    const saved = (await db.transactions.list()).find(
      (t) => t.description === 'Almoço no restaurante',
    );
    expect(saved!.amountCents).toBe(5500);

    // O total de saídas acompanha. 'Saídas' também nomeia um filtro de tipo,
    // então buscamos o do resumo da lista.
    const resumo = screen.getAllByText(/Saídas/).find((el) => /55,00/.test(el.textContent ?? ''));
    expect(resumo).toBeDefined();
  });

  it('preenche o formulário com os dados existentes', async () => {
    const { user } = await setup();

    await user.click(screen.getByRole('button', { name: 'Editar Salário' }));
    const form = within(await screen.findByRole('dialog'));

    expect(form.getByLabelText('Valor')).toHaveValue('5000,00');
    expect(form.getByLabelText('Descrição')).toHaveValue('Salário');
    expect(form.getByRole('radio', { name: 'Receita' })).toHaveAttribute('aria-checked', 'true');
  });
});

describe('exclusão (FR-004)', () => {
  it('não altera nada quando a confirmação é cancelada', async () => {
    const { db, user } = await setup();

    await user.click(screen.getByRole('button', { name: 'Excluir Salário' }));
    const dialog = within(await screen.findByRole('dialog'));
    await user.click(dialog.getByRole('button', { name: 'Cancelar' }));

    expect(screen.getByText('Salário')).toBeInTheDocument();
    expect(await db.transactions.list()).toHaveLength(2);
  });

  it('remove e recalcula o saldo quando confirmada', async () => {
    const { db, user } = await setup();

    await user.click(screen.getByRole('button', { name: 'Excluir Salário' }));
    const dialog = within(await screen.findByRole('dialog'));
    await user.click(dialog.getByRole('button', { name: 'Excluir' }));

    expect(await screen.findByText('1 lançamento')).toBeInTheDocument();
    expect(screen.queryByText('Salário')).not.toBeInTheDocument();
    expect(await db.transactions.list()).toHaveLength(1);
  });

  it('pede confirmação nomeando o lançamento', async () => {
    const { user } = await setup();

    await user.click(screen.getByRole('button', { name: 'Excluir Salário' }));
    const dialog = await screen.findByRole('dialog');

    expect(within(dialog).getByText(/Salário/)).toBeInTheDocument();
  });
});
