import { newId, nowTimestamp } from '@/lib/id';
import { NotFoundError, StorageUnavailableError } from '@/lib/errors';
import type { Repository } from './repository';

/**
 * Chaves usadas no localStorage. Prefixadas para não colidir com nada mais
 * servido da mesma origem.
 */
export const STORAGE_KEYS = {
  transactions: 'kash:transactions',
  categories: 'kash:categories',
  accounts: 'kash:accounts',
  budgets: 'kash:budgets',
  recurrences: 'kash:recurrences',
  schemaVersion: 'kash:schemaVersion',
} as const;

/**
 * Detecta se o armazenamento é utilizável de fato. Ter o objeto `localStorage`
 * não basta: em modo privativo ou com site data bloqueado, a escrita lança.
 */
export function isStorageAvailable(): boolean {
  try {
    const probe = '__kash_probe__';
    window.localStorage.setItem(probe, '1');
    window.localStorage.removeItem(probe);
    return true;
  } catch {
    return false;
  }
}

function readRaw<T>(key: string): T[] {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    // Conteúdo corrompido não deve derrubar o app; tratamos como base vazia.
    return [];
  }
}

function writeRaw<T>(key: string, items: T[]): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(items));
  } catch (error) {
    throw new StorageUnavailableError(
      'Não foi possível salvar os dados neste navegador. Verifique se o armazenamento local está habilitado e se há espaço disponível.',
      error,
    );
  }
}

interface Timestamped {
  id: string;
  createdAt?: string;
  updatedAt?: string;
}

/**
 * Implementação de `Repository<T>` sobre localStorage.
 *
 * Lê a coleção inteira a cada operação. É adequado ao alvo do SC-005 (1.000
 * transações ≈ centenas de KB) e mantém a implementação trivialmente correta;
 * a otimização, se necessária, é cache em memória no provider.
 */
export class LocalStorageRepository<T extends Timestamped> implements Repository<T> {
  constructor(
    protected readonly key: string,
    protected readonly entityName: string,
    /** Entidades sem auditoria (Category, Account) não recebem createdAt/updatedAt. */
    protected readonly timestamped = true,
  ) {}

  protected readAll(): T[] {
    return readRaw<T>(this.key);
  }

  protected writeAll(items: T[]): void {
    writeRaw(this.key, items);
  }

  async list(): Promise<T[]> {
    return this.readAll();
  }

  async getById(id: string): Promise<T | null> {
    return this.readAll().find((item) => item.id === id) ?? null;
  }

  async create(input: unknown): Promise<T> {
    const items = this.readAll();
    const now = nowTimestamp();

    // Campos gerenciados são sempre gerados aqui, mesmo que venham no input.
    const { id: _ignoredId, createdAt: _ignoredCreated, updatedAt: _ignoredUpdated, ...rest } =
      (input ?? {}) as Timestamped & Record<string, unknown>;

    const created = {
      ...rest,
      id: newId(),
      ...(this.timestamped ? { createdAt: now, updatedAt: now } : {}),
    } as T;

    items.push(created);
    this.writeAll(items);
    return created;
  }

  async update(id: string, patch: Partial<T>): Promise<T> {
    const items = this.readAll();
    const index = items.findIndex((item) => item.id === id);
    if (index === -1) {
      throw new NotFoundError(this.entityName, id);
    }

    const { id: _ignoredId, createdAt: _ignoredCreated, ...safePatch } = patch as Timestamped &
      Record<string, unknown>;

    const updated = {
      ...items[index]!,
      ...safePatch,
      id,
      ...(this.timestamped ? { updatedAt: nowTimestamp() } : {}),
    } as T;

    items[index] = updated;
    this.writeAll(items);
    return updated;
  }

  /** Idempotente: remover um id inexistente não lança. */
  async remove(id: string): Promise<void> {
    const items = this.readAll();
    const remaining = items.filter((item) => item.id !== id);
    if (remaining.length !== items.length) {
      this.writeAll(remaining);
    }
  }

  /** Substitui a coleção inteira. Usado por seed e import. */
  replaceAll(items: T[]): void {
    this.writeAll(items);
  }
}
