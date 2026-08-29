import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion, useReducedMotion } from 'framer-motion';
import { computeMonthOverview } from '@/domain/overview';
import { computeInsights, monthlySeries, spendingByWeekday } from '@/domain/insights';
import { monthOf, today } from '@/lib/date';
import { useKash, useMoney } from '@/state/hooks';
import { Button, Card, EmptyState, SectionHeader, cx } from '@/components/ui';
import { MonthSwitcher } from '@/components/layout/MonthSwitcher';
import { DonutChart } from '@/components/charts/DonutChart';
import { TrendChart } from '@/components/charts/TrendChart';
import { InsightList, WeekdayBars } from '@/components/overview/InsightList';
import { TransactionList } from '@/components/transactions/TransactionList';

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

function EyeIcon() {
  return (
    <svg {...ICON}>
      <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg {...ICON}>
      <path d="M3 3l18 18" />
      <path d="M10.6 10.6a3 3 0 004.2 4.2" />
      <path d="M9.4 5.2A9.5 9.5 0 0112 5c6.4 0 10 7 10 7a17 17 0 01-3.2 4.1M6.2 6.7A17 17 0 002 12s3.6 7 10 7a9.6 9.6 0 003.4-.6" />
    </svg>
  );
}

/** Entrada em cascata: as seções aparecem na ordem em que se lê a página. */
function Secao({ children, delay = 0 }: { children: React.ReactNode; delay?: number }) {
  const reduceMotion = useReducedMotion();

  return (
    <motion.section
      initial={reduceMotion ? false : { opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay, ease: [0.2, 0.8, 0.2, 1] }}
    >
      {children}
    </motion.section>
  );
}

