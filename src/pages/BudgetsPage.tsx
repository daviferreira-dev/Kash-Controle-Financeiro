import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { computeBudgetProgress, isBudgetActiveIn, type BudgetProgress } from '@/domain/budget';
import { parseBRL, centsToInputValue } from '@/lib/money';
import { ValidationError } from '@/lib/errors';
import { useBudgets, useKash, useMoney } from '@/state/hooks';
import {
  Button,
  Card,
  ConfirmDialog,
  CurrencyInput,
  EmptyState,
  Modal,
  Select,
  cx,
} from '@/components/ui';
import { MonthSwitcher } from '@/components/layout/MonthSwitcher';
import { BudgetSuggestions } from '@/components/budgets/BudgetSuggestions';

const STATUS_STYLES = {
  ok: { bar: 'bg-income', badge: 'bg-income-container text-on-surface' },
  warning: { bar: 'bg-warning', badge: 'bg-warning-container text-on-surface' },
  exceeded: { bar: 'bg-error', badge: 'bg-error-container text-on-error-container' },
} as const;

function BudgetCard({
  progress,
  onEdit,
  onDelete,
  highlight = false,
}: {
  progress: BudgetProgress;
  onEdit: () => void;
  onDelete: () => void;
  highlight?: boolean;
}) {
  const money = useMoney();
  const { budget, category, spentCents, remainingCents, percentUsed, status, statusLabel } =
    progress;
  const styles = STATUS_STYLES[status];
  const exceeded = status === 'exceeded';

  return (
    <div
      id={`orcamento-${budget.id}`}
      className={cx(
        'scroll-mt-6 rounded transition-shadow duration-300',
        highlight && 'ring-2 ring-primary ring-offset-2 ring-offset-surface',
      )}
    >
    <Card>
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <span
            aria-hidden
            className="h-3 w-3 shrink-0 rounded-full"
            style={{ backgroundColor: category?.color ?? 'var(--color-outline)' }}
          />
          <h3 className="truncate font-semibold text-on-surface">
            {category?.name ?? 'Categoria removida'}
          </h3>
        </div>
        {/* Rótulo textual, obrigatório além da cor (FR-016, SC-007) */}
        <span className={cx('shrink-0 rounded px-2 py-0.5 text-xs font-semibold', styles.badge)}>
          {statusLabel}
        </span>
      </div>

      <div className="mt-3">
        <div
          role="progressbar"
          aria-valuenow={Math.round(percentUsed)}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`Consumo do orçamento de ${category?.name ?? 'categoria'}`}
          className="h-2 w-full overflow-hidden rounded-full bg-surface-container-high"
        >
          <div
            className={cx('h-full rounded-full transition-all', styles.bar)}
            style={{ width: `${Math.min(percentUsed, 100)}%` }}
          />
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 text-sm">
        <span className="text-on-surface-variant">
          <span className="tabular font-semibold text-on-surface">{money.format(spentCents)}</span> de{' '}
          <span className="tabular">{money.format(budget.limitCents)}</span>
        </span>
        <span className="tabular font-semibold text-on-surface">{percentUsed.toFixed(0)}%</span>
      </div>

      <p className={cx('mt-1 text-sm', exceeded ? 'font-semibold text-error' : 'text-on-surface-variant')}>
        {exceeded
          ? `Excedeu em ${money.format(Math.abs(remainingCents))}`
          : `Restam ${money.format(remainingCents)}`}
      </p>

      <div className="mt-4 flex gap-2">
        <Button variant="secondary" onClick={onEdit}>
          Alterar limite
        </Button>
        <Button variant="ghost" onClick={onDelete}>
          Remover
        </Button>
      </div>
    </Card>
    </div>
  );
}

