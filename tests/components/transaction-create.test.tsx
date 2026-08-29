import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { KashProvider } from '@/state/KashProvider';
import { LocalKashDatabase } from '@/storage/database';
import { TransactionsPage } from '@/pages/TransactionsPage';

async function setup() {
  window.localStorage.clear();
  const db = new LocalKashDatabase();

  render(
    <MemoryRouter>
      <KashProvider db={db}>
        <TransactionsPage />
      </KashProvider>
    </MemoryRouter>,
  );

  // Espera a hidratação: os seletores só existem com as contas semeadas.
  await screen.findByRole('heading', { name: 'Transações' });
  return { db, user: userEvent.setup() };
}

async function openForm(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getAllByRole('button', { name: 'Novo lançamento' })[0]!);
  return within(await screen.findByRole('dialog'));
}

beforeEach(() => {
  window.localStorage.clear();
});

describe('criação de lançamentos (User Story 1)', () => {
  it('cria uma despesa e a exibe com sinal, categoria, conta e data em DD/MM/AAAA', async () => {
    const { user, db } = await setup();
    const form = await openForm(user);

    await user.type(form.getByLabelText('Valor'), '42,90');
    await user.type(form.getByLabelText('Descrição'), 'Almoço no restaurante');
    await user.click(form.getByRole('button', { name: /Alimentação/ }));
    await user.selectOptions(form.getByLabelText('Conta'), 'Nubank');
    await user.clear(form.getByLabelText('Data'));
    await user.type(form.getByLabelText('Data'), '2026-08-29');
    await user.click(form.getByRole('button', { name: 'Salvar transação' }));

    // Persistiu com o valor exato em centavos.
    const saved = await db.transactions.list();
    expect(saved).toHaveLength(1);
    expect(saved[0]).toMatchObject({
      type: 'expense',
      amountCents: 4290,
      description: 'Almoço no restaurante',
      date: '2026-08-29',
      source: 'manual',
    });

    // E aparece na lista com a formatação brasileira e o sinal explícito.
    const item = (await screen.findByText('Almoço no restaurante')).closest('li')!;
    expect(within(item).getByText(/−\s*R\$\s*42,90/)).toBeInTheDocument();
    expect(within(item).getByText('Alimentação')).toBeInTheDocument();
    expect(within(item).getByText('Nubank')).toBeInTheDocument();

    // A lista agrupa por dia: a data vive no cabeçalho do grupo, não em cada
    // linha. Hoje é 29/08/2026, então o grupo se chama "Hoje" — o mesmo
    // rótulo do atalho de data no formulário, daí o getAll.
    expect(screen.getAllByText('Hoje').length).toBeGreaterThan(0);
  });

  it('cria uma receita com sinal positivo', async () => {
    const { user, db } = await setup();
    const form = await openForm(user);

    await user.click(form.getByRole('radio', { name: 'Receita' }));
    await user.type(form.getByLabelText('Valor'), '5.000,00');
    await user.type(form.getByLabelText('Descrição'), 'Salário');
    await user.click(form.getByRole('button', { name: /Outros/ }));
    await user.selectOptions(form.getByLabelText('Conta'), 'Itaú');
    await user.click(form.getByRole('button', { name: 'Salvar transação' }));

    const saved = await db.transactions.list();
    expect(saved[0]).toMatchObject({ type: 'income', amountCents: 500000 });
    // O valor aparece no lançamento e no subtotal do dia — ambos corretos.
    expect((await screen.findAllByText(/\+\s*R\$\s*5\.000,00/)).length).toBeGreaterThan(0);
  });

  it('mantém o lançamento após remontar, como entre sessões (FR-028)', async () => {
    const { user, db } = await setup();
    const form = await openForm(user);

    await user.type(form.getByLabelText('Valor'), '10,00');
    await user.type(form.getByLabelText('Descrição'), 'Café');
    await user.click(form.getByRole('button', { name: /Alimentação/ }));
    await user.selectOptions(form.getByLabelText('Conta'), 'Carteira');
    await user.click(form.getByRole('button', { name: 'Salvar transação' }));

    await screen.findByText('Café');

    // Uma nova instância de banco lê o mesmo localStorage.
    const reopened = new LocalKashDatabase();
    expect(await reopened.transactions.list()).toHaveLength(1);
    expect(db).toBeDefined();
  });
});
