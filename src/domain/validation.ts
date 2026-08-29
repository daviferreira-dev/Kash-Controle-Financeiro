import { ValidationError } from '@/lib/errors';
import { isValidIsoDate } from '@/lib/date';
import { MAX_AMOUNT_CENTS } from '@/lib/money';
import type {
  Account,
  Category,
  NewAccount,
  NewBudget,
  NewCategory,
  NewRecurrence,
  NewTransaction,
} from './types';

/**
 * Validações do domínio. Retornam lista vazia quando válido; cada erro carrega
 * o `field` correspondente para a UI destacar o campo certo (FR-003).
 */

const MAX_DESCRIPTION = 120;
const MAX_NOTES = 500;
const MAX_NAME = 40;

function validateAmount(amountCents: number, errors: ValidationError[]): void {
  if (!Number.isInteger(amountCents)) {
    errors.push(new ValidationError('Valor inválido', 'amountCents'));
    return;
  }
  if (amountCents <= 0) {
    // O sinal vem do tipo, não do número — por isso zero e negativo são erro.
    errors.push(new ValidationError('Informe um valor maior que zero', 'amountCents'));
    return;
  }
  if (amountCents > MAX_AMOUNT_CENTS) {
    errors.push(new ValidationError('Valor acima do limite de R$ 99.999.999,99', 'amountCents'));
  }
}

function validateDescription(description: string, errors: ValidationError[]): void {
  const trimmed = description.trim();
  if (trimmed === '') {
    errors.push(new ValidationError('Informe uma descrição', 'description'));
  } else if (trimmed.length > MAX_DESCRIPTION) {
    errors.push(
      new ValidationError(`A descrição deve ter no máximo ${MAX_DESCRIPTION} caracteres`, 'description'),
    );
  }
}

function validateNotes(notes: string | null, errors: ValidationError[]): void {
  if (notes !== null && notes.length > MAX_NOTES) {
    errors.push(new ValidationError(`As observações devem ter no máximo ${MAX_NOTES} caracteres`, 'notes'));
  }
}

export function validateTransaction(input: NewTransaction): ValidationError[] {
  const errors: ValidationError[] = [];

  validateAmount(input.amountCents, errors);
  validateDescription(input.description, errors);
  validateNotes(input.notes, errors);

  if (!isValidIsoDate(input.date)) {
    errors.push(new ValidationError('Informe uma data válida', 'date'));
  }
  if (!input.categoryId) {
    errors.push(new ValidationError('Selecione uma categoria', 'categoryId'));
  }
  if (!input.accountId) {
    errors.push(new ValidationError('Selecione uma conta', 'accountId'));
  }

  // Invariante do data-model: origem e rastro da recorrência andam juntos.
  const hasRecurrenceTrail = input.sourceRecurrenceId !== null && input.occurrenceDate !== null;
  if (input.source === 'recurrence' && !hasRecurrenceTrail) {
    errors.push(new ValidationError('Lançamento de recorrência sem origem registrada', 'source'));
  }
  if (input.source === 'manual' && (input.sourceRecurrenceId !== null || input.occurrenceDate !== null)) {
    errors.push(new ValidationError('Lançamento manual não pode referenciar uma recorrência', 'source'));
  }

  return errors;
}

export function validateRecurrence(input: NewRecurrence): ValidationError[] {
  const errors: ValidationError[] = [];

  validateAmount(input.amountCents, errors);
  validateDescription(input.description, errors);
  validateNotes(input.notes, errors);

  if (!isValidIsoDate(input.startDate)) {
    errors.push(new ValidationError('Informe uma data de início válida', 'startDate'));
  }
  if (input.endDate !== null) {
    if (!isValidIsoDate(input.endDate)) {
      errors.push(new ValidationError('Informe uma data final válida', 'endDate'));
    } else if (input.endDate < input.startDate) {
      errors.push(new ValidationError('A data final deve ser posterior ao início', 'endDate'));
    }
  }
  if (!input.categoryId) {
    errors.push(new ValidationError('Selecione uma categoria', 'categoryId'));
  }
  if (!input.accountId) {
    errors.push(new ValidationError('Selecione uma conta', 'accountId'));
  }

  return errors;
}

export function validateBudget(input: NewBudget): ValidationError[] {
  const errors: ValidationError[] = [];

  if (!Number.isInteger(input.limitCents) || input.limitCents <= 0) {
    errors.push(new ValidationError('Informe um limite maior que zero', 'limitCents'));
  } else if (input.limitCents > MAX_AMOUNT_CENTS) {
    errors.push(new ValidationError('Limite acima de R$ 99.999.999,99', 'limitCents'));
  }
  if (!input.categoryId) {
    errors.push(new ValidationError('Selecione uma categoria', 'categoryId'));
  }
  if (!/^\d{4}-\d{2}$/.test(input.startMonth)) {
    errors.push(new ValidationError('Mês de vigência inválido', 'startMonth'));
  }

  return errors;
}

function validateUniqueName(
  name: string,
  existing: Array<{ id: string; name: string; archived: boolean }>,
  currentId: string | undefined,
  errors: ValidationError[],
): void {
  const trimmed = name.trim();
  if (trimmed === '') {
    errors.push(new ValidationError('Informe um nome', 'name'));
    return;
  }
  if (trimmed.length > MAX_NAME) {
    errors.push(new ValidationError(`O nome deve ter no máximo ${MAX_NAME} caracteres`, 'name'));
    return;
  }

  // A unicidade vale só entre os ativos: um nome arquivado pode ser reutilizado.
  const clash = existing.some(
    (item) =>
      !item.archived &&
      item.id !== currentId &&
      item.name.trim().toLowerCase() === trimmed.toLowerCase(),
  );
  if (clash) {
    errors.push(new ValidationError('Já existe um registro ativo com esse nome', 'name'));
  }
}

export function validateCategory(
  input: NewCategory,
  existing: Category[],
  currentId?: string,
): ValidationError[] {
  const errors: ValidationError[] = [];

  validateUniqueName(input.name, existing, currentId, errors);
  if (!/^#[0-9a-fA-F]{6}$/.test(input.color)) {
    errors.push(new ValidationError('Cor inválida', 'color'));
  }

  return errors;
}

export function validateAccount(
  input: NewAccount,
  existing: Account[],
  currentId?: string,
): ValidationError[] {
  const errors: ValidationError[] = [];

  validateUniqueName(input.name, existing, currentId, errors);
  if (!Number.isInteger(input.initialBalanceCents)) {
    errors.push(new ValidationError('Saldo inicial inválido', 'initialBalanceCents'));
  }

  return errors;
}
