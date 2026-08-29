import { useState, type FormEvent } from 'react';
import type {
  NewRecurrence,
  Recurrence,
  RecurrenceFrequency,
  TransactionType,
} from '@/domain/types';
import { validateRecurrence } from '@/domain/validation';
import { nextOccurrenceDate } from '@/domain/recurrence';
import { centsToInputValue, parseBRL } from '@/lib/money';
import { formatBR, today } from '@/lib/date';
import { ValidationError } from '@/lib/errors';
import { useAccounts, useCategories, useKash, useMoney, useRecurrences } from '@/state/hooks';
import { RecurrenceSuggestions } from '@/components/recurrences/RecurrenceSuggestions';
import {
  Button,
  Card,
  ConfirmDialog,
  CurrencyInput,
  EmptyState,
  Input,
  Modal,
  Select,
  Textarea,
  cx,
} from '@/components/ui';

const FREQUENCY_LABELS: Record<RecurrenceFrequency, string> = {
  weekly: 'Semanal',
  monthly: 'Mensal',
  yearly: 'Anual',
};

type Errors = Partial<Record<string, string>>;

function RecurrenceForm({
  initial,
  onSubmit,
  onCancel,
}: {
  initial?: Recurrence;
  onSubmit: (input: NewRecurrence) => Promise<void>;
  onCancel: () => void;
}) {
  const { active: categories } = useCategories();
  const { active: accounts } = useAccounts();

  const [type, setType] = useState<TransactionType>(initial?.type ?? 'expense');
  const [amount, setAmount] = useState(initial ? centsToInputValue(initial.amountCents) : '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [categoryId, setCategoryId] = useState(initial?.categoryId ?? '');
  const [accountId, setAccountId] = useState(initial?.accountId ?? accounts[0]?.id ?? '');
  const [frequency, setFrequency] = useState<RecurrenceFrequency>(initial?.frequency ?? 'monthly');
  const [startDate, setStartDate] = useState(initial?.startDate ?? today());
  const [endDate, setEndDate] = useState(initial?.endDate ?? '');
  const [notes, setNotes] = useState(initial?.notes ?? '');
  const [errors, setErrors] = useState<Errors>({});

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const nextErrors: Errors = {};

    let amountCents = 0;
    try {
      amountCents = parseBRL(amount);
    } catch (error) {
      nextErrors.amountCents = error instanceof ValidationError ? error.message : 'Valor inválido';
    }

    const input: NewRecurrence = {
      type,
      amountCents,
      description,
      categoryId,
      accountId,
      notes: notes.trim() === '' ? null : notes.trim(),
      frequency,
      startDate,
      endDate: endDate === '' ? null : endDate,
      status: initial?.status ?? 'active',
      // Editar não deve reprocessar o passado: o cursor é preservado.
      lastGeneratedDate: initial?.lastGeneratedDate ?? null,
    };

    for (const error of validateRecurrence(input)) {
      if (error.field && !nextErrors[error.field]) nextErrors[error.field] = error.message;
    }

    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      return;
    }

    setErrors({});
    await onSubmit(input);
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-5">
      <div
        role="radiogroup"
        aria-label="Tipo de recorrência"
        className="grid grid-cols-2 gap-2 rounded border border-outline-variant p-1"
      >
        {(['expense', 'income'] as const).map((option) => (
          <button
            key={option}
            type="button"
            role="radio"
            aria-checked={type === option}
            onClick={() => setType(option)}
            className={cx(
              'min-h-11 rounded px-3 py-2 text-sm font-semibold transition',
              type === option
                ? option === 'income'
                  ? 'bg-income text-white'
                  : 'bg-expense text-white'
                : 'text-on-surface-variant hover:bg-surface-container',
            )}
          >
            {option === 'expense' ? 'Despesa' : 'Receita'}
          </button>
        ))}
      </div>

      <CurrencyInput
        label="Valor"
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        error={errors.amountCents}
        autoFocus
      />

      <Input
        label="Descrição"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="Aluguel"
        error={errors.description}
        maxLength={120}
      />

      <Select
        label="Categoria"
        value={categoryId}
        onChange={(e) => setCategoryId(e.target.value)}
        error={errors.categoryId}
      >
        <option value="">Selecione…</option>
        {categories.map((category) => (
          <option key={category.id} value={category.id}>
            {category.name}
          </option>
        ))}
      </Select>

      <Select
        label="Conta"
        value={accountId}
        onChange={(e) => setAccountId(e.target.value)}
        error={errors.accountId}
      >
        <option value="">Selecione…</option>
        {accounts.map((account) => (
          <option key={account.id} value={account.id}>
            {account.name}
          </option>
        ))}
      </Select>

      <Select
        label="Frequência"
        value={frequency}
        onChange={(e) => setFrequency(e.target.value as RecurrenceFrequency)}
      >
        <option value="weekly">Semanal</option>
        <option value="monthly">Mensal</option>
        <option value="yearly">Anual</option>
      </Select>

      <Input
        type="date"
        label="Início"
        value={startDate}
        onChange={(e) => setStartDate(e.target.value)}
        error={errors.startDate}
        hint="Ocorrências vencidas desde esta data serão criadas automaticamente."
      />

      <Input
        type="date"
        label="Data final (opcional)"
        value={endDate}
        onChange={(e) => setEndDate(e.target.value)}
        error={errors.endDate}
      />

      <Textarea
        label="Observações (opcional)"
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        error={errors.notes}
        maxLength={500}
      />

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button type="button" variant="secondary" onClick={onCancel}>
          Cancelar
        </Button>
        <Button type="submit">Salvar recorrência</Button>
      </div>
    </form>
  );
}

