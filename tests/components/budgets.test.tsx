import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { KashProvider } from '@/state/KashProvider';
import { LocalKashDatabase } from '@/storage/database';
import { BudgetsPage } from '@/pages/BudgetsPage';
import { currentMonth } from '@/lib/date';

async function setup({ spentCents = 0 } = {}) {
  window.localStorage.clear();
  const db = new LocalKashDatabase();
  await db.seedIfEmpty();

  const categories = await db.categories.list();
  const accounts = await db.accounts.list();
  const alimentacao = categories.find((c) => c.name === 'Alimentação')!;
  const month = currentMonth();

  if (spentCents > 0) {
    await db.transactions.create({
      type: 'expense',
      amountCents: spentCents,
      description: 'Mercado',
      date: `${month}-15`,
      categoryId: alimentacao.id,
      accountId: accounts[0]!.id,
      notes: null,
      source: 'manual',
      sourceRecurrenceId: null,
      occurrenceDate: null,
    });
  }

  render(
    <MemoryRouter>
      <KashProvider db={db}>
        <BudgetsPage />
      </KashProvider>
    </MemoryRouter>,
  );

  await screen.findByRole('heading', { name: 'Orçamentos' });
  return { db, user: userEvent.setup(), alimentacaoId: alimentacao.id };
}

async function createBudget(user: ReturnType<typeof userEvent.setup>, limit: string) {
  await user.click(screen.getAllByRole('button', { name: /Novo orçamento|Definir orçamento/ })[0]!);
  const form = within(await screen.findByRole('dialog'));

  await user.selectOptions(form.getByLabelText('Categoria'), 'Alimentação');
  await user.type(form.getByLabelText('Limite mensal'), limit);
  await user.click(form.getByRole('button', { name: 'Salvar orçamento' }));
}

beforeEach(() => {
  window.localStorage.clear();
});

describe('definição de orçamentos (FR-014)', () => {
  it('cria um orçamento e exibe o consumo', async () => {
    const { db, user } = await setup({ spentCents: 60000 });

    await createBudget(user, '800,00');

    // Cenário V3: R$ 600 de R$ 800 = 75%.
    expect(await screen.findByText('75%')).toBeInTheDocument();
    expect(screen.getByText('Dentro do limite')).toBeInTheDocument();
    expect(screen.getByText(/Restam\s+R\$\s*200,00/)).toBeInTheDocument();

    const budgets = await db.budgets.list();
    expect(budgets).toHaveLength(1);
    expect(budgets[0]!.limitCents).toBe(80000);
  });

  it('mostra 0% e restante integral quando não há gastos', async () => {
    const { user } = await setup();

    await createBudget(user, '800,00');

    expect(await screen.findByText('0%')).toBeInTheDocument();
    expect(screen.getByText(/Restam\s+R\$\s*800,00/)).toBeInTheDocument();
  });
});

describe('faixas de status (FR-016, SC-007)', () => {
  it('marca "Em atenção" acima de 80%', async () => {
    const { user } = await setup({ spentCents: 65000 }); // 81,25%

    await createBudget(user, '800,00');

    expect(await screen.findByText('Em atenção')).toBeInTheDocument();
  });

  it('marca "Estourado" acima de 100% e mostra o excedente', async () => {
    const { user } = await setup({ spentCents: 85000 }); // 106,25%

    await createBudget(user, '800,00');

    expect(await screen.findByText('Estourado')).toBeInTheDocument();
    expect(screen.getByText(/Excedeu em\s+R\$\s*50,00/)).toBeInTheDocument();
  });

  it('expõe o consumo na barra de progresso para leitores de tela', async () => {
    const { user } = await setup({ spentCents: 60000 });

    await createBudget(user, '800,00');

    const bar = await screen.findByRole('progressbar');
    expect(bar).toHaveAttribute('aria-valuenow', '75');
  });
});

describe('um orçamento por categoria (FR-017)', () => {
  it('substitui o limite anterior em vez de criar um segundo', async () => {
    const { db, user } = await setup({ spentCents: 60000 });

    await createBudget(user, '800,00');
    await screen.findByText('75%');

    // Redefinir pelo botão "Alterar limite".
    await user.click(screen.getByRole('button', { name: 'Alterar limite' }));
    const form = within(await screen.findByRole('dialog'));
    const field = form.getByLabelText('Limite mensal');
    await user.clear(field);
    await user.type(field, '1.000,00');
    await user.click(form.getByRole('button', { name: 'Salvar orçamento' }));

    const budgets = await db.budgets.list();
    expect(budgets).toHaveLength(1);
    expect(budgets[0]!.limitCents).toBe(100000);
    expect(await screen.findByText('60%')).toBeInTheDocument();
  });
});

describe('estado vazio', () => {
  it('convida a definir o primeiro orçamento', async () => {
    await setup();

    expect(await screen.findByText('Nenhum orçamento definido')).toBeInTheDocument();
  });
});
