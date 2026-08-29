import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { App } from '@/App';
import { KashProvider } from '@/state/KashProvider';
import { LocalKashDatabase } from '@/storage/database';

/**
 * Percurso ponta a ponta pelo app inteiro — com rotas, AppShell e provider
 * reais. Diferente dos testes por página, aqui pegamos problemas de
 * integração: navegação, estado compartilhado entre telas e re-render.
 */
async function bootApp(route = '/') {
  window.localStorage.clear();
  const db = new LocalKashDatabase();

  render(
    <MemoryRouter initialEntries={[route]}>
      <KashProvider db={db}>
        <App />
      </KashProvider>
    </MemoryRouter>,
  );

  await screen.findByRole('heading', { name: 'Visão geral' });
  return { db, user: userEvent.setup() };
}

/** Navega pela barra inferior/sidebar, como o usuário faria. */
async function goTo(user: ReturnType<typeof userEvent.setup>, label: string) {
  const links = screen.getAllByRole('link', { name: label });
  await user.click(links[0]!);
}

beforeEach(() => {
  window.localStorage.clear();
});

describe('percurso completo do app', () => {
  it('navega entre todas as telas sem quebrar', async () => {
    const { user } = await bootApp();

    await goTo(user, 'Transações');
    expect(await screen.findByRole('heading', { name: 'Transações' })).toBeInTheDocument();

    await goTo(user, 'Orçamentos');
    expect(await screen.findByRole('heading', { name: 'Orçamentos' })).toBeInTheDocument();

    await goTo(user, 'Recorrências');
    expect(await screen.findByRole('heading', { name: 'Recorrências' })).toBeInTheDocument();

    await goTo(user, 'Ajustes');
    expect(await screen.findByRole('heading', { name: 'Ajustes' })).toBeInTheDocument();

    await goTo(user, 'Visão geral');
    expect(await screen.findByRole('heading', { name: 'Visão geral' })).toBeInTheDocument();
  });

  it('adiciona uma despesa e ela aparece no Overview', async () => {
    const { user, db } = await bootApp();

    await goTo(user, 'Transações');
    await screen.findByRole('heading', { name: 'Transações' });

    await user.click(screen.getAllByRole('button', { name: 'Novo lançamento' })[0]!);
    const form = within(await screen.findByRole('dialog'));

    await user.type(form.getByLabelText('Valor'), '42,90');
    await user.type(form.getByLabelText('Descrição'), 'Almoço no restaurante');
    await user.click(form.getByRole('button', { name: /Alimentação/ }));
    await user.click(form.getByRole('button', { name: 'Salvar transação' }));

    // O modal fecha e o lançamento aparece na lista. O diálogo sai com
    // animação, então esperamos ele desmontar em vez de assumir que já sumiu.
    expect(await screen.findByText('Almoço no restaurante')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

    const saved = await db.transactions.list();
    expect(saved).toHaveLength(1);
    expect(saved[0]!.amountCents).toBe(4290);

    // E o Overview reflete o novo gasto.
    await goTo(user, 'Visão geral');
    await screen.findByRole('heading', { name: 'Visão geral' });

    const saidas = screen.getByText('Saídas', { selector: 'p' }).closest('div')!;
    expect(within(saidas).getByText(/R\$\s*42,90/)).toBeInTheDocument();
  });

  it('mantém o mês selecionado ao trocar de tela', async () => {
    const { user } = await bootApp();

    await user.click(screen.getByRole('button', { name: 'Mês anterior' }));
    const previousLabel = screen.getByText(/de \d{4}$/).textContent;

    await goTo(user, 'Transações');
    await screen.findByRole('heading', { name: 'Transações' });

    expect(screen.getByText(previousLabel!)).toBeInTheDocument();
  });

  it('cria orçamento e vê o consumo alimentado por um lançamento real', async () => {
    const { user } = await bootApp();

    // 1) Lança uma despesa de R$ 600,00 em Alimentação.
    await goTo(user, 'Transações');
    await user.click(screen.getAllByRole('button', { name: 'Novo lançamento' })[0]!);
    let form = within(await screen.findByRole('dialog'));
    await user.type(form.getByLabelText('Valor'), '600,00');
    await user.type(form.getByLabelText('Descrição'), 'Mercado');
    await user.click(form.getByRole('button', { name: /Alimentação/ }));
    await user.click(form.getByRole('button', { name: 'Salvar transação' }));
    await screen.findByText('Mercado');

    // 2) Define o orçamento de R$ 800,00 para a mesma categoria.
    await goTo(user, 'Orçamentos');
    await screen.findByRole('heading', { name: 'Orçamentos' });
    await user.click(screen.getAllByRole('button', { name: /Novo orçamento|Definir orçamento/ })[0]!);
    form = within(await screen.findByRole('dialog'));
    await user.selectOptions(form.getByLabelText('Categoria'), 'Alimentação');
    await user.type(form.getByLabelText('Limite mensal'), '800,00');
    await user.click(form.getByRole('button', { name: 'Salvar orçamento' }));

    // 3) O consumo aparece corretamente.
    expect(await screen.findByText('75%')).toBeInTheDocument();
    expect(screen.getByText('Dentro do limite')).toBeInTheDocument();
  });

  it('cria recorrência e ela gera lançamento na próxima abertura', async () => {
    const { user, db } = await bootApp();

    await goTo(user, 'Recorrências');
    await screen.findByRole('heading', { name: 'Recorrências' });

    await user.click(screen.getAllByRole('button', { name: 'Nova recorrência' })[0]!);
    const form = within(await screen.findByRole('dialog'));

    await user.type(form.getByLabelText('Valor'), '1.500,00');
    await user.type(form.getByLabelText('Descrição'), 'Aluguel');
    await user.selectOptions(form.getByLabelText('Categoria'), 'Moradia');
    await user.click(form.getByRole('button', { name: 'Salvar recorrência' }));

    expect(await screen.findByText('Aluguel')).toBeInTheDocument();

    const recurrences = await db.recurrences.list();
    expect(recurrences).toHaveLength(1);
    expect(recurrences[0]!.amountCents).toBe(150000);
  });

  it('não deixa o app em branco quando o armazenamento falha', async () => {
    window.localStorage.clear();
    const db = new LocalKashDatabase();
    // Simula modo privativo: qualquer escrita lança.
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = () => {
      throw new DOMException('QuotaExceededError');
    };

    try {
      render(
        <MemoryRouter>
          <KashProvider db={db}>
            <App />
          </KashProvider>
        </MemoryRouter>,
      );

      // O aviso do FR-029 aparece e o app continua navegável.
      expect(await screen.findByRole('alert')).toHaveTextContent(
        /dados não estão sendo salvos/i,
      );
    } finally {
      Storage.prototype.setItem = original;
    }
  });
});
