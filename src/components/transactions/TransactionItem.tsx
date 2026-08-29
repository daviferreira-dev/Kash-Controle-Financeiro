import type { Transaction } from '@/domain/types';
import { formatBR } from '@/lib/date';
import { useAccounts, useCategories, useMoney } from '@/state/hooks';
import { cx } from '@/components/ui';

interface TransactionItemProps {
  transaction: Transaction;
  onEdit?: (transaction: Transaction) => void;
  onDelete?: (transaction: Transaction) => void;
  /** Abre o detalhe do lançamento. */
  onOpen?: (transaction: Transaction) => void;
  /** Omite a data — usado quando a lista já agrupa por dia. */
  hideDate?: boolean;
}

export function TransactionItem({
  transaction,
  onEdit,
  onDelete,
  onOpen,
  hideDate = false,
}: TransactionItemProps) {
  const { byId: categoryById } = useCategories();
  const { byId: accountById } = useAccounts();
  const money = useMoney();

  const category = categoryById(transaction.categoryId);
  const account = accountById(transaction.accountId);
  const isIncome = transaction.type === 'income';

  const conteudo = (
    <>
      <div className="flex min-w-0 flex-1 items-start gap-3">
        <span
          aria-hidden
          className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full"
          style={{ backgroundColor: category?.color ?? 'var(--color-outline)' }}
        />
        <div className="min-w-0">
          <p className="truncate font-medium text-on-surface">{transaction.description}</p>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-on-surface-variant">
            <span>{category?.name ?? 'Sem categoria'}</span>
            <span aria-hidden>·</span>
            <span>{account?.name ?? 'Sem conta'}</span>
            {!hideDate && (
              <>
                <span aria-hidden>·</span>
                <span>{formatBR(transaction.date)}</span>
              </>
            )}
            {transaction.source === 'recurrence' && (
              // Marcação de origem (FR-024): textual, não só um ícone.
              <span className="rounded bg-tertiary-container px-1.5 py-0.5 font-medium text-on-surface">
                Recorrência
              </span>
            )}
          </p>
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-1">
        {/* O sinal explícito garante a leitura sem depender da cor (FR-007). */}
        <span
          className={cx(
            'tabular whitespace-nowrap font-display text-base font-semibold',
            isIncome ? 'text-income' : 'text-expense',
          )}
        >
          {money.formatSigned(transaction.amountCents, transaction.type)}
        </span>
        <span className="sr-only">{isIncome ? 'Receita' : 'Despesa'}</span>
      </div>
    </>
  );

  return (
    <li className="group border-b border-outline-variant last:border-b-0">
      {onOpen ? (
        <button
          type="button"
          onClick={() => onOpen(transaction)}
          className="flex w-full items-start justify-between gap-3 rounded px-1 py-3.5 text-left transition hover:bg-surface-container"
        >
          {conteudo}
        </button>
      ) : (
        <div className="flex items-start justify-between gap-3 px-1 py-3.5">{conteudo}</div>
      )}

      {/*
        Ações fora do fluxo principal: aparecem no hover, no foco por teclado e
        sempre no toque, onde não existe hover. Sem isso, 47 lançamentos viram
        94 botões competindo com a leitura.
      */}
      {(onEdit || onDelete) && (
        <div className="flex justify-end gap-1 pb-2 opacity-100 transition-opacity md:opacity-0 md:group-focus-within:opacity-100 md:group-hover:opacity-100">
          {onEdit && (
            <button
              type="button"
              onClick={() => onEdit(transaction)}
              className="inline-flex min-h-11 items-center justify-center rounded px-3 text-xs font-medium text-on-surface-variant transition hover:bg-surface-container"
              aria-label={`Editar ${transaction.description}`}
            >
              Editar
            </button>
          )}
          {onDelete && (
            <button
              type="button"
              onClick={() => onDelete(transaction)}
              className="inline-flex min-h-11 items-center justify-center rounded px-3 text-xs font-medium text-error transition hover:bg-error-container"
              aria-label={`Excluir ${transaction.description}`}
            >
              Excluir
            </button>
          )}
        </div>
      )}
    </li>
  );
}
