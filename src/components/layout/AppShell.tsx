import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { useKash, useMoney } from '@/state/hooks';
import { computeBudgetProgress, isBudgetActiveIn } from '@/domain/budget';
import { currentMonth } from '@/lib/date';
import { cx } from '@/components/ui';
import logoLight from '@/assets/brand/logo-light.png';
import logoDark from '@/assets/brand/logo-dark.png';
import iconOverview from '@/assets/icons/overview.png';
import iconTransactions from '@/assets/icons/transactions.png';
import iconBudgets from '@/assets/icons/budgets.png';
import iconRecurrences from '@/assets/icons/recurrences.png';
import iconSettings from '@/assets/icons/settings.png';

/**
 * A marca tem duas artes: `logo-light` (tinta escura) para o tema claro e
 * `logo-dark` (traço branco) para o escuro. Os dois PNGs foram normalizados no
 * mesmo enquadramento — mesmo recorte, mesma proporção, fundo transparente —,
 * então a troca por `theme` não muda tamanho nem posição do wordmark. A troca
 * segue o `theme` do KashProvider, não a media query do sistema, que pode
 * divergir do tema escolhido no app.
 */
function BrandLogo({ className }: { className?: string }) {
  const { theme } = useKash();

  return (
    <img
      src={theme === 'dark' ? logoDark : logoLight}
      alt="Kash"
      className={cx('object-contain', className)}
    />
  );
}

interface NavItem {
  to: string;
  label: string;
  /** Ilustração colorida — usada só na sidebar do desktop, onde há espaço. */
  art: string;
  /** Ícone de traço — usado na barra inferior do mobile; herda `currentColor`. */
  line: JSX.Element;
}

const ICON_PROPS = {
  width: 22,
  height: 22,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.6,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
};

/**
 * As artes já vêm normalizadas: recortadas no conteúdo, com o mesmo respiro e
 * o mesmo fundo creme assado no PNG. Aqui elas viram um tile arredondado de
 * tamanho fixo — mesma aparência nos dois temas, com cara de ícone de app e
 * não de figurinha colada.
 */
function NavArt({ src }: { src: string }) {
  return (
    <span className="grid h-8 w-8 shrink-0 overflow-hidden rounded-lg shadow-sm ring-1 ring-black/10">
      <img src={src} alt="" aria-hidden className="h-full w-full object-cover" />
    </span>
  );
}

const NAV_ITEMS: NavItem[] = [
  {
    to: '/',
    label: 'Visão geral',
    art: iconOverview,
    line: (
      <svg {...ICON_PROPS}>
        <path d="M3 12l9-8 9 8" />
        <path d="M5 10v10h14V10" />
      </svg>
    ),
  },
  {
    to: '/transacoes',
    label: 'Transações',
    art: iconTransactions,
    line: (
      <svg {...ICON_PROPS}>
        <path d="M4 7h16M4 12h16M4 17h10" />
      </svg>
    ),
  },
  {
    to: '/orcamentos',
    label: 'Orçamentos',
    art: iconBudgets,
    line: (
      <svg {...ICON_PROPS}>
        <circle cx="12" cy="12" r="8" />
        <path d="M12 4v8l5 3" />
      </svg>
    ),
  },
  {
    to: '/recorrencias',
    label: 'Recorrências',
    art: iconRecurrences,
    line: (
      <svg {...ICON_PROPS}>
        <path d="M4 10a8 8 0 0113.7-5.7L20 6" />
        <path d="M20 14A8 8 0 016.3 19.7L4 18" />
        <path d="M20 3v4h-4M4 21v-4h4" />
      </svg>
    ),
  },
  {
    to: '/configuracoes',
    label: 'Ajustes',
    art: iconSettings,
    line: (
      <svg {...ICON_PROPS}>
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.6 1.6 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.6 1.6 0 00-1.8-.3 1.6 1.6 0 00-1 1.5V21a2 2 0 11-4 0v-.1A1.6 1.6 0 008 19.4a1.6 1.6 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.6 1.6 0 00.3-1.8 1.6 1.6 0 00-1.5-1H2a2 2 0 110-4h.1A1.6 1.6 0 004.6 8a1.6 1.6 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.6 1.6 0 001.8.3H9a1.6 1.6 0 001-1.5V2a2 2 0 114 0v.1a1.6 1.6 0 001 1.5 1.6 1.6 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.6 1.6 0 00-.3 1.8V9a1.6 1.6 0 001.5 1H22a2 2 0 110 4h-.1a1.6 1.6 0 00-1.5 1z" />
      </svg>
    ),
  },
];

