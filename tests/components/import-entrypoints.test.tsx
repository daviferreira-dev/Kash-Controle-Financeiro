import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { App } from '@/App';
import { KashProvider } from '@/state/KashProvider';
import { LocalKashDatabase } from '@/storage/database';

/**
 * Importar extrato é a primeira coisa que alguém faz ao começar a usar o app.
 * Estes testes fixam os caminhos até lá — se algum sumir, a funcionalidade
 * vira invisível mesmo continuando a existir.
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

  return { db, user: userEvent.setup() };
}

beforeEach(() => {
  window.localStorage.clear();
});

describe('caminhos até a importação de extrato', () => {
  it('a rota /importar mostra a tela de importação', async () => {
    await bootApp('/importar');

    expect(await screen.findByRole('heading', { name: 'Importar extrato' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Escolher arquivo CSV' })).toBeInTheDocument();
  });

  it('Transações tem o botão no cabeçalho, ao lado de novo lançamento', async () => {
    const { user } = await bootApp('/transacoes');
    await screen.findByRole('heading', { name: 'Transações' });

    const link = screen.getAllByRole('link', { name: 'Importar extrato' })[0]!;
    expect(link).toHaveAttribute('href', '/importar');

    await user.click(link);
    expect(await screen.findByRole('heading', { name: 'Importar extrato' })).toBeInTheDocument();
  });

  it('o estado vazio de Transações oferece importar, além de lançar', async () => {
    await bootApp('/transacoes');
    await screen.findByText('Nenhum lançamento neste período');

    expect(screen.getAllByRole('button', { name: 'Novo lançamento' }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('link', { name: 'Importar extrato' }).length).toBeGreaterThan(0);
  });

  it('o estado vazio do Overview oferece importar', async () => {
    await bootApp('/');
    await screen.findByText('Nada lançado neste mês');

    const link = screen.getByRole('link', { name: 'Importar extrato' });
    expect(link).toHaveAttribute('href', '/importar');
  });

  it('Ajustes continua levando à importação, para quem procura lá', async () => {
    const { user } = await bootApp('/configuracoes');
    await screen.findByRole('heading', { name: 'Ajustes' });

    await user.click(screen.getByRole('button', { name: 'Importar extrato (CSV)' }));

    expect(await screen.findByRole('heading', { name: 'Importar extrato' })).toBeInTheDocument();
  });

  it('a tela de importação volta para transações', async () => {
    const { user } = await bootApp('/importar');
    await screen.findByRole('heading', { name: 'Importar extrato' });

    await user.click(screen.getByRole('link', { name: /Voltar para transações/ }));

    expect(await screen.findByRole('heading', { name: 'Transações' })).toBeInTheDocument();
  });
});
