import { useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import type { MonthPoint } from '@/domain/insights';
import { formatMonthLabel } from '@/lib/date';
import { useMoney } from '@/state/hooks';
import { cx } from '@/components/ui';

interface TrendChartProps {
  points: MonthPoint[];
  /** Mês atualmente selecionado, destacado na série. */
  currentMonth: string;
  onSelectMonth?: (month: string) => void;
}

/**
 * Entradas e saídas mês a mês, em barras pareadas.
 *
 * SVG próprio pelo mesmo motivo do donut (R-006). As barras crescem de baixo
 * para cima na entrada: o movimento comunica a leitura do gráfico, não é
 * enfeite.
 */
export function TrendChart({ points, currentMonth, onSelectMonth }: TrendChartProps) {
  const money = useMoney();
  const reduceMotion = useReducedMotion();
  const [emFoco, setEmFoco] = useState<string | null>(null);

  const max = Math.max(...points.flatMap((p) => [p.incomeCents, p.expenseCents]), 1);

  // O que a leitura acima do gráfico mostra: o mês sob o cursor/foco, ou o
  // selecionado enquanto ninguém está apontando nada.
  const alvo =
    points.find((p) => p.month === (emFoco ?? currentMonth)) ?? points[points.length - 1];

  return (
    <div>
      {alvo && (
        <div className="mb-3 flex flex-wrap items-baseline justify-center gap-x-4 gap-y-1 text-sm">
          <span className="font-label text-xs font-bold uppercase text-on-surface">
            {formatMonthLabel(alvo.month)}
          </span>
          <span className="text-on-surface-variant">
            Entradas{' '}
            <strong className="font-semibold text-income">{money.format(alvo.incomeCents)}</strong>
          </span>
          <span className="text-on-surface-variant">
            Saídas{' '}
            <strong className="font-semibold text-expense">{money.format(alvo.expenseCents)}</strong>
          </span>
          <span className="text-on-surface-variant">
            Saldo{' '}
            <strong
              className={cx(
                'font-semibold',
                alvo.balanceCents >= 0 ? 'text-income' : 'text-expense',
              )}
            >
              {money.format(alvo.balanceCents)}
            </strong>
          </span>
        </div>
      )}

      <div className="flex items-end justify-between gap-2 sm:gap-4">
        {points.map((point) => {
          const selecionado = point.month === currentMonth;
          const vazio = point.incomeCents === 0 && point.expenseCents === 0;

          return (
            <button
              key={point.month}
              type="button"
              onClick={() => onSelectMonth?.(point.month)}
              onMouseEnter={() => setEmFoco(point.month)}
              onMouseLeave={() => setEmFoco(null)}
              onFocus={() => setEmFoco(point.month)}
              onBlur={() => setEmFoco(null)}
              aria-label={`${formatMonthLabel(point.month)}: entradas ${money.format(point.incomeCents)}, saídas ${money.format(point.expenseCents)}, saldo ${money.format(point.balanceCents)}`}
              aria-current={selecionado ? 'true' : undefined}
              className="group flex min-h-11 flex-1 flex-col items-center gap-2 rounded pt-2 transition hover:bg-surface-container"
            >
              <div className="flex h-32 w-full items-end justify-center gap-1">
                <Barra
                  valor={point.incomeCents}
                  max={max}
                  className="bg-income"
                  atenuada={!selecionado}
                  reduceMotion={Boolean(reduceMotion)}
                />
                <Barra
                  valor={point.expenseCents}
                  max={max}
                  className="bg-expense"
                  atenuada={!selecionado}
                  reduceMotion={Boolean(reduceMotion)}
                />
              </div>

              <span
                className={
                  selecionado
                    ? 'font-label text-xs font-bold uppercase text-on-surface'
                    : 'font-label text-xs uppercase text-on-surface-variant'
                }
              >
                {point.label}
              </span>

              {vazio && <span className="sr-only">sem lançamentos</span>}
            </button>
          );
        })}
      </div>

      {/* A cor sozinha não basta: a legenda nomeia as séries (FR-007). */}
      <div className="mt-3 flex items-center justify-center gap-4 text-xs text-on-surface-variant">
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden className="h-2.5 w-2.5 rounded-sm bg-income" />
          Entradas
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden className="h-2.5 w-2.5 rounded-sm bg-expense" />
          Saídas
        </span>
      </div>
    </div>
  );
}

function Barra({
  valor,
  max,
  className,
  atenuada,
  reduceMotion,
}: {
  valor: number;
  max: number;
  className: string;
  atenuada: boolean;
  reduceMotion: boolean;
}) {
  // Um traço mínimo mantém a coluna legível mesmo com valor zero.
  const altura = valor === 0 ? 2 : Math.max((valor / max) * 100, 4);

  return (
    <motion.span
      aria-hidden
      initial={reduceMotion ? false : { height: 0 }}
      animate={{ height: `${altura}%` }}
      transition={{ duration: 0.45, ease: [0.2, 0.8, 0.2, 1] }}
      className={`w-3 rounded-t-sm sm:w-4 ${className} ${atenuada ? 'opacity-45 group-hover:opacity-80' : ''}`}
      style={{ minHeight: 2 }}
    />
  );
}