/**
 * A transição do indicador entre módulos.
 *
 * `layoutId` compartilhado faz o Framer Motion animar a pílula de um item ao
 * outro em vez de apagá-la aqui e desenhá-la lá. A mola é rígida e bem
 * amortecida: acompanha o clique sem parecer elástica.
 */
const INDICADOR = { type: 'spring' as const, stiffness: 480, damping: 38, mass: 0.7 };

function SunIcon() {
  return (
    <svg {...ICON_PROPS} width={17} height={17}>
      <circle cx="12" cy="12" r="4.5" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg {...ICON_PROPS} width={17} height={17}>
      <path d="M21 12.8A9 9 0 1111.2 3a7 7 0 009.8 9.8z" />
    </svg>
  );
}

/**
 * Claro e escuro como duas opcoes visiveis, nao um alternador cego: a pessoa
 * ve em qual esta antes de clicar. O indicador desliza entre as duas.
 */
/**
 * Alterna claro/escuro em um único alvo de ícone.
 *
 * Fica na barra superior, presente em todas as telas: sempre a um clique,
 * sem ocupar espaço de leitura nem competir com o conteudo. O nome acessível
 * diz o que vai acontecer, não o estado atual.
 */
function ThemeToggle() {
  const { theme, toggleTheme } = useKash();
  const reduceMotion = useReducedMotion();
  const escuro = theme === 'dark';
  const acao = escuro ? 'Mudar para tema claro' : 'Mudar para tema escuro';

  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={acao}
      title={acao}
      className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-outline-variant text-on-surface-variant transition hover:bg-surface-container hover:text-on-surface"
    >
      <AnimatePresence mode="wait" initial={false}>
        <motion.span
          key={theme}
          initial={reduceMotion ? { opacity: 0 } : { opacity: 0, rotate: -70, scale: 0.6 }}
          animate={{ opacity: 1, rotate: 0, scale: 1 }}
          exit={reduceMotion ? { opacity: 0 } : { opacity: 0, rotate: 70, scale: 0.6 }}
          transition={{ duration: 0.22, ease: [0.2, 0.8, 0.2, 1] }}
          className="inline-flex"
        >
          {escuro ? <SunIcon /> : <MoonIcon />}
        </motion.span>
      </AnimatePresence>
    </button>
  );
}

/**
 * Sino de atenção na barra superior. Só aparece quando algum orçamento do mês
 * corrente está em atenção ou estourado; some quando está tudo dentro do limite.
 * Olha sempre o mês de hoje, não o mês que a pessoa está navegando.
 */
