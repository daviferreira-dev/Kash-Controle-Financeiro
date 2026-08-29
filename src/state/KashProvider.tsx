import {
  createContext,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type {
  Account,
  Budget,
  Category,
  IsoMonth,
  Recurrence,
  Transaction,
} from '@/domain/types';
import type { KashDatabase } from '@/storage/repository';
import { database as defaultDatabase } from '@/storage/database';
import { currentMonth, today } from '@/lib/date';
import { runRecurrences } from '@/domain/recurrence';
import { buildDemoSnapshot } from '@/demo/demoData';
import { ToastProvider } from '@/components/ui/Toast';

/** Build da versão demo: `vite build --mode demo` (script `build:demo`). */
export const IS_DEMO = import.meta.env.MODE === 'demo';

export interface KashState {
  transactions: Transaction[];
  categories: Category[];
  accounts: Account[];
  budgets: Budget[];
  recurrences: Recurrence[];
}

export interface KashContextValue extends KashState {
  db: KashDatabase;
  loading: boolean;
  /** false quando o navegador não permite gravar (FR-029). */
  storageAvailable: boolean;
  /** Mês selecionado, compartilhado entre Overview, Transações e Orçamentos. */
  month: IsoMonth;
  setMonth: (month: IsoMonth) => void;
  /** Oculta os valores em dinheiro na interface (o "olho" das telas de banco). */
  hideAmounts: boolean;
  toggleHideAmounts: () => void;
  theme: Theme;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
  /** Quantos lançamentos a engine de recorrências criou nesta abertura. */
  generatedCount: number;
  dismissGeneratedNotice: () => void;
  /** true na versão demo publicada (dados fictícios). */
  isDemo: boolean;
  /** Restaura o dataset fictício da demo. */
  resetDemo: () => Promise<void>;
  /** Recarrega o estado a partir do banco após uma escrita. */
  refresh: () => Promise<void>;
}

export type Theme = 'light' | 'dark';

const HIDE_AMOUNTS_KEY = 'kash:hideAmounts';
const THEME_KEY = 'kash:theme';

/** Preferência salva; na ausência dela, o que o sistema operacional pede. */
function readTheme(): Theme {
  try {
    const saved = window.localStorage.getItem(THEME_KEY);
    if (saved === 'light' || saved === 'dark') return saved;
  } catch {
    // sem armazenamento: cai no padrão do sistema
  }
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function readHideAmounts(): boolean {
  try {
    return window.localStorage.getItem(HIDE_AMOUNTS_KEY) === 'true';
  } catch {
    return false;
  }
}

const EMPTY_STATE: KashState = {
  transactions: [],
  categories: [],
  accounts: [],
  budgets: [],
  recurrences: [],
};

export const KashContext = createContext<KashContextValue | null>(null);

interface KashProviderProps {
  children: ReactNode;
  /** Injetável nos testes; em produção usa a instância única sobre localStorage. */
  db?: KashDatabase;
}

/**
 * Mantém o dataset inteiro em memória, sincronizado com o repositório
 * (decisão R-004). O volume-alvo do SC-005 cabe folgado, e os derivados são
 * calculados com useMemo nas páginas.
 */
export function KashProvider({ children, db = defaultDatabase }: KashProviderProps) {
  const [state, setState] = useState<KashState>(EMPTY_STATE);
  const [loading, setLoading] = useState(true);
  const [storageAvailable, setStorageAvailable] = useState(true);
  const [month, setMonth] = useState<IsoMonth>(currentMonth);
  const [generatedCount, setGeneratedCount] = useState(0);
  const [hideAmounts, setHideAmounts] = useState(readHideAmounts);
  const [theme, setThemeState] = useState<Theme>(readTheme);

  const setTheme = useCallback((next: Theme) => {
    setThemeState(next);
    try {
      window.localStorage.setItem(THEME_KEY, next);
    } catch {
      // sem armazenamento, a escolha vale só nesta sessão
    }
  }, []);
  const hydratedDbRef = useRef<KashDatabase | null>(null);

  // O atributo no <html> é o que ativa o bloco de tokens escuros.
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  const toggleTheme = useCallback(() => {
    setTheme(theme === 'dark' ? 'light' : 'dark');
  }, [setTheme, theme]);


  const toggleHideAmounts = useCallback(() => {
    setHideAmounts((current) => {
      const next = !current;
      try {
        window.localStorage.setItem(HIDE_AMOUNTS_KEY, String(next));
      } catch {
        // Sem armazenamento, a preferência vale só nesta sessão.
      }
      return next;
    });
  }, []);

  const refresh = useCallback(async () => {
    const [transactions, categories, accounts, budgets, recurrences] = await Promise.all([
      db.transactions.list(),
      db.categories.list(),
      db.accounts.list(),
      db.budgets.list(),
      db.recurrences.list(),
    ]);
    setState({ transactions, categories, accounts, budgets, recurrences });
  }, [db]);

  useEffect(() => {
    // O StrictMode executa este efeito duas vezes em desenvolvimento. Sem o
    // guard, `runRecurrences` rodaria duas vezes em paralelo e as duas
    // execuções passariam pela checagem de idempotência antes de qualquer
    // escrita, duplicando os lançamentos gerados.
    //
    // Deliberadamente NÃO há flag de cancelamento aqui: o cleanup do
    // StrictMode dispara logo após a primeira execução, e abortar as
    // atualizações de estado por causa dele deixaria o app preso em
    // "Carregando…". No React 18 atualizar o estado depois da desmontagem é
    // inofensivo.
    if (hydratedDbRef.current === db) return;
    hydratedDbRef.current = db;

    async function hydrate() {
      setStorageAvailable(db.isAvailable());

      try {
        await db.seedIfEmpty();

        // Versão demo: numa base ainda vazia, carrega o dataset fictício.
        if (IS_DEMO && (await db.transactions.list()).length === 0) {
          await db.importAll(buildDemoSnapshot(today()));
        }

        // A engine de recorrências roda na abertura do app (FR-020).
        const result = await runRecurrences(db, today());
        setGeneratedCount(result.createdCount);

        await refresh();
      } catch {
        // Falha de armazenamento não pode deixar o app numa tela em branco:
        // seguimos com o que houver e o aviso do FR-029 explica o problema.
        setStorageAvailable(false);
      } finally {
        setLoading(false);
      }
    }

    void hydrate();
  }, [db, refresh]);

  const dismissGeneratedNotice = useCallback(() => setGeneratedCount(0), []);

  const resetDemo = useCallback(async () => {
    await db.importAll(buildDemoSnapshot(today()));
    await refresh();
  }, [db, refresh]);

  const value = useMemo<KashContextValue>(
    () => ({
      ...state,
      db,
      loading,
      storageAvailable,
      month,
      setMonth,
      hideAmounts,
      toggleHideAmounts,
      theme,
      setTheme,
      toggleTheme,
      generatedCount,
      dismissGeneratedNotice,
      isDemo: IS_DEMO,
      resetDemo,
      refresh,
    }),
    [
      state,
      db,
      loading,
      storageAvailable,
      month,
      hideAmounts,
      toggleHideAmounts,
      theme,
      setTheme,
      toggleTheme,
      generatedCount,
      dismissGeneratedNotice,
      resetDemo,
      refresh,
    ],
  );

  // O ToastProvider vive aqui dentro: onde há estado do app, há avisos — e
  // assim qualquer tela renderizada isoladamente já os tem disponíveis.
  return (
    <KashContext.Provider value={value}>
      <ToastProvider>{children}</ToastProvider>
    </KashContext.Provider>
  );
}
