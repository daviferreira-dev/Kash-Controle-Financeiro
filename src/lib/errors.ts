/** Registro não encontrado para o id informado. */
export class NotFoundError extends Error {
  constructor(entity: string, id: string) {
    super(`${entity} não encontrado: ${id}`);
    this.name = 'NotFoundError';
  }
}

/**
 * Entrada inválida. `field` permite à UI destacar exatamente o campo do
 * formulário que falhou (FR-003).
 */
export class ValidationError extends Error {
  readonly field: string | undefined;

  constructor(message: string, field?: string) {
    super(message);
    this.name = 'ValidationError';
    this.field = field;
  }
}

/** Operação violaria a integridade referencial (ex.: remover categoria em uso). */
export class IntegrityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'IntegrityError';
  }
}

/**
 * Armazenamento local indisponível: desabilitado, cheio ou modo privativo.
 * A UI traduz isso no aviso persistente do FR-029.
 */
export class StorageUnavailableError extends Error {
  readonly cause: unknown;

  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = 'StorageUnavailableError';
    this.cause = cause;
  }
}