function BudgetAlert() {
  const { budgets, categories, transactions, setMonth } = useKash();
  const money = useMoney();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const mes = currentMonth();

  const alertas = budgets
    .filter((b) => isBudgetActiveIn(b, mes))
    .map((b) =>
      computeBudgetProgress(b, categories.find((c) => c.id === b.categoryId), transactions, mes),
    )
    .filter((p) => p.status !== 'ok')
    .sort((a, b) => b.percentUsed - a.percentUsed);

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  if (alertas.length === 0) return null;

  const temEstourado = alertas.some((a) => a.status === 'exceeded');

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={`${alertas.length} orçamento${alertas.length > 1 ? 's' : ''} pedindo atenção`}
        className={cx(
          'inline-flex h-11 w-11 items-center justify-center rounded-full border border-outline-variant transition hover:bg-surface-container',
          temEstourado ? 'text-error' : 'text-warning',
        )}
      >
        <svg {...ICON_PROPS}>
          <path d="M10.3 3.3a2 2 0 0 1 3.4 0l8.4 14.2A2 2 0 0 1 20.4 20.5H3.6a2 2 0 0 1-1.7-3z" />
          <path d="M12 9.5v4" />
          <path d="M12 17h.01" />
        </svg>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            role="dialog"
            aria-label="Orçamentos pedindo atenção"
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.16, ease: [0.2, 0.8, 0.2, 1] }}
            className="absolute right-0 top-full z-50 mt-2 w-[min(20rem,calc(100vw-2rem))] rounded-lg border border-outline-variant bg-surface-container-lowest p-2 shadow-ambient"
          >
            <p className="px-2 pb-1 pt-1 font-label text-label-caps uppercase text-on-surface-variant">
              Pedindo atenção neste mês
            </p>
            <ul className="flex flex-col">
              {alertas.map((a) => (
                <li key={a.budget.id}>
                  <Link
                    to={`/orcamentos?foco=${a.budget.id}`}
                    onClick={() => {
                      setMonth(mes);
                      setOpen(false);
                    }}
                    className="flex items-center justify-between gap-3 rounded px-2 py-2 text-sm hover:bg-surface-container"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-on-surface">
                        {a.category?.name ?? 'Categoria'}
                      </span>
                      <span className="text-xs text-on-surface-variant">
                        {money.format(a.spentCents)} de {money.format(a.budget.limitCents)}
                      </span>
                    </span>
                    <span
                      className={cx(
                        'shrink-0 text-xs font-semibold',
                        a.status === 'exceeded' ? 'text-error' : 'text-warning',
                      )}
                    >
                      {a.statusLabel}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function Logo() {
  return (
    <div className="flex flex-col gap-1">
      <BrandLogo className="h-auto w-[132px]" />
      <span className="font-label text-label-caps uppercase text-on-surface-variant">
        Controle Financeiro
      </span>
    </div>
  );
}

/** Faixa da versão demo: deixa claro que os dados são fictícios. */
function DemoBanner() {
  const { isDemo, resetDemo } = useKash();
  const [busy, setBusy] = useState(false);
  if (!isDemo) return null;

  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 bg-tertiary-container px-4 py-2 text-xs text-on-surface md:text-sm">
      <p>
        <strong className="font-semibold">Versão de demonstração.</strong> Todos os dados são
        fictícios e ficam só neste navegador. Pode mexer à vontade.
      </p>
      <button
        type="button"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          try {
            await resetDemo();
          } finally {
            setBusy(false);
          }
        }}
        className="shrink-0 font-semibold underline disabled:opacity-50"
      >
        {busy ? 'Recarregando…' : 'Recarregar dados de exemplo'}
      </button>
    </div>
  );
}

/** Aviso persistente quando o navegador não permite gravar (FR-029). */
function StorageWarning() {
  const { storageAvailable } = useKash();
  if (storageAvailable) return null;

  return (
    <div role="alert" className="bg-error-container px-4 py-3 text-sm text-on-error-container">
      <strong className="font-semibold">Seus dados não estão sendo salvos.</strong> O armazenamento
      local deste navegador está indisponível ou cheio. O que você registrar será perdido ao fechar
      a página. Verifique se está em janela anônima ou se o site tem permissão para guardar dados.
    </div>
  );
}

/** Aviso de lançamentos criados por recorrência nesta abertura (FR-020). */
function GeneratedNotice() {
  const { generatedCount, dismissGeneratedNotice } = useKash();
  const reduceMotion = useReducedMotion();
  if (generatedCount === 0) return null;

  const plural = generatedCount === 1 ? 'lançamento foi criado' : 'lançamentos foram criados';

  return (
    <motion.div
      role="status"
      initial={reduceMotion ? false : { height: 0, opacity: 0 }}
      animate={{ height: 'auto', opacity: 1 }}
      transition={{ duration: 0.28, ease: [0.2, 0.8, 0.2, 1] }}
      className="flex items-start justify-between gap-3 overflow-hidden bg-tertiary-container px-4 py-3 text-sm text-on-surface"
    >
      <p>
        <strong className="font-semibold">{generatedCount}</strong> {plural} automaticamente a partir
        das suas recorrências.
      </p>
      <button
        type="button"
        onClick={dismissGeneratedNotice}
        className="shrink-0 font-semibold underline"
      >
        Entendi
      </button>
    </motion.div>
  );
}

