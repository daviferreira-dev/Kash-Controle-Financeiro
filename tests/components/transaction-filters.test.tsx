import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { KashProvider } from '@/state/KashProvider';
import { LocalKashDatabase } from '@/storage/database';
import { TransactionsPage } from '@/pages/TransactionsPage';
import { currentMonth, addMonths } from '@/lib/date';
import type { NewTransaction } from '@/domain/types';

async function setup() {
  window.localStorage.clear();
  const db = new LocalKashDatabase();
  await db.seedIfEmpty();

  const categories = await db.categories.list();
  const accounts = await db.accounts.list();
  const alimentacao = categories.find((c) => c.name === 'Alimentação')!;
  const transporte = categories.find((c) => c.name === 'Transporte')!;
  const outros = categories.find((c) => c.name === 'Outros')!;
  const nubank = accounts.find((a) => a.name === 'Nubank')!;
  const itau = accounts.find((a) => a.name === 'Itaú')!;

  const month = currentMonth();
  const previous = addMonths(month, -1);

  const base: Omit<NewTransaction, 'description' | 'date' | 'categoryId' | 'accountId'> = {
    type: 'expense',
    amountCents: 10000,
    notes: null,
    source: 'manual',
    sourceRecurrenceId: null,
    occurrenceDate: null,
  };

  await db.transactions.create({
    ...base,
    description: 'Almoço',
    date: `${month}-15`,
    categoryId: alimentacao.id,
    accountId: nubank.id,
  });
  await db.transactions.create({
    ...base,
    type: 'income',
    amountCents: 500000,
    description: 'Salário',
    date: `${month}-05`,
    categoryId: outros.id,
    accountId: itau.id,
  });
  await db.transactions.create({
    ...base,
    amountCents: 2500,
    description: 'Uber para o trabalho',
    date: `${month}-20`,
    categoryId: transporte.id,
    accountId: nubank.id,
  });
  await db.transactions.create({
    ...base,
    description: 'Compra do mês passado',
    date: `${previous}-10`,
    categoryId: alimentacao.id,
    accountId: nubank.id,
  });

  render(
    <MemoryRouter>
      <KashProvider db={db}>
        <TransactionsPage />
      </KashProvider>
    </MemoryRouter>,
  );

  await screen.findByText('Almoço');
  return { db, user: userEvent.setup() };
}

/** Abre o painel de filtros avançados (categoria e conta). */
async function abrirFiltros(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: /Filtros/ }));
}

beforeEach(() => {
  window.localStorage.clear();
});

describe('filtros da lista (FR-005)', () => {
  it('mostra apenas o mês selecionado por padrão', async () => {
    await setup();

    expect(screen.getByText('Almoço')).toBeInTheDocument();
    expect(screen.queryByText('Compra do mês passado')).not.toBeInTheDocument();
    expect(screen.getByText('3 lançamentos')).toBeInTheDocument();
  });

  it('ordena por data decrescente', async () => {
    await setup();

    const descriptions = screen
      .getAllByRole('listitem')
      .map((li) => li.querySelector('p')?.textContent);

    expect(descriptions).toEqual(['Uber para o trabalho', 'Almoço', 'Salário']);
  });

  it('filtra por tipo no controle segmentado', async () => {
    const { user } = await setup();

    await user.click(screen.getByRole('radio', { name: 'Entradas' }));

    expect(screen.getByText('Salário')).toBeInTheDocument();
    expect(screen.queryByText('Almoço')).not.toBeInTheDocument();
    expect(screen.getByText('1 lançamento')).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Entradas' })).toHaveAttribute('aria-checked', 'true');
  });

  it('filtra por categoria nos chips', async () => {
    const { user } = await setup();
    await abrirFiltros(user);

    await user.click(screen.getByRole('button', { name: 'Transporte', pressed: false }));

    expect(screen.getByText('Uber para o trabalho')).toBeInTheDocument();
    expect(screen.queryByText('Almoço')).not.toBeInTheDocument();
  });

  it('clicar de novo no mesmo chip remove o filtro', async () => {
    const { user } = await setup();
    await abrirFiltros(user);

    const chip = screen.getByRole('button', { name: 'Transporte', pressed: false });
    await user.click(chip);
    expect(screen.getByText('1 lançamento')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Transporte', pressed: true }));
    expect(screen.getByText('3 lançamentos')).toBeInTheDocument();
  });

  it('filtra por conta', async () => {
    const { user } = await setup();
    await abrirFiltros(user);

    await user.click(screen.getByRole('button', { name: 'Itaú', pressed: false }));

    expect(screen.getByText('Salário')).toBeInTheDocument();
    expect(screen.queryByText('Almoço')).not.toBeInTheDocument();
  });

  it('busca por descrição sem diferenciar maiúsculas', async () => {
    const { user } = await setup();

    await user.type(screen.getByLabelText('Buscar por descrição'), 'UBER');

    expect(screen.getByText('Uber para o trabalho')).toBeInTheDocument();
    expect(screen.queryByText('Almoço')).not.toBeInTheDocument();
  });

  it('combina filtros com E lógico', async () => {
    const { user } = await setup();

    await user.click(screen.getByRole('radio', { name: 'Saídas' }));
    await abrirFiltros(user);
    await user.click(screen.getByRole('button', { name: 'Nubank', pressed: false }));

    expect(screen.getByText('2 lançamentos')).toBeInTheDocument();
    expect(screen.queryByText('Salário')).not.toBeInTheDocument();
  });

  it('mostra quantos filtros estão ativos', async () => {
    const { user } = await setup();

    await user.click(screen.getByRole('radio', { name: 'Saídas' }));
    await abrirFiltros(user);
    await user.click(screen.getByRole('button', { name: 'Nubank', pressed: false }));

    expect(screen.getByRole('button', { name: /Filtros/ })).toHaveTextContent('2');
  });

  it('exibe o total dos itens filtrados', async () => {
    const { user } = await setup();
    await abrirFiltros(user);

    await user.click(screen.getByRole('button', { name: 'Transporte', pressed: false }));

    // 'Saídas' também nomeia o filtro de tipo; pegamos o do resumo da lista.
    const resumo = screen.getAllByText(/Saídas/).find((el) => /25,00/.test(el.textContent ?? ''));
    expect(resumo).toBeDefined();
  });

  it('limpa os filtros e volta a listar tudo do mês', async () => {
    const { user } = await setup();

    await user.click(screen.getByRole('radio', { name: 'Entradas' }));
    await user.click(screen.getByRole('button', { name: 'Limpar' }));

    expect(screen.getByText('3 lançamentos')).toBeInTheDocument();
  });

  it('navega para o mês anterior e mostra o lançamento de lá', async () => {
    const { user } = await setup();

    await user.click(screen.getByRole('button', { name: 'Mês anterior' }));

    expect(await screen.findByText('Compra do mês passado')).toBeInTheDocument();
    expect(screen.queryByText('Almoço')).not.toBeInTheDocument();
  });

  it('mostra estado vazio quando nada corresponde ao filtro', async () => {
    const { user } = await setup();

    await user.type(screen.getByLabelText('Buscar por descrição'), 'zzzz');

    expect(await screen.findByText('Nenhum lançamento neste período')).toBeInTheDocument();
  });
});
