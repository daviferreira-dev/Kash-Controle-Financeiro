import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import type { NewTransaction, Transaction } from '@/domain/types';
import { isInMonth } from '@/lib/date';
import { useKash, useTransactions } from '@/state/hooks';
import { Button, ConfirmDialog, Modal, useToast } from '@/components/ui';
import { MonthSwitcher } from '@/components/layout/MonthSwitcher';
import { TransactionForm } from '@/components/transactions/TransactionForm';
import { TransactionList } from '@/components/transactions/TransactionList';
import {
  EMPTY_FILTERS,
  TransactionFilters,
  type FilterState,
} from '@/components/transactions/TransactionFilters';

export function TransactionsPage() {
  const { month } = useKash();
  const { transactions, create, update, remove } = useTransactions();
  const { notify } = useToast();

  const [filters, setFilters] = useState<FilterState>(EMPTY_FILTERS);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Transaction | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Transaction | null>(null);

  // Filtragem em memória: o dataset inteiro já está carregado (R-004).
  const filtered = useMemo(() => {
    const search = filters.search.trim().toLowerCase();

    return transactions.filter((t) => {
      if (!isInMonth(t.date, month)) return false;
      if (filters.type && t.type !== filters.type) return false;
      if (filters.categoryId && t.categoryId !== filters.categoryId) return false;
      if (filters.accountId && t.accountId !== filters.accountId) return false;
      if (search && !t.description.toLowerCase().includes(search)) return false;
      return true;
    });
  }, [transactions, month, filters]);

  function openCreate() {
    setEditing(null);
    setFormOpen(true);
  }

  function openEdit(transaction: Transaction) {
    setEditing(transaction);
    setFormOpen(true);
  }

  function closeForm() {
    setFormOpen(false);
    setEditing(null);
  }

  async function handleSubmit(input: NewTransaction) {
    if (editing) {
      await update(editing.id, input);
    } else {
      await create(input);
    }
    closeForm();
  }

  async function handleConfirmDelete() {
    if (!pendingDelete) return;

    // Guarda os campos antes de apagar: o desfazer recria o lançamento.
    const { id: _id, createdAt: _c, updatedAt: _u, ...campos } = pendingDelete;
    const descricao = pendingDelete.description;

    await remove(pendingDelete.id);
    setPendingDelete(null);
    notify(`"${descricao}" excluído.`, async () => {
      await create(campos);
    });
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5">
      <header className="relative z-30 flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="font-display text-2xl font-bold text-on-surface">Transações</h1>
          <div className="flex gap-2">
            <Link to="/importar">
              <Button variant="secondary">Importar extrato</Button>
            </Link>
            <Button onClick={openCreate}>Novo lançamento</Button>
          </div>
        </div>
        <MonthSwitcher />
      </header>

      <TransactionFilters value={filters} onChange={setFilters} />

      <TransactionList
        transactions={filtered}
        showTotals
        groupByDate
        onEdit={openEdit}
        onDelete={setPendingDelete}
        emptyTitle="Nenhum lançamento neste período"
        emptyDescription="Ajuste os filtros, registre um lançamento ou importe o extrato do seu banco."
        emptyAction={
          <div className="flex flex-wrap justify-center gap-2">
            <Button onClick={openCreate}>Novo lançamento</Button>
            <Link to="/importar">
              <Button variant="secondary">Importar extrato</Button>
            </Link>
          </div>
        }
      />

      <Modal
        open={formOpen}
        onClose={closeForm}
        title={editing ? 'Editar lançamento' : 'Novo lançamento'}
      >
        <TransactionForm
          {...(editing ? { initial: editing } : {})}
          onSubmit={handleSubmit}
          onCancel={closeForm}
        />
      </Modal>

      <ConfirmDialog
        open={pendingDelete !== null}
        title="Excluir lançamento"
        message={`Tem certeza que deseja excluir "${pendingDelete?.description ?? ''}"? Esta ação não pode ser desfeita.`}
        onConfirm={handleConfirmDelete}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  );
}