export function BudgetsPage() {
  const { transactions, categories, budgets, month } = useKash();
  const { upsert, remove } = useBudgets();

  const [formOpen, setFormOpen] = useState(false);
  const [editingCategoryId, setEditingCategoryId] = useState('');
  const [limit, setLimit] = useState('');
  const [error, setError] = useState<string | undefined>();
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);

  const expenseCategories = categories.filter(
    (c) => !c.archived && (c.kind === 'expense' || c.kind === 'both'),
  );

  const progresses = useMemo(
    () =>
      budgets
        .filter((budget) => isBudgetActiveIn(budget, month))
        .map((budget) =>
          computeBudgetProgress(
            budget,
            categories.find((c) => c.id === budget.categoryId),
            transactions,
            month,
          ),
        )
        .sort((a, b) => b.percentUsed - a.percentUsed),
    [budgets, categories, transactions, month],
  );

  const withoutBudget = expenseCategories.filter(
    (category) => !budgets.some((b) => b.categoryId === category.id),
  );

  // Vindo do sino de atenção da barra superior: ?foco=<id do orçamento>.
  // Rola até o card e o destaca por um instante, depois limpa a query.
  const [searchParams, setSearchParams] = useSearchParams();
  const [foco, setFoco] = useState<string | null>(null);

  useEffect(() => {
    const alvo = searchParams.get('foco');
    if (!alvo) return;
    setFoco(alvo);
    const limpa = new URLSearchParams(searchParams);
    limpa.delete('foco');
    setSearchParams(limpa, { replace: true });
    const t = setTimeout(() => setFoco(null), 2200);
    return () => clearTimeout(t);
  }, [searchParams, setSearchParams]);

  useEffect(() => {
    if (!foco) return;
    // rAF: deixa o reset de scroll do AppShell (ao trocar de rota) acontecer
    // primeiro, senão ele joga a página de volta pro topo.
    const raf = requestAnimationFrame(() => {
      document
        .getElementById(`orcamento-${foco}`)
        ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
    return () => cancelAnimationFrame(raf);
  }, [foco, progresses]);

  function openCreate() {
    setEditingCategoryId(withoutBudget[0]?.id ?? '');
    setLimit('');
    setError(undefined);
    setFormOpen(true);
  }

  function openEdit(progress: BudgetProgress) {
    setEditingCategoryId(progress.budget.categoryId);
    setLimit(centsToInputValue(progress.budget.limitCents));
    setError(undefined);
    setFormOpen(true);
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();

    if (!editingCategoryId) {
      setError('Selecione uma categoria');
      return;
    }

    let limitCents: number;
    try {
      limitCents = parseBRL(limit);
    } catch (err) {
      setError(err instanceof ValidationError ? err.message : 'Valor inválido');
      return;
    }

    if (limitCents <= 0) {
      setError('Informe um limite maior que zero');
      return;
    }

    // upsert garante um único orçamento por categoria (FR-017).
    await upsert(editingCategoryId, limitCents, month);
    setFormOpen(false);
  }

  async function handleConfirmDelete() {
    if (!pendingDelete) return;
    await remove(pendingDelete);
    setPendingDelete(null);
  }

  const editingExisting = budgets.some((b) => b.categoryId === editingCategoryId);
  const categoryOptions = editingExisting ? expenseCategories : withoutBudget;

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5">
      <header className="relative z-30 flex flex-col gap-4">
        <div className="flex items-center justify-between gap-3">
          <h1 className="font-display text-2xl font-bold text-on-surface">Orçamentos</h1>
          <Button onClick={openCreate} disabled={withoutBudget.length === 0}>
            Novo orçamento
          </Button>
        </div>
        <MonthSwitcher />
      </header>

      <BudgetSuggestions />

      {progresses.length === 0 ? (
        <EmptyState
          title="Nenhum orçamento definido"
          description="Defina um teto mensal para uma categoria e acompanhe quanto já consumiu ao longo do mês."
          action={
            <Button onClick={openCreate} disabled={withoutBudget.length === 0}>
              Definir orçamento
            </Button>
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {progresses.map((progress) => (
            <BudgetCard
              key={progress.budget.id}
              progress={progress}
              highlight={foco === progress.budget.id}
              onEdit={() => openEdit(progress)}
              onDelete={() => setPendingDelete(progress.budget.id)}
            />
          ))}
        </div>
      )}

      <Modal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title={editingExisting ? 'Alterar limite' : 'Novo orçamento'}
      >
        <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-5">
          <Select
            label="Categoria"
            value={editingCategoryId}
            onChange={(e) => setEditingCategoryId(e.target.value)}
            disabled={editingExisting}
          >
            <option value="">Selecione…</option>
            {categoryOptions.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </Select>

          <CurrencyInput
            label="Limite mensal"
            value={limit}
            onChange={(e) => setLimit(e.target.value)}
            error={error}
            autoFocus
          />

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="secondary" onClick={() => setFormOpen(false)}>
              Cancelar
            </Button>
            <Button type="submit">Salvar orçamento</Button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={pendingDelete !== null}
        title="Remover orçamento"
        message="O limite será removido. Seus lançamentos não são afetados."
        confirmLabel="Remover"
        onConfirm={handleConfirmDelete}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  );
}
