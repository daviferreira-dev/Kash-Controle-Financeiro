import { useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import type { CategoryBreakdownItem } from '@/domain/overview';
import { useMoney } from '@/state/hooks';

interface DonutChartProps {
  items: CategoryBreakdownItem[];
  /** Já formatado pelo chamador, para respeitar a ocultação de valores. */
  totalLabel: string;
  size?: number;
  /** Categoria destacada de fora — ex.: o mouse sobre a legenda ao lado. */
  activeId?: string | null;
  onHover?: (categoryId: string | null) => void;
}

const STROKE = 18;
const STROKE_ATIVO = 26;

/**
 * Donut em SVG próprio (decisão R-006).
 *
 * Interativo: passar o mouse sobre uma fatia engrossa o traço, apaga as
 * demais e traz categoria, valor e percentual para o centro — sem tirar os
 * olhos do gráfico. Foco por teclado faz o mesmo, então a informação não
 * fica refém do mouse.
 */
export function DonutChart({
  items,
  totalLabel,
  size = 180,
  activeId = null,
  onHover,
}: DonutChartProps) {
  const money = useMoney();
  const reduceMotion = useReducedMotion();
  const [interno, setInterno] = useState<string | null>(null);

  const ativo = activeId ?? interno;
  const item = items.find((i) => i.categoryId === ativo) ?? null;

  // O raio considera o traço grosso, para a fatia destacada não ser cortada.
  const radius = (size - STROKE_ATIVO) / 2;
  const circumference = 2 * Math.PI * radius;
  const center = size / 2;

  function destacar(id: string | null) {
    setInterno(id);
    onHover?.(id);
  }

  let offset = 0;

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        role="img"
        aria-label={`Distribuição das despesas do mês por categoria, totalizando ${totalLabel}`}
      >
        {/* Trilho de fundo, para o gráfico ter forma mesmo com uma só fatia */}
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke="var(--color-surface-container-high)"
          strokeWidth={STROKE}
        />

        {items.map((slice) => {
          const length = (slice.percent / 100) * circumference;
          const dash = `${length} ${circumference - length}`;
          const currentOffset = offset;
          offset += length;
          const destacado = ativo === slice.categoryId;

          return (
            <motion.circle
              key={slice.categoryId}
              cx={center}
              cy={center}
              r={radius}
              fill="none"
              stroke={slice.color}
              strokeDasharray={dash}
              strokeDashoffset={-currentOffset}
              strokeLinecap="butt"
              // Começa às 12h em vez de 3h.
              transform={`rotate(-90 ${center} ${center})`}
              tabIndex={0}
              role="button"
              aria-label={`${slice.categoryName}: ${money.format(slice.totalCents)}, ${slice.percent.toFixed(1)}%`}
              onMouseEnter={() => destacar(slice.categoryId)}
              onMouseLeave={() => destacar(null)}
              onFocus={() => destacar(slice.categoryId)}
              onBlur={() => destacar(null)}
              initial={false}
              animate={{
                strokeWidth: destacado ? STROKE_ATIVO : STROKE,
                opacity: ativo && !destacado ? 0.4 : 1,
              }}
              transition={reduceMotion ? { duration: 0 } : { duration: 0.18 }}
              className="cursor-pointer outline-none"
            />
          );
        })}
      </svg>

      {/* Centro: o total, ou a fatia sob o cursor */}
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center px-8 text-center">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={item?.categoryId ?? 'total'}
            initial={reduceMotion ? false : { opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -4 }}
            transition={{ duration: 0.14 }}
          >
            <p className="font-label text-xs uppercase tracking-wide text-on-surface-variant">
              {item ? item.categoryName : 'Despesas'}
            </p>
            <p className="tabular font-display text-[15px] font-semibold leading-tight text-on-surface">
              {item ? money.format(item.totalCents) : totalLabel}
            </p>
            {item && (
              <p className="tabular text-xs text-on-surface-variant">{item.percent.toFixed(1)}%</p>
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
