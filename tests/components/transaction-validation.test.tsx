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

  await screen.findByRole('heading', { name: 'Transações' });
  const user = userEvent.setup();
  await user.click(screen.getAllByRole('button', { name: 'Novo lançamento' })[0]!);
  const form = within(await screen.findByRole('dialog'));

  return { db, user, form };
}

beforeEach(() => {
  window.localStorage.clear();
});

describe('validação do formulário (FR-003)', () => {
  it('exibe erro no campo de valor e não cria nada quando o valor está vazio', async () => {
    const { db, user, form } = await setup();

    await user.type(form.getByLabelText('Descrição'), 'Almoço');
    await user.click(form.getByRole('button', { name: /Alimentação/ }));
    await user.click(form.getByRole('button', { name: 'Salvar transação' }));

    expect(await form.findByText('Informe um valor')).toBeInTheDocument();
    expect(await db.transactions.list()).toHaveLength(0);
    // O diálogo continua aberto para a correção.
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('marca o campo de valor como inválido para leitores de tela', async () => {
    const { user, form } = await setup();

    await user.click(form.getByRole('button', { name: 'Salvar transação' }));

    expect(form.getByLabelText('Valor')).toHaveAttribute('aria-invalid', 'true');
  });

  it('rejeita valor zero', async () => {
    const { db, user, form } = await setup();

    await user.type(form.getByLabelText('Valor'), '0');
    await user.type(form.getByLabelText('Descrição'), 'Teste');
    await user.click(form.getByRole('button', { name: /Alimentação/ }));
    await user.click(form.getByRole('button', { name: 'Salvar transação' }));

    expect(await form.findByText('Informe um valor maior que zero')).toBeInTheDocument();
    expect(await db.transactions.list()).toHaveLength(0);
  });

  it('exige descrição', async () => {
    const { db, user, form } = await setup();

    await user.type(form.getByLabelText('Valor'), '42,90');
    await user.click(form.getByRole('button', { name: /Alimentação/ }));
    await user.click(form.getByRole('button', { name: 'Salvar transação' }));

    expect(await form.findByText('Informe uma descrição')).toBeInTheDocument();
    expect(await db.transactions.list()).toHaveLength(0);
  });

  it('exige categoria', async () => {
    const { db, user, form } = await setup();

    await user.type(form.getByLabelText('Valor'), '42,90');
    await user.type(form.getByLabelText('Descrição'), 'Almoço');
    await user.click(form.getByRole('button', { name: 'Salvar transação' }));

    expect(await form.findByText('Selecione uma categoria')).toBeInTheDocument();
    expect(await db.transactions.list()).toHaveLength(0);
  });

  it('acusa todos os campos inválidos de uma vez', async () => {
    const { user, form } = await setup();

    await user.click(form.getByRole('button', { name: 'Salvar transação' }));

    const alerts = await form.findAllByRole('alert');
    expect(alerts.length).toBeGreaterThanOrEqual(3);
  });

  it('rejeita valor não numérico', async () => {
    const { db, user, form } = await setup();

    await user.type(form.getByLabelText('Valor'), 'abc');
    await user.type(form.getByLabelText('Descrição'), 'Teste');
    await user.click(form.getByRole('button', { name: /Alimentação/ }));
    await user.click(form.getByRole('button', { name: 'Salvar transação' }));

    expect(await form.findByText('Valor inválido')).toBeInTheDocument();
    expect(await db.transactions.list()).toHaveLength(0);
  });
});