function NavItemLink({ item, variant }: { item: NavItem; variant: 'bottom' | 'side' }) {
  const reduceMotion = useReducedMotion();
  const bottom = variant === 'bottom';

  return (
    <NavLink to={item.to} end={item.to === '/'} className="relative flex-1 md:flex-none">
      {({ isActive }) => (
        <>
          {isActive && (
            <motion.span
              layoutId={`nav-indicador-${variant}`}
              transition={reduceMotion ? { duration: 0 } : INDICADOR}
              className={cx('absolute inset-0 bg-primary', bottom ? 'rounded-lg' : 'rounded')}
            />
          )}
          <span
            className={cx(
              'relative flex items-center transition-colors duration-200',
              bottom
                ? 'min-h-14 flex-col justify-center gap-1 py-2 text-xs font-medium'
                : 'min-h-11 gap-3 px-3 py-2.5 text-sm font-medium',
              isActive ? 'text-on-primary' : 'text-on-surface-variant',
            )}
          >
            {bottom ? item.line : <NavArt src={item.art} />}
            {item.label}
          </span>
        </>
      )}
    </NavLink>
  );
}

/**
 * Troca de módulo: um fade curto com deslocamento mínimo dá continuidade sem
 * atrasar a leitura — a página nova já está legível antes de a animação
 * terminar.
 */
function PageTransition({ routeKey, children }: { routeKey: string; children: React.ReactNode }) {
  const reduceMotion = useReducedMotion();

  return (
    <motion.div
      key={routeKey}
      initial={reduceMotion ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.24, ease: [0.2, 0.8, 0.2, 1] }}
    >
      {children}
    </motion.div>
  );
}

export function AppShell() {
  const { loading } = useKash();
  const location = useLocation();
  const mainRef = useRef<HTMLElement>(null);

  // Só o conteúdo rola; o menu e a barra superior ficam fixos. Ao trocar de
  // rota, devolve o scroll ao topo (senão a página nova abre no meio).
  useEffect(() => {
    if (mainRef.current) mainRef.current.scrollTop = 0;
  }, [location.pathname]);

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-surface">
      <DemoBanner />
      <StorageWarning />
      <GeneratedNotice />

      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        {/* Sidebar a partir de md */}
        <aside className="hidden w-60 shrink-0 overflow-hidden border-r border-outline-variant bg-surface-container-low p-5 md:flex md:flex-col">
          <div className="mb-5">
            <Logo />
          </div>

          <nav aria-label="Navegação principal" className="flex flex-col gap-1">
            {NAV_ITEMS.map((item) => (
              <NavItemLink key={item.to} item={item} variant="side" />
            ))}
          </nav>

          <p className="mt-auto pt-6 text-xs leading-relaxed text-on-surface-variant">
            Seus dados ficam apenas neste navegador. Faça backup em Ajustes.
          </p>
        </aside>

        <div className="flex min-h-0 flex-1 flex-col">
          {/* Barra superior fixa: logo (no mobile), atenção de orçamento e tema */}
          <header className="flex shrink-0 items-center justify-between gap-3 border-b border-outline-variant px-[max(1.25rem,env(safe-area-inset-left))] py-2.5 md:px-8 lg:px-16">
            <span className="contents md:hidden">
              <BrandLogo className="h-auto w-[92px]" />
            </span>
            <span className="hidden md:block" />
            <div className="flex items-center gap-2">
              <BudgetAlert />
              <ThemeToggle />
            </div>
          </header>

          <main
            ref={mainRef}
            className="sem-barra flex-1 overflow-y-auto px-5 pb-[calc(6rem+env(safe-area-inset-bottom))] pt-5 md:px-8 md:pb-8 lg:px-16"
          >
            {loading ? (
              <p className="py-16 text-center text-sm text-on-surface-variant">Carregando…</p>
            ) : (
              <PageTransition routeKey={location.pathname}>
                <Outlet />
              </PageTransition>
            )}
          </main>
        </div>
      </div>

      {/* Navegação inferior até md */}
      <nav
        aria-label="Navegação principal"
        className="fixed inset-x-0 bottom-0 z-40 flex gap-1 border-t border-outline-variant bg-surface-container-lowest p-1 pb-[calc(0.25rem+env(safe-area-inset-bottom))] md:hidden"
      >
        {NAV_ITEMS.map((item) => (
          <NavItemLink key={item.to} item={item} variant="bottom" />
        ))}
      </nav>
    </div>
  );
}
