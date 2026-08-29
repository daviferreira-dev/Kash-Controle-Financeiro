import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import type { IsoMonth } from '@/domain/types';
import { addMonths, currentMonth, formatMonthLabel, monthOf } from '@/lib/date';
import { useKash } from '@/state/hooks';
import { cx } from '@/components/ui';

const MESES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

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

/**
 * Navegação no tempo.
 *
 * As setas resolvem "mês anterior"; não resolvem "agosto do ano passado" —
 * isso viraria doze cliques. O seletor abre uma grade de meses com o ano
 * navegável, e marca quais meses têm lançamentos, para a pessoa não caçar
 * períodos vazios.
 */
export function MonthSwitcher() {
  const { month, setMonth, transactions } = useKash();
  const [open, setOpen] = useState(false);
  const [visibleYear, setVisibleYear] = useState(() => Number(month.slice(0, 4)));
  const containerRef = useRef<HTMLDivElement>(null);
  const reduceMotion = useReducedMotion();

  const hoje = currentMonth();
  const isCurrent = month === hoje;

  // Meses que têm algum lançamento — o que dá o que navegar.
  const mesesComDados = useMemo(() => {
    const set = new Set<IsoMonth>();
    for (const t of transactions) set.add(monthOf(t.date));
    return set;
  }, [transactions]);

  const anosComDados = useMemo(() => {
    const anos = new Set<number>();
    for (const m of mesesComDados) anos.add(Number(m.slice(0, 4)));
    return anos;
  }, [mesesComDados]);

  // Janela de três anos ao redor do ano em foco. As setas movem a janela, e
  // o ano do meio é sempre o que a grade de meses abaixo está mostrando.
  const anosVisiveis = [visibleYear - 1, visibleYear, visibleYear + 1];

  useEffect(() => {
    if (open) setVisibleYear(Number(month.slice(0, 4)));
  }, [open, month]);

  // Fecha ao clicar fora ou apertar Esc.
  useEffect(() => {
    if (!open) return;

    function onPointerDown(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false);
    }

    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  function escolher(mes: IsoMonth) {
    setMonth(mes);
    setOpen(false);
  }

  const atalhos: Array<{ label: string; mes: IsoMonth }> = [
    { label: 'Este mês', mes: hoje },
    { label: 'Mês passado', mes: addMonths(hoje, -1) },
    { label: '6 meses atrás', mes: addMonths(hoje, -6) },
    { label: 'Há 1 ano', mes: addMonths(hoje, -12) },
  ];

  return (
    // z-30 no container: as seções animadas do Overview criam contexto de
    // empilhamento próprio, e sem isto o painel ficaria atrás delas.
    <div ref={containerRef} className="relative z-30 flex items-center justify-between gap-2">
      <button
        type="button"
        onClick={() => setMonth(addMonths(month, -1))}
        aria-label="Mês anterior"
        className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded border border-outline-variant text-on-surface-variant transition hover:bg-surface-container"
      >
        <svg {...ICON}>
          <path d="M15 5l-7 7 7 7" />
        </svg>
      </button>

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="dialog"
        className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded px-3 transition hover:bg-surface-container"
      >
        <span className="flex flex-col items-center leading-tight">
          <span
            aria-live="polite"
            className="font-label text-section-header uppercase text-on-surface"
          >
            {formatMonthLabel(month)}
          </span>
          {!isCurrent && (
            <span className="text-xs font-medium text-primary">não é o mês atual</span>
          )}
        </span>
        <motion.span animate={{ rotate: open ? 180 : 0 }} transition={{ duration: 0.2 }}>
          <svg {...ICON} width={16} height={16}>
            <path d="M6 9l6 6 6-6" />
          </svg>
        </motion.span>
      </button>

      <button
        type="button"
        onClick={() => setMonth(addMonths(month, 1))}
        aria-label="Próximo mês"
        className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded border border-outline-variant text-on-surface-variant transition hover:bg-surface-container"
      >
        <svg {...ICON}>
          <path d="M9 5l7 7-7 7" />
        </svg>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            role="dialog"
            aria-label="Escolher período"
            initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -8, scale: 0.98 }}
            transition={{ duration: 0.18, ease: [0.2, 0.8, 0.2, 1] }}
            className="absolute left-1/2 top-full z-50 mt-2 w-[min(22rem,calc(100vw-2.5rem))] -translate-x-1/2 rounded-lg border border-outline-variant bg-surface-container-lowest p-4 shadow-ambient"
          >
            {/* Atalhos: o caminho curto para os períodos mais pedidos */}
            <div className="flex flex-wrap gap-1.5">
              {atalhos.map((atalho) => (
                <button
                  key={atalho.label}
                  type="button"
                  onClick={() => escolher(atalho.mes)}
                  className={cx(
                    'min-h-11 rounded-full border px-3 text-xs font-semibold transition',
                    month === atalho.mes
                      ? 'border-primary bg-primary text-on-primary'
                      : 'border-outline-variant text-on-surface-variant hover:bg-surface-container',
                  )}
                >
                  {atalho.label}
                </button>
              ))}
            </div>

            {/* Ano */}
            <div className="mt-4 flex items-center justify-between">
              <button
                type="button"
                onClick={() => setVisibleYear((y) => y - 1)}
                aria-label="Ano anterior"
                className="inline-flex h-11 w-11 items-center justify-center rounded text-on-surface-variant transition hover:bg-surface-container"
              >
                <svg {...ICON}>
                  <path d="M15 5l-7 7 7 7" />
                </svg>
              </button>

              <div className="flex items-center gap-1.5">
                {anosVisiveis.map((ano) => (
                  <button
                    key={ano}
                    type="button"
                    onClick={() => setVisibleYear(ano)}
                    aria-current={ano === visibleYear ? 'true' : undefined}
                    className={cx(
                      'relative min-h-11 rounded px-3 font-display font-bold transition',
                      ano === visibleYear
                        ? 'text-xl text-on-surface'
                        : 'text-base text-on-surface-variant hover:text-on-surface',
                    )}
                  >
                    {ano}
                    {anosComDados.has(ano) && ano !== visibleYear && (
                      <span
                        aria-hidden
                        className="absolute bottom-1 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full bg-primary"
                      />
                    )}
                  </button>
                ))}
              </div>

              <button
                type="button"
                onClick={() => setVisibleYear((y) => y + 1)}
                aria-label="Próximo ano"
                className="inline-flex h-11 w-11 items-center justify-center rounded text-on-surface-variant transition hover:bg-surface-container"
              >
                <svg {...ICON}>
                  <path d="M9 5l7 7-7 7" />
                </svg>
              </button>
            </div>

            {/* Grade de meses */}
            <div className="mt-2 grid grid-cols-4 gap-1.5">
              {MESES.map((nome, index) => {
                const mes = `${visibleYear}-${String(index + 1).padStart(2, '0')}`;
                const selecionado = mes === month;
                const temDados = mesesComDados.has(mes);
                const futuro = mes > hoje;

                return (
                  <button
                    key={mes}
                    type="button"
                    onClick={() => escolher(mes)}
                    aria-current={selecionado ? 'true' : undefined}
                    className={cx(
                      'relative min-h-11 rounded text-sm font-medium transition',
                      selecionado
                        ? 'bg-primary text-on-primary'
                        : futuro
                          ? 'text-on-surface-variant/50 hover:bg-surface-container'
                          : 'text-on-surface hover:bg-surface-container',
                    )}
                  >
                    {nome}
                    {/* Ponto = há lançamentos neste mês */}
                    {temDados && !selecionado && (
                      <span
                        aria-hidden
                        className="absolute bottom-1.5 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full bg-primary"
                      />
                    )}
                    {temDados && <span className="sr-only">, com lançamentos</span>}
                  </button>
                );
              })}
            </div>

            <p className="mt-3 text-xs text-on-surface-variant">
              O ponto marca os meses que já têm lançamentos.
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
