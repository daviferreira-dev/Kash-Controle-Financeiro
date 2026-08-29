import { useState, type FormEvent } from 'react';
import type { Account } from '@/domain/types';
import { accountBalance, initialBalanceForTarget } from '@/domain/accountBalance';
import { centsToInputValue, parseBRL } from '@/lib/money';
import { today } from '@/lib/date';
import { ValidationError } from '@/lib/errors';
import { useAccounts, useKash, useMoney } from '@/state/hooks';
import { Button, Card, CurrencyInput, Modal, SectionHeader, cx } from '@/components/ui';

/**
 * Ajuste do saldo das contas.
 *
 * A pessoa informa o saldo que o banco mostra hoje, e nós calculamos o ponto
 * de partida por trás. É o único jeito honesto de fechar com a realidade
 * quando o extrato em CSV não traz tudo — o rendimento da conta, por exemplo,
 * não vem em lançamento nenhum.
 */
export function AccountBalances() {
  const { accounts, transactions } = useKash();
  const { update } = useAccounts();
  const money = useMoney();

  const [editing, setEditing] = useState<Account | null>(null);
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | undefined>();
  const [saving, setSaving] = useState(false);

  const now = today();
  const active = accounts.filter((a) => !a.archived);

  function openEdit(account: Account) {
    setEditing(account);
    setValue(centsToInputValue(accountBalance(account, transactions, now)));
    setError(undefined);
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!editing) return;

    let target: number;
    try {
      target = parseBRL(value);
    } catch (err) {
      setError(err instanceof ValidationError ? err.message : 'Valor inválido');
      return;
    }

    setSaving(true);
    try {
      const initial = initialBalanceForTarget(editing, transactions, now, target);
      await update(editing.id, { initialBalanceCents: initial });
      setEditing(null);
    } finally {
      setSaving(false);
    }
  }

  const total = active.reduce((sum, a) => sum + accountBalance(a, transactions, now), 0);

  return (
    <section>
      <SectionHeader>Saldo das contas</SectionHeader>
      <Card>
        <p className="text-sm text-on-surface-variant">
          O extrato em CSV traz os lançamentos, mas não o saldo da conta — e coisas como o
          rendimento não aparecem em lançamento nenhum. Informe aqui o saldo que o app do banco
          mostra e o Kash acerta o resto sozinho.
        </p>

        <ul className="mt-4 divide-y divide-outline-variant">
          {active.map((account) => {
            const balance = accountBalance(account, transactions, now);
            return (
              <li key={account.id} className="flex items-center justify-between gap-3 py-3">
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium text-on-surface">
                    {account.name}
                  </span>
                  <span
                    className={cx(
                      'tabular text-sm',
                      balance < 0 ? 'text-expense' : 'text-on-surface-variant',
                    )}
                  >
                    {money.format(balance)}
                  </span>
                </span>
                <Button variant="secondary" onClick={() => openEdit(account)}>
                  Ajustar saldo
                </Button>
              </li>
            );
          })}
        </ul>

        <div className="mt-3 flex items-baseline justify-between gap-3 border-t border-outline-variant pt-3">
          <span className="font-label text-label-caps uppercase text-on-surface-variant">
            Total
          </span>
          <span className="tabular font-display text-financial-data text-on-surface">
            {money.format(total)}
          </span>
        </div>
      </Card>

      <Modal
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={`Saldo de ${editing?.name ?? ''}`}
      >
        <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-5">
          <CurrencyInput
            label="Saldo que o banco mostra hoje"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            error={error}
            hint="O Kash ajusta o ponto de partida da conta para bater com este valor. Nenhum lançamento é criado ou alterado."
            autoFocus
          />

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="secondary" onClick={() => setEditing(null)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? 'Salvando…' : 'Salvar saldo'}
            </Button>
          </div>
        </form>
      </Modal>
    </section>
  );
}
