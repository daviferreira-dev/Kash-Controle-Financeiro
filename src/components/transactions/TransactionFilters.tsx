import { useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import type { TransactionType } from '@/domain/types';
import { useAccounts, useCategories } from '@/state/hooks';
import { cx } from '@/components/ui';

export interface FilterState {
  type: TransactionType | '';
  categoryId: string;
  accountId: string;
  search: string;
}

export const EMPTY_FILTERS: FilterState = {
  type: '',
  categoryId: '',
  accountId: '',
  search: '',
};

interface TransactionFiltersProps {
  value: FilterState;
  onChange: (next: FilterState) => void;
}

const ICON = {
  width: 18,
  height: 18,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.6,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
};

const TIPOS = [
  { value: '' as const, label: 'Tudo' },
  { value: 'income' as const, label: 'Entradas' },
  { value: 'expense' as const, label: 'Saídas' },
];

export function TransactionFilters({ value, onChange }: TransactionFiltersProps) {
  const { active: categories } = useCategories();
  const { active: accounts } = useAccounts();
  const reduceMotion = useReducedMotion();

  const [expandido, setExpandido] = useState(false);

  const ativos =
    (value.type !== '' ? 1 : 0) +
    (value.categoryId !== '' ? 1 : 0) +
    (value.accountId !== '' ? 1 : 0);

  function update(patch: Partial<FilterState>) {
    onChange({ ...value, ...patch });
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Busca */}
      <div className="relative">
        <span
          aria-hidden
          className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-on-surface-variant"
        >
          <svg {...ICON}>
            <circle cx="11" cy="11" r="7" />
            <path d="M20 20l-3.5-3.5" />
          </svg>
        </span>
        <input
          type="search"
          value={value.search}
          onChange={(e) => update({ search: e.target.value })}
          placeholder="Buscar por descrição…"
          aria-label="Buscar por descrição"
          className="min-h-11 w-full rounded-full border border-outline-variant bg-surface-container-lowest pl-11 pr-4 text-sm text-on-surface placeholder:text-placeholder transition focus:border-primary"
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {/*
          Controle segmentado: o indicador desliza entre as opções com layoutId,
          o que torna a mudança de estado legível em vez de um pisca-pisca.
        */}
        <div
          role="radiogroup"
          aria-label="Filtrar por tipo"
          className="inline-flex rounded-full border border-outline-variant bg-surface-container-lowest p-1"
        >
          {TIPOS.map((tipo) => {
            const selecionado = value.type === tipo.value;
            return (
              <button
                key={tipo.label}
                type="button"
                role="radio"
                aria-checked={selecionado}
                onClick={() => update({ type: tipo.value })}
                className={cx(
                  'relative min-h-11 rounded-full px-4 text-sm font-semibold transition-colors',
                  selecionado ? 'text-on-primary' : 'text-on-surface-variant hover:text-on-surface',
                )}
              >
                {selecionado && (
                  <motion.span
                    layoutId="filtro-tipo"
                    className={cx(
                      'absolute inset-0 rounded-full',
                      tipo.value === 'income'
                        ? 'bg-income'
                        : tipo.value === 'expense'
                          ? 'bg-expense'
                          : 'bg-primary',
                    )}
                    transition={
                      reduceMotion
                        ? { duration: 0 }
                        : { type: 'spring', stiffness: 420, damping: 34 }
                    }
                  />
                )}
                <span className="relative">{tipo.label}</span>
              </button>
            );
          })}
        </div>

        <button
          type="button"
          onClick={() => setExpandido((v) => !v)}
          aria-expanded={expandido}
          className={cx(
            'inline-flex min-h-11 items-center gap-2 rounded-full border px-4 text-sm font-semibold transition',
            ativos > 0
              ? 'border-primary text-primary'
              : 'border-outline-variant text-on-surface-variant hover:bg-surface-container',
          )}
        >
          <svg {...ICON}>
            <path d="M4 6h16M7 12h10M10 18h4" />
          </svg>
          Filtros
          {ativos > 0 && (
            <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-xs font-bold text-on-primary">
              {ativos}
            </span>
          )}
        </button>

        {(ativos > 0 || value.search !== '') && (
          <button
            type="button"
            onClick={() => onChange(EMPTY_FILTERS)}
            className="min-h-11 rounded-full px-3 text-sm font-medium text-on-surface-variant underline underline-offset-2 transition hover:text-on-surface"
          >
            Limpar
          </button>
        )}
      </div>

      <AnimatePresence initial={false}>
        {expandido && (
          <motion.div
            initial={reduceMotion ? { opacity: 0 } : { opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={reduceMotion ? { opacity: 0 } : { opacity: 0, height: 0 }}
            transition={{ duration: 0.22, ease: [0.2, 0.8, 0.2, 1] }}
            className="overflow-hidden"
          >
            <div className="flex flex-col gap-4 rounded-lg border border-outline-variant bg-surface-container-lowest p-4">
              <fieldset>
                <legend className="font-label text-label-caps uppercase text-on-surface-variant">
                  Categoria
                </legend>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <ChipFiltro
                    ativo={value.categoryId === ''}
                    onClick={() => update({ categoryId: '' })}
                  >
                    Todas
                  </ChipFiltro>
                  {categories.map((categoria) => (
                    <ChipFiltro
                      key={categoria.id}
                      cor={categoria.color}
                      ativo={value.categoryId === categoria.id}
                      onClick={() =>
                        update({
                          categoryId: value.categoryId === categoria.id ? '' : categoria.id,
                        })
                      }
                    >
                      {categoria.name}
                    </ChipFiltro>
                  ))}
                </div>
              </fieldset>

              <fieldset>
                <legend className="font-label text-label-caps uppercase text-on-surface-variant">
                  Conta
                </legend>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <ChipFiltro
                    ativo={value.accountId === ''}
                    onClick={() => update({ accountId: '' })}
                  >
                    Todas
                  </ChipFiltro>
                  {accounts.map((conta) => (
                    <ChipFiltro
                      key={conta.id}
                      ativo={value.accountId === conta.id}
                      onClick={() =>
                        update({ accountId: value.accountId === conta.id ? '' : conta.id })
                      }
                    >
                      {conta.name}
                    </ChipFiltro>
                  ))}
                </div>
              </fieldset>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function ChipFiltro({
  ativo,
  cor,
  onClick,
  children,
}: {
  ativo: boolean;
  cor?: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  const reduceMotion = useReducedMotion();

  return (
    <motion.button
      type="button"
      onClick={onClick}
      aria-pressed={ativo}
      whileTap={reduceMotion ? undefined : { scale: 0.96 }}
      transition={{ duration: 0.12 }}
      className={cx(
        'inline-flex min-h-11 items-center gap-1.5 rounded-full border px-3.5 text-sm transition',
        ativo
          ? 'border-primary bg-primary font-semibold text-on-primary'
          : 'border-outline-variant text-on-surface hover:bg-surface-container',
      )}
    >
      {cor && (
        <span
          aria-hidden
          className="h-2 w-2 shrink-0 rounded-full"
          style={{ backgroundColor: ativo ? 'currentColor' : cor }}
        />
      )}
      {children}
    </motion.button>
  );
}
