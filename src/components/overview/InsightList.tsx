import { motion, useReducedMotion } from 'framer-motion';
import type { Insight, InsightTone, WeekdayPoint } from '@/domain/insights';
import { useMoney } from '@/state/hooks';
import { Card, cx } from '@/components/ui';

const TOM: Record<InsightTone, { faixa: string; icone: string }> = {
  positive: { faixa: 'bg-income', icone: 'text-income' },
  neutral: { faixa: 'bg-outline-variant', icone: 'text-on-surface-variant' },
  attention: { faixa: 'bg-warning', icone: 'text-warning' },
};

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

function Icone({ tone }: { tone: InsightTone }) {
  if (tone === 'positive') {
    return (
      <svg {...ICON}>
        <path d="M20 6L9 17l-5-5" />
      </svg>
    );
  }
  if (tone === 'attention') {
    return (
      <svg {...ICON}>
        <path d="M12 9v5M12 17.5v.01" />
        <path d="M10.3 3.9L2.4 17a2 2 0 001.7 3h15.8a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z" />
      </svg>
    );
  }
  return (
    <svg {...ICON}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5M12 8v.01" />
    </svg>
  );
}

export function InsightList({ insights }: { insights: Insight[] }) {
  const reduceMotion = useReducedMotion();

  if (insights.length === 0) return null;

  return (
    <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {insights.map((insight, index) => (
        <motion.li
          key={insight.id}
          initial={reduceMotion ? false : { opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25, delay: index * 0.04, ease: [0.2, 0.8, 0.2, 1] }}
        >
          <Card className="relative h-full overflow-hidden pl-5">
            {/* Faixa lateral: reforça o tom sem depender só da cor do texto */}
            <span aria-hidden className={cx('absolute inset-y-0 left-0 w-1', TOM[insight.tone].faixa)} />

            <div className="flex items-start gap-2.5">
              <span className={cx('mt-0.5 shrink-0', TOM[insight.tone].icone)}>
                <Icone tone={insight.tone} />
              </span>
              <div className="min-w-0">
                <h3 className="text-sm font-semibold leading-snug text-on-surface">
                  {insight.title}
                </h3>
                <p className="mt-1 text-sm leading-relaxed text-on-surface-variant">
                  {insight.description}
                </p>
              </div>
            </div>
          </Card>
        </motion.li>
      ))}
    </ul>
  );
}

/** Gastos por dia da semana — revela onde o dinheiro escorre sem a pessoa notar. */
export function WeekdayBars({ days }: { days: WeekdayPoint[] }) {
  const money = useMoney();
  const reduceMotion = useReducedMotion();

  const max = Math.max(...days.map((d) => d.totalCents), 1);
  const total = days.reduce((sum, d) => sum + d.totalCents, 0);
  if (total === 0) return null;

  const pico = days.reduce((max, d) => (d.totalCents > max.totalCents ? d : max));

  return (
    <div>
      <div className="flex items-end justify-between gap-1.5">
        {days.map((day) => {
          const destaque = day.weekday === pico.weekday;
          return (
            <div key={day.weekday} className="flex flex-1 flex-col items-center gap-2">
              <div className="flex h-24 w-full items-end justify-center">
                <motion.span
                  aria-hidden
                  initial={reduceMotion ? false : { height: 0 }}
                  animate={{ height: `${day.totalCents === 0 ? 2 : Math.max((day.totalCents / max) * 100, 4)}%` }}
                  transition={{ duration: 0.4, ease: [0.2, 0.8, 0.2, 1] }}
                  className={cx(
                    'w-full max-w-8 rounded-t-sm',
                    destaque ? 'bg-primary' : 'bg-surface-container-highest',
                  )}
                  style={{ minHeight: 2 }}
                />
              </div>
              <span
                className={cx(
                  'font-label text-xs uppercase',
                  destaque ? 'font-bold text-on-surface' : 'text-on-surface-variant',
                )}
              >
                {day.label}
              </span>
              <span className="sr-only">{money.format(day.totalCents)}</span>
            </div>
          );
        })}
      </div>

      <p className="mt-3 text-sm text-on-surface-variant">
        Você gasta mais <strong className="text-on-surface">{diaPorExtenso(pico.weekday)}</strong> —{' '}
        {money.format(pico.totalCents)} no mês, em {pico.count}{' '}
        {pico.count === 1 ? 'lançamento' : 'lançamentos'}.
      </p>
    </div>
  );
}

function diaPorExtenso(weekday: number): string {
  return [
    'aos domingos',
    'às segundas',
    'às terças',
    'às quartas',
    'às quintas',
    'às sextas',
    'aos sábados',
  ][weekday]!;
}