export function RecurrencesPage() {
  const { categories, accounts } = useKash();
  const { recurrences, create, update, remove, setStatus } = useRecurrences();
  const money = useMoney();

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Recurrence | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Recurrence | null>(null);

  async function handleSubmit(input: NewRecurrence) {
    if (editing) {
      await update(editing.id, input);
    } else {
      await create(input);
    }
    setFormOpen(false);
    setEditing(null);
  }

  async function handleConfirmDelete() {
    if (!pendingDelete) return;
    await remove(pendingDelete.id);
    setPendingDelete(null);
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5">
      <header className="flex items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-on-surface">Recorrências</h1>
          <p className="mt-1 text-sm text-on-surface-variant">
            Contas fixas viram lançamentos automaticamente quando você abre o app.
          </p>
        </div>
        <Button
          onClick={() => {
            setEditing(null);
            setFormOpen(true);
          }}
        >
          Nova recorrência
        </Button>
      </header>

      <RecurrenceSuggestions />

      {recurrences.length === 0 ? (
        <EmptyState
          title="Nenhuma recorrência cadastrada"
          description="Cadastre aluguel, assinaturas ou salário uma única vez e deixe o Kash lançar por você todo período."
          action={
            <Button
              onClick={() => {
                setEditing(null);
                setFormOpen(true);
              }}
            >
              Nova recorrência
            </Button>
          }
        />
      ) : (
        <div className="flex flex-col gap-3">
          {recurrences.map((recurrence) => {
            const category = categories.find((c) => c.id === recurrence.categoryId);
            const account = accounts.find((a) => a.id === recurrence.accountId);
            const next = nextOccurrenceDate(recurrence, today());
            const paused = recurrence.status === 'paused';

            return (
              <Card key={recurrence.id}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="truncate font-semibold text-on-surface">
                        {recurrence.description}
                      </h3>
                      {paused && (
                        <span className="rounded bg-surface-container-high px-2 py-0.5 text-xs font-semibold text-on-surface-variant">
                          Pausada
                        </span>
                      )}
                    </div>
                    <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-on-surface-variant">
                      <span>{FREQUENCY_LABELS[recurrence.frequency]}</span>
                      <span aria-hidden>·</span>
                      <span>{category?.name ?? 'Sem categoria'}</span>
                      <span aria-hidden>·</span>
                      <span>{account?.name ?? 'Sem conta'}</span>
                    </p>
                    <p className="mt-1 text-xs text-on-surface-variant">
                      {paused
                        ? 'Nenhum lançamento novo será criado enquanto estiver pausada.'
                        : next
                          ? `Próximo lançamento em ${formatBR(next)}`
                          : 'Já passou da data final — nada mais será lançado.'}
                    </p>
                  </div>

                  <span
                    className={cx(
                      'tabular shrink-0 whitespace-nowrap font-display text-base font-semibold',
                      recurrence.type === 'income' ? 'text-income' : 'text-expense',
                    )}
                  >
                    {recurrence.type === 'income' ? '+' : '−'} {money.format(recurrence.amountCents)}
                  </span>
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  <Button
                    variant="secondary"
                    onClick={() => setStatus(recurrence.id, paused ? 'active' : 'paused')}
                  >
                    {paused ? 'Retomar' : 'Pausar'}
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={() => {
                      setEditing(recurrence);
                      setFormOpen(true);
                    }}
                  >
                    Editar
                  </Button>
                  <Button variant="ghost" onClick={() => setPendingDelete(recurrence)}>
                    Excluir
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <Modal
        open={formOpen}
        onClose={() => {
          setFormOpen(false);
          setEditing(null);
        }}
        title={editing ? 'Editar recorrência' : 'Nova recorrência'}
      >
        <RecurrenceForm
          {...(editing ? { initial: editing } : {})}
          onSubmit={handleSubmit}
          onCancel={() => {
            setFormOpen(false);
            setEditing(null);
          }}
        />
      </Modal>

      <ConfirmDialog
        open={pendingDelete !== null}
        title="Excluir recorrência"
        message={`A recorrência "${pendingDelete?.description ?? ''}" deixará de gerar lançamentos. Os lançamentos já criados permanecem no histórico.`}
        onConfirm={handleConfirmDelete}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  );
}
