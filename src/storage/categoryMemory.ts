import { merchantKey, type LearnedCategories } from '@/domain/csvImport';

/**
 * Memória de categorização do importador de extrato.
 *
 * Fica fora do repositório de dados (não entra no backup): é uma preferência
 * de máquina, como o tema. Quando a pessoa classifica um lançamento que o Kash
 * não reconheceu, guardamos "estabelecimento -> categoria" aqui e a próxima
 * importação já aplica sozinha.
 */

const STORAGE_KEY = 'kash:categoryMemory';

export function readCategoryMemory(): LearnedCategories {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as LearnedCategories;
    }
    return {};
  } catch {
    return {};
  }
}

/** Ensina uma categoria para um estabelecimento. Ignora descrições sem chave. */
export function rememberCategory(description: string, categoryId: string): void {
  const key = merchantKey(description);
  if (!key) return;
  try {
    const current = readCategoryMemory();
    current[key] = categoryId;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(current));
  } catch {
    // Sem armazenamento, o aprendizado vale só nesta sessão.
  }
}

/** Esquece tudo que foi ensinado (usado quando a pessoa recomeça do zero). */
export function clearCategoryMemory(): void {
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // nada a fazer
  }
}
