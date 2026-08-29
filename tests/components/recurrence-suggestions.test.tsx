import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { KashProvider } from '@/state/KashProvider';
import { LocalKashDatabase } from '@/storage/database';
import { RecurrencesPage } from '@/pages/RecurrencesPage';
import type { NewTransaction } from '@/domain/types';

async function setup() {
  window.localStorage.clear();
  const db = new LocalKashDatabase();
  await db.seedIfEmpty();

  const categories = await db.categories.list();
  const accounts = await db.accounts.list();
  const moradia = categories.find((c) => c.name === 'Moradia')!;
  const nubank = accounts.find((a) => a.name === 'Nubank')!;

  const base: Omit<NewTransaction, 'date' | 'description' | 'amountCents'> = {
    type: 'expense',
    categoryId: moradia.id,
    accountId: nubank.id,
    notes: null,
    source: 'manual',
    sourceRecurrenceId: null,
    occurrenceDate: null,
  };

  // Aluguel mensal, com a descrição e o valor variando um pouco entre meses.
  await db.transactions.createMany([
    { ...base, date: '2026-06-02', amountCents: 150000, description: 'Pagamento de boleto efetuado - IMOBILIARIA DANELLI LTDA' },
    { ...base, date: '2026-07-02', amountCents: 150000, description: 'Pagamento de boleto efetuado - IMOBILIARIA DANELLI LTDA' },
    { ...base, date: '2026-08-03', amountCents: 152000, description: 'Pagamento de boleto efetuado - IMOBILIARIA DANELLI' },
    // Compras avulsas: não devem virar sugestão.
    { ...base, date: '2026-08-05', amountCents: 4000, description: 'Compra no débito - POSTO SHELL' },
    { ...base, date: '2026-08-19', amountCents: 9000, description: 'Compra no débito - POSTO SHELL' },
  ]);

  render(
    <MemoryRouter>
      <KashProvider db={db}>
        <RecurrencesPage />
      </KashProvider>
    </MemoryRouter>,
  );

  await screen.findByRole('heading', { name: 'Recorrências' });
  return { db, user: userEvent.setup() };
}

beforeEach(() => {
  window.localStorage.clear();
});

describe('sugestões de recorrência a partir do histórico', () => {
  it('mostra o padrão detectado com frequência, valor e próxima data', async () => {
    await setup();

    expect(await screen.findByText('Padrões encontrados no seu histórico')).toBeInTheDocument();

    const card = (await screen.findByText('Imobiliaria Danelli')).closest('div')!
      .parentElement!.parentElement!;
    expect(within(card).getByText('Mensal')).toBeInTheDocument();
    expect(within(card).getByText(/R\$\s*1\.500,00/)).toBeInTheDocument();
    expect(within(card).getByText(/Próximo esperado em 02\/09\/2026/)).toBeInTheDocument();
  });

  it('não sugere compras avulsas sem cadência', async () => {
    await setup();
    await screen.findByText('Imobiliaria Danelli');

    expect(screen.queryByText('Posto Shell')).not.toBeInTheDocument();
  });

  it('criar a recorrência a cadastra pausada e some da lista de sugestões', async () => {
    const { db, user } = await setup();
    await screen.findByText('Imobiliaria Danelli');

    await user.click(screen.getByRole('button', { name: 'Criar recorrência' }));

    const recurrences = await db.recurrences.list();
    expect(recurrences).toHaveLength(1);
    expect(recurrences[0]).toMatchObject({
      description: 'Imobiliaria Danelli',
      frequency: 'monthly',
      amountCents: 150000,
      // Nasce pausada: os lançamentos já existem no histórico e gerar os
      // próximos duplicaria o que vem no extrato.
      status: 'paused',
      lastGeneratedDate: '2026-08-03',
    });

    expect(screen.queryByText('Padrões encontrados no seu histórico')).not.toBeInTheDocument();
  });

  it('dispensar o padrão o remove e a escolha persiste', async () => {
    const { user } = await setup();
    await screen.findByText('Imobiliaria Danelli');

    await user.click(screen.getByRole('button', { name: 'Não é recorrência' }));

    expect(screen.queryByText('Padrões encontrados no seu histórico')).not.toBeInTheDocument();
    // A dispensa fica gravada, para não reaparecer na próxima importação.
    expect(window.localStorage.getItem('kash:dismissedPatterns')).toContain('IMOBILIARIA DANELLI');
  });

  it('sem histórico suficiente, a seção nem aparece', async () => {
    window.localStorage.clear();
    const db = new LocalKashDatabase();
    await db.seedIfEmpty();

    render(
      <MemoryRouter>
        <KashProvider db={db}>
          <RecurrencesPage />
        </KashProvider>
      </MemoryRouter>,
    );

    await screen.findByRole('heading', { name: 'Recorrências' });
    expect(screen.queryByText('Padrões encontrados no seu histórico')).not.toBeInTheDocument();
  });
});