export function OverviewPage() {
  const { transactions, categories, accounts, month, setMonth } = useKash();
  const money = useMoney();
  const hoje = today();
  // Hover compartilhado entre o donut e a legenda: destacar num lado acende o outro.
  const [categoriaAtiva, setCategoriaAtiva] = useState<string | null>(null);

  const overview = useMemo(
    () => computeMonthOverview(transactions, categories, accounts, month, hoje),
    [transactions, categories, accounts, month, hoje],
  );

  const insights = useMemo(
    () => computeInsights({ transactions, categories, month, today: hoje }),
    [transactions, categories, month, hoje],
  );

  const serie = useMemo(() => monthlySeries(transactions, month, 6), [transactions, month]);
  const semana = useMemo(() => spendingByWeekday(transactions, month), [transactions, month]);

  const balancePositive = overview.balanceCents >= 0;
  // No mês corrente nada 'fechou' ainda: o texto muda de tempo verbal.
  const mesEmCurso = month === monthOf(hoje);
  const temHistorico = serie.some((p) => p.incomeCents > 0 || p.expenseCents > 0);

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      <header className="relative z-30 flex flex-col gap-4">
        <div className="flex items-center justify-between gap-3">
          <h1 className="font-display text-2xl font-bold text-on-surface">Visão geral</h1>
          <button
            type="button"
            onClick={money.toggle}
            aria-pressed={money.hidden}
            className="inline-flex min-h-11 items-center gap-2 rounded-full border border-outline-variant px-3 text-sm font-medium text-on-surface-variant transition hover:bg-surface-container"
          >
            {money.hidden ? <EyeOffIcon /> : <EyeIcon />}
            <span className="hidden sm:inline">
              {money.hidden ? 'Mostrar valores' : 'Ocultar valores'}
            </span>
          </button>
        </div>
        <MonthSwitcher />
      </header>

      {/* Saldo acumulado — a resposta para "quanto eu tenho hoje" */}
      <Secao>
        <Card>
          <p className="font-label text-label-caps uppercase text-on-surface-variant">
            Saldo acumulado
          </p>
          <p
            className={cx(
              'tabular mt-1 font-display text-display-hero-mobile font-bold sm:text-display-hero',
              overview.accumulatedBalanceCents >= 0 ? 'text-on-surface' : 'text-expense',
            )}
          >
            {money.format(overview.accumulatedBalanceCents)}
          </p>
          <p className="mt-1 text-xs text-on-surface-variant">
            Considera todas as contas e os lançamentos até hoje.
          </p>
        </Card>
      </Secao>

      {/* Totais do mês */}
      <Secao delay={0.05}>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Card>
            <p className="font-label text-label-caps uppercase text-on-surface-variant">Entradas</p>
            <p className="tabular mt-1 font-display text-financial-data text-income">
              {money.format(overview.incomeCents)}
            </p>
          </Card>
          <Card>
            <p className="font-label text-label-caps uppercase text-on-surface-variant">Saídas</p>
            <p className="tabular mt-1 font-display text-financial-data text-expense">
              {money.format(overview.expenseCents)}
            </p>
          </Card>
          <Card>
            <p className="font-label text-label-caps uppercase text-on-surface-variant">
              Saldo do mês
            </p>
            <p
              className={cx(
                'tabular mt-1 font-display text-financial-data',
                balancePositive ? 'text-income' : 'text-expense',
              )}
            >
              {money.format(overview.balanceCents)}
            </p>
            <p className="mt-0.5 text-xs text-on-surface-variant">
              {mesEmCurso
                ? balancePositive
                  ? 'Sobrando até aqui'
                  : 'Gastando mais do que recebeu'
                : balancePositive
                  ? 'Você fechou no positivo'
                  : 'Você gastou mais do que recebeu'}
            </p>
          </Card>
        </div>
      </Secao>

      {overview.isEmpty ? (
        <EmptyState
          title="Nada lançado neste mês"
          description="Registre sua primeira receita ou despesa, ou importe o extrato do seu banco, para ver seu saldo, seus gastos por categoria e o histórico do período."
          action={
            <div className="flex flex-wrap justify-center gap-2">
              <Link to="/transacoes">
                <Button>Registrar lançamento</Button>
              </Link>
              <Link to="/importar">
                <Button variant="secondary">Importar extrato</Button>
              </Link>
            </div>
          }
        />
      ) : (
        <>
          {/* Leituras do mês */}
          {insights.length > 0 && (
            <Secao delay={0.1}>
              <SectionHeader>O que os números dizem</SectionHeader>
              <InsightList insights={insights} />
            </Secao>
          )}

          {/* Evolução — o gráfico também navega no tempo */}
          {temHistorico && (
            <Secao delay={0.15}>
              <SectionHeader>Últimos 6 meses</SectionHeader>
              <Card>
                <TrendChart points={serie} currentMonth={month} onSelectMonth={setMonth} />
                <p className="mt-3 text-center text-xs text-on-surface-variant">
                  Toque em um mês para abrir o período.
                </p>
              </Card>
            </Secao>
          )}

          {/* Distribuição por categoria */}
          <Secao delay={0.2}>
            <SectionHeader>Gastos por categoria</SectionHeader>
            <Card>
              {overview.breakdown.length === 0 ? (
                <p className="py-4 text-center text-sm text-on-surface-variant">
                  Nenhuma despesa registrada neste mês.
                </p>
              ) : (
                <div className="flex flex-col items-center gap-6 sm:flex-row sm:items-start">
                  <DonutChart
                    items={overview.breakdown}
                    totalLabel={money.format(overview.expenseCents)}
                    activeId={categoriaAtiva}
                    onHover={setCategoriaAtiva}
                  />

                  {/* A legenda textual é o que garante a leitura sem cor (SC-007) */}
                  <ul className="w-full flex-1 divide-y divide-outline-variant">
                    {overview.breakdown.map((item) => (
                      <li
                        key={item.categoryId}
                        onMouseEnter={() => setCategoriaAtiva(item.categoryId)}
                        onMouseLeave={() => setCategoriaAtiva(null)}
                        className={cx(
                          'flex cursor-default items-center justify-between gap-3 rounded px-2 py-2.5 transition',
                          categoriaAtiva === item.categoryId ? 'bg-surface-container' : '',
                          categoriaAtiva && categoriaAtiva !== item.categoryId ? 'opacity-50' : '',
                        )}
                      >
                        <span className="flex min-w-0 items-center gap-2">
                          <span
                            aria-hidden
                            className="h-2.5 w-2.5 shrink-0 rounded-full"
                            style={{ backgroundColor: item.color }}
                          />
                          <span className="truncate text-sm text-on-surface">
                            {item.categoryName}
                          </span>
                        </span>
                        <span className="flex shrink-0 items-baseline gap-2">
                          <span className="tabular text-sm font-semibold text-on-surface">
                            {money.format(item.totalCents)}
                          </span>
                          <span className="tabular w-12 text-right text-xs text-on-surface-variant">
                            {item.percent.toFixed(1)}%
                          </span>
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </Card>
          </Secao>

          {/* Ritmo semanal */}
          <Secao delay={0.25}>
            <SectionHeader>Quando você gasta</SectionHeader>
            <Card>
              <WeekdayBars days={semana} />
            </Card>
          </Secao>

          {/* Recentes */}
          <Secao delay={0.3}>
            <SectionHeader
              action={
                <Link
                  to="/transacoes"
                  className="text-sm font-semibold text-primary underline underline-offset-2"
                >
                  Ver todos
                </Link>
              }
            >
              Lançamentos recentes
            </SectionHeader>
            <Card>
              <TransactionList transactions={overview.recent} />
            </Card>
          </Secao>
        </>
      )}
    </div>
  );
}
