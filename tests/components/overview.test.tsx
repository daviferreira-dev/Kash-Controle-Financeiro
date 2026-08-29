import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { KashProvider } from '@/state/KashProvider';
import { LocalKashDatabase } from '@/storage/database';
import { OverviewPage } from '@/pages/OverviewPage';
import { currentMonth, formatMonthLabel, addMonths } from '@/lib/date';
import type { NewTransaction } from '@/domain/types';

async function setup({ empty = false } = {}) {
  window.localStorage.clear();
  const db = new LocalKashDatabase();
  await db.seedIfEmpty();

  if (!empty) {
    const categories = await db.categories.list();
    const accounts = await db.accounts.list();
    const alimentacao = categories.find((c) => c.name === 'Alimentação')!;
    const moradia = categories.find((c) => c.name === 'Moradia')!;
    const outros = categories.find((c) => c.name === 'Outros')!;
    const month = currentMonth();

    const base: Omit<NewTransaction, 'description' | 'date' | 'categoryId' | 'amountCents' | 'type'> =
      {
        accountId: accounts[0]!.id,
        notes: null,
        source: 'manual',
        sourceRecurrenceId: null,
        occurrenceDate: null,
      };

    // Cenário V2: R$ 5.000,00 de receita, R$ 3.200,00 de despesa.
    await db.transactions.create({
      ...base,
      type: 'income',
      amountCents: 500000,
      description: 'Salário',
      date: `${month}-05`,
      categoryId: outros.id,
    });
    await db.transactions.create({
      ...base,
      type: 'expense',
      amountCents: 240000,
      description: 'Aluguel',
      date: `${month}-10`,
      categoryId: moradia.id,
    });
    await db.transactions.create({
      ...base,
      type: 'expense',
      amountCents: 80000,
      description: 'Mercado',
      date: `${month}-15`,
      categoryId: alimentacao.id,
    });
  }

  render(
    <MemoryRouter>
      <KashProvider db={db}>
        <OverviewPage />
      </KashProvider>
    </MemoryRouter>,
  );

  await screen.findByRole('heading', { name: 'Visão geral' });
  return { db, user: userEvent.setup() };
}

beforeEach(() => {
  window.localStorage.clear();
});

describe('totais do Overview (FR-008)', () => {
  it('exibe o saldo do cenário V2: R$ 1.800,00', async () => {
    await setup();

    // Cada total é lido no cartão que o rotula, para a asserção ser inequívoca.
    const cardOf = (label: string) =>
      screen.getByText(label, { selector: 'p' }).closest('div')!;

    expect(within(cardOf('Entradas')).getByText(/R\$\s*5\.000,00/)).toBeInTheDocument();
    expect(within(cardOf('Saídas')).getByText(/R\$\s*3\.200,00/)).toBeInTheDocument();
    expect(within(cardOf('Saldo do mês')).getByText(/R\$\s*1\.800,00/)).toBeInTheDocument();
    expect(
      within(cardOf('Saldo acumulado')).getByText(/R\$\s*1\.800,00/),
    ).toBeInTheDocument();
  });

  it('separa entradas e saídas com rótulo textual', async () => {
    await setup();

    expect(screen.getByText('Entradas', { selector: 'p' })).toBeInTheDocument();
    expect(screen.getByText('Saídas', { selector: 'p' })).toBeInTheDocument();
    expect(screen.getByText('Saldo do mês')).toBeInTheDocument();
    expect(screen.getByText('Saldo acumulado')).toBeInTheDocument();
  });
});

describe('distribuição por categoria (FR-010)', () => {
  it('lista cada categoria com valor e percentual', async () => {
    await setup();

    // A legenda do gráfico é a lista dentro da seção "Gastos por categoria".
    const section = (await screen.findByText('Gastos por categoria')).closest('section')!;
    const legend = within(section).getAllByRole('listitem');

    expect(legend).toHaveLength(2);
    expect(within(legend[0]!).getByText('Moradia')).toBeInTheDocument();
    expect(within(legend[0]!).getByText('75.0%')).toBeInTheDocument();
    expect(within(legend[1]!).getByText('Alimentação')).toBeInTheDocument();
    expect(within(legend[1]!).getByText('25.0%')).toBeInTheDocument();
  });

  it('descreve o gráfico para leitores de tela', async () => {
    await setup();

    expect(
      await screen.findByRole('img', { name: /Distribuição das despesas do mês/ }),
    ).toBeInTheDocument();
  });
});

describe('lançamentos recentes (FR-011)', () => {
  it('exibe os recentes e o link para a lista completa', async () => {
    await setup();

    expect(await screen.findByText('Lançamentos recentes')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ver todos' })).toHaveAttribute('href', '/transacoes');
  });
});

describe('navegação entre meses (FR-012)', () => {
  it('recalcula os indicadores ao trocar de mês', async () => {
    const { user } = await setup();

    expect(screen.getAllByText(formatMonthLabel(currentMonth()))[0]).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Mês anterior' }));

    expect(
      await screen.findByText(formatMonthLabel(addMonths(currentMonth(), -1))),
    ).toBeInTheDocument();
    // Sem lançamentos no mês anterior, cai no estado vazio.
    expect(screen.getByText('Nada lançado neste mês')).toBeInTheDocument();
  });

  it('o seletor de período leva de volta ao mês atual em um clique', async () => {
    const { user } = await setup();

    await user.click(screen.getByRole('button', { name: 'Mês anterior' }));
    expect(screen.getByText(/não é o mês atual/)).toBeInTheDocument();

    // Abre o seletor e usa o atalho.
    await user.click(screen.getByRole('button', { name: /Agosto|Janeiro|Fevereiro|Março|Abril|Maio|Junho|Julho|Setembro|Outubro|Novembro|Dezembro/ }));
    await user.click(await screen.findByRole('button', { name: 'Este mês' }));

    expect(screen.getAllByText(formatMonthLabel(currentMonth()))[0]).toBeInTheDocument();
  });
});

describe('estado vazio (FR-013)', () => {
  it('explica o que fazer em vez de mostrar números ambíguos', async () => {
    await setup({ empty: true });

    expect(await screen.findByText('Nada lançado neste mês')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Registrar lançamento' })).toBeInTheDocument();
    expect(screen.queryByText('Gastos por categoria')).not.toBeInTheDocument();
  });
});
