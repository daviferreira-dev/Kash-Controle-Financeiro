import { useState, type ReactNode } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import type { Transaction } from '@/domain/types';
import { groupByDay } from '@/domain/grouping';
import { Button, EmptyState, cx } from '@/components/ui';
import { useMoney } from '@/state/hooks';
import { TransactionItem } from './TransactionItem';

interface TransactionListProps {
  transactions: Transaction[];
  onEdit?: (transaction: Transaction) => void;
  onDelete?: (transaction: Transaction) => void;
  onOpen?: (transaction: Transaction) => void;
  /** Exibe o resumo dos itens filtrados acima da lista (FR-005). */
  showTotals?: boolean;
  /** Agrupa por dia com subtotal — como um extrato. */
  groupByDate?: boolean;
  emptyTitle?: string;
  emptyDescription?: string;
  emptyAction?: ReactNode;
}

/** Acima disso, a lista renderiza por partes para não pesar o DOM. */
const LOTE = 60;

export function TransactionList({
  transactions,
  onEdit,
  onDelete,
  onOpen,
  showTotals = false,
  groupByDate = false,
  emptyTitle = 'Nenhum lançamento por aqui',
  emptyDescription = 'Registre sua primeira receita ou despesa para começar a acompanhar seu dinheiro.',
  emptyAction,
}: TransactionListProps) {
  const money = useMoney();
  const reduceMotion = useReducedMotion();
  const [visiveis, setVisiveis] = useState(LOTE);

  if (transactions.length === 0) {
    return <EmptyState title={emptyTitle} description={emptyDescription} action={emptyAction} />;
  }

  const income = transactions
    .filter((t) => t.type === 'income')
    .reduce((sum, t) => sum + t.amountCents, 0);
  const expense = transactions
    .filter((t) => t.type === 'expense')
    .reduce((sum, t) => sum + t.amountCents, 0);

  const plural = transactions.length === 1 ? 'lançamento' : 'lançamentos';
  const recortadas = transactions.slice(0, visiveis);
  const restantes = transactions.length - recortadas.length;

  const itemProps = {
    ...(onEdit ? { onEdit } : {}),
    ...(onDelete ? { onDelete } : {}),
    ...(onOpen ? { onOpen } : {}),
  };

  return (
    <div>
      {showTotals && (
        <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2 border-b border-outline-variant pb-3 text-sm">
          <span className="text-on-surface-variant">
            {transactions.length} {plural}
          </span>
          <span className="flex flex-wrap gap-x-4 gap-y-1">
            <span className="text-on-surface-variant">
              Entradas <span className="tabular font-semibold text-income">{money.format(income)}</span>
            </span>
            <span className="text-on-surface-variant">
              Saídas <span className="tabular font-semibold text-expense">{money.format(expense)}</span>
            </span>
            <span className="text-on-surface-variant">
              Saldo{' '}
              <span className="tabular font-semibold text-on-surface">
                {money.format(income - expense)}
              </span>
            </span>
          </span>
        </div>
      )}

      {groupByDate ? (
        <div className="flex flex-col">
          {groupByDay(recortadas).map((grupo, index) => (
            <motion.section
              key={grupo.date}
              initial={reduceMotion ? false : { opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2, delay: Math.min(index * 0.02, 0.2) }}
            >
              {/* Cabeçalho do dia: gruda no topo ao rolar, como num extrato */}
              <div className="sticky top-0 z-10 -mx-1 flex items-baseline justify-between gap-3 bg-surface-container-lowest/95 px-1 py-2 backdrop-blur">
                <h3 className="font-label text-label-caps uppercase tracking-wide text-on-surface-variant">
                  {grupo.label}
                </h3>
                <span
                  className={cx(
                    'tabular text-xs font-semibold',
                    grupo.netCents >= 0 ? 'text-income' : 'text-expense',
                  )}
                >
                  {grupo.netCents >= 0 ? '+' : '−'} {money.format(Math.abs(grupo.netCents))}
                </span>
              </div>

              <ul>
                {grupo.transactions.map((transaction) => (
                  <TransactionItem
                    key={transaction.id}
                    transaction={transaction}
                    hideDate
                    {...itemProps}
                  />
                ))}
              </ul>
            </motion.section>
          ))}
        </div>
      ) : (
        <ul>
          {recortadas.map((transaction) => (
            <TransactionItem key={transaction.id} transaction={transaction} {...itemProps} />
          ))}
        </ul>
      )}

      {restantes > 0 && (
        <div className="mt-4 flex justify-center">
          <Button variant="secondary" onClick={() => setVisiveis((v) => v + LOTE)}>
            Mostrar mais {Math.min(restantes, LOTE)} de {restantes}
          </Button>
        </div>
      )}
    </div>
  );
}
