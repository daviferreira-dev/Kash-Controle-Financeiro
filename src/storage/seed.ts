import type { NewAccount, NewCategory } from '@/domain/types';

/**
 * Categorias e contas iniciais (FR-026).
 *
 * As cores saem da paleta "Premium Editorial Finance" e são distintas o
 * suficiente para o donut do Overview permanecer legível — mas a legenda
 * textual ao lado é o que garante a leitura sem depender de cor (SC-007).
 */
export const DEFAULT_CATEGORIES: NewCategory[] = [
  { name: 'Alimentação', icon: 'utensils', color: '#a03f2d', kind: 'expense', archived: false, isDefault: true },
  { name: 'Transporte', icon: 'car', color: '#705c1e', kind: 'expense', archived: false, isDefault: true },
  { name: 'Moradia', icon: 'home', color: '#56423e', kind: 'expense', archived: false, isDefault: true },
  { name: 'Contas de casa', icon: 'plug', color: '#4f6d73', kind: 'expense', archived: false, isDefault: true },
  { name: 'Lazer', icon: 'sparkles', color: '#c3a963', kind: 'expense', archived: false, isDefault: true },
  { name: 'Saúde', icon: 'heart', color: '#8a726d', kind: 'expense', archived: false, isDefault: true },
  { name: 'Educação', icon: 'book', color: '#2f6b4f', kind: 'expense', archived: false, isDefault: true },
  { name: 'Assinaturas', icon: 'repeat', color: '#e8755f', kind: 'expense', archived: false, isDefault: true },
  { name: 'Outros', icon: 'tag', color: '#5f5e5e', kind: 'both', archived: false, isDefault: true },
];

export const DEFAULT_ACCOUNTS: NewAccount[] = [
  { name: 'Nubank', initialBalanceCents: 0, archived: false, isDefault: true },
  { name: 'Itaú', initialBalanceCents: 0, archived: false, isDefault: true },
  { name: 'Carteira', initialBalanceCents: 0, archived: false, isDefault: true },
];
