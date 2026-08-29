import type { Account, IsoDate, Transaction } from './types';

/**
 * Saldo de uma conta = saldo inicial + tudo que entrou − tudo que saiu, até
 * hoje. Lançamentos futuros não entram: a pergunta é "quanto eu tenho agora".
 */
export function accountBalance(
  account: Account,
  transactions: Transaction[],
  today: IsoDate,
): number {
  return (
    account.initialBalanceCents +
    transactions
      .filter((t) => t.accountId === account.id && t.date <= today)
      .reduce((sum, t) => sum + (t.type === 'income' ? t.amountCents : -t.amountCents), 0)
  );
}

/**
 * Descobre o saldo inicial que faz a conta fechar no valor informado.
 *
 * É o inverso de `accountBalance`: a pessoa digita o saldo que o banco mostra
 * hoje, e nós calculamos o ponto de partida. Isso absorve o que o extrato em
 * CSV não traz — rendimento da conta, por exemplo — sem inventar lançamento.
 */
export function initialBalanceForTarget(
  account: Account,
  transactions: Transaction[],
  today: IsoDate,
  targetBalanceCents: number,
): number {
  const movement = transactions
    .filter((t) => t.accountId === account.id && t.date <= today)
    .reduce((sum, t) => sum + (t.type === 'income' ? t.amountCents : -t.amountCents), 0);

  return targetBalanceCents - movement;
}
