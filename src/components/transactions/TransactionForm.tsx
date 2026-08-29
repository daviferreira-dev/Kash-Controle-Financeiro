import { useMemo, useState, type FormEvent } from 'react';
import type { NewTransaction, Transaction, TransactionType } from '@/domain/types';
import { validateTransaction } from '@/domain/validation';
import { parseBRL, centsToInputValue } from '@/lib/money';
import { today, formatBR, isValidIsoDate, addDaysToDate } from '@/lib/date';
import { ValidationError } from '@/lib/errors';
import { useAccounts, useCategories } from '@/state/hooks';
import { Button, Chip, CurrencyInput, Field, Input, Select, Textarea, cx } from '@/components/ui';

interface TransactionFormProps {
  /** Quando presente, o formulário edita em vez de criar. */
  initial?: Transaction;
  onSubmit: (input: NewTransaction) => Promise<void>;
  onCancel: () => void;
}

type Errors = Partial<Record<string, string>>;

export function TransactionForm({ initial, onSubmit, onCancel }: TransactionFormProps) {
  const { active: categories } = useCategories();
  const { active: accounts } = useAccounts();

  const [type, setType] = useState<TransactionType>(initial?.type ?? 'expense');
  const [amount, setAmount] = useState(initial ? centsToInputValue(initial.amountCents) : '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [categoryId, setCategoryId] = useState(initial?.categoryId ?? '');
  const [accountId, setAccountId] = useState(initial?.accountId ?? accounts[0]?.id ?? '');
  const [date, setDate] = useState(initial?.date ?? today());
  const [notes, setNotes] = useState(initial?.notes ?? '');
  const [errors, setErrors] = useState<Errors>({});
  const [submitting, setSubmitting] = useState(false);

  // Categorias 'income'/'expense' filtram pelo tipo; 'both' aparece sempre.
  const availableCategories = useMemo(
    () => categories.filter((c) => c.kind === 'both' || c.kind === type),
    [categories, type],
  );

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const nextErrors: Errors = {};

    let amountCents = 0;
    try {
      amountCents = parseBRL(amount);
    } catch (error) {
      nextErrors.amountCents =
        error instanceof ValidationError ? error.message : 'Valor inválido';
    }

    const input: NewTransaction = {
      type,
      amountCents,
      description,
      date,
      categoryId,
      accountId,
      notes: notes.trim() === '' ? null : notes.trim(),
      source: initial?.source ?? 'manual',
      sourceRecurrenceId: initial?.sourceRecurrenceId ?? null,
      occurrenceDate: initial?.occurrenceDate ?? null,
    };

    for (const error of validateTransaction(input)) {
      // O erro de parse já registrado tem precedência sobre o do validador.
      if (error.field && !nextErrors[error.field]) {
        nextErrors[error.field] = error.message;
      }
    }

    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      return;
    }

    setErrors({});
    setSubmitting(true);
    try {
      await onSubmit(input);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-5">
      {/* Tipo: define o sinal do lançamento */}
      <fieldset>
        <legend className="sr-only">Tipo de lançamento</legend>
        <div
          role="radiogroup"
          aria-label="Tipo de lançamento"
          className="grid grid-cols-2 gap-2 rounded border border-outline-variant p-1"
        >
          {(['expense', 'income'] as const).map((option) => (
            <button
              key={option}
              type="button"
              role="radio"
              aria-checked={type === option}
              onClick={() => {
                setType(option);
                setCategoryId('');
              }}
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
      </fieldset>

      <CurrencyInput
        hero
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
        placeholder="Almoço no restaurante"
        error={errors.description}
        maxLength={120}
      />

      <Field label="Categoria" htmlFor="categoria-chips" error={errors.categoryId}>
        <div id="categoria-chips" className="flex flex-wrap gap-2">
          {availableCategories.map((category) => (
            <Chip
              key={category.id}
              color={category.color}
              selected={categoryId === category.id}
              onClick={() => setCategoryId(category.id)}
            >
              {category.name}
            </Chip>
          ))}
        </div>
      </Field>

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

      <div className="flex flex-col gap-2">
        <Input
          type="date"
          label="Data"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          error={errors.date}
          hint={isValidIsoDate(date) ? formatBR(date) : undefined}
        />
        <div className="flex gap-2">
          <Button type="button" variant="ghost" onClick={() => setDate(today())}>
            Hoje
          </Button>
          <Button
            type="button"
            variant="ghost"
            onClick={() => setDate(addDaysToDate(today(), -1))}
          >
            Ontem
          </Button>
        </div>
      </div>

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
        <Button type="submit" disabled={submitting}>
          {submitting ? 'Salvando…' : 'Salvar transação'}
        </Button>
      </div>
    </form>
  );
}
