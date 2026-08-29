import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';

/**
 * Avisos com ação de desfazer.
 *
 * Confirmar antes de toda ação irreversível cansa; desfazer depois respeita
 * mais o tempo de quem usa. Para o que é reversível — arquivar, excluir um
 * lançamento — o aviso com "Desfazer" é o caminho certo.
 */
interface Toast {
  id: number;
  message: string;
  undo?: (() => void | Promise<void>) | undefined;
}

interface ToastContextValue {
  /** Mostra um aviso. Se `undo` for passado, o botão de desfazer aparece. */
  notify: (message: string, undo?: () => void | Promise<void>) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const DURACAO_MS = 6000;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const proximoId = useRef(1);
  const reduceMotion = useReducedMotion();

  const dispensar = useCallback((id: number) => {
    setToasts((atuais) => atuais.filter((t) => t.id !== id));
  }, []);

  const notify = useCallback(
    (message: string, undo?: () => void | Promise<void>) => {
      const id = proximoId.current++;
      setToasts((atuais) => [...atuais, { id, message, undo }]);
      // Some sozinho: um aviso que exige fechar vira mais uma tarefa.
      window.setTimeout(() => dispensar(id), DURACAO_MS);
    },
    [dispensar],
  );

  return (
    <ToastContext.Provider value={{ notify }}>
      {children}

      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-0 z-[60] flex flex-col items-center gap-2 px-4 pb-[calc(5.5rem+env(safe-area-inset-bottom))] md:pb-6"
      >
        <AnimatePresence initial={false}>
          {toasts.map((toast) => (
            <motion.div
              key={toast.id}
              layout
              initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 16, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 8, scale: 0.96 }}
              transition={{ duration: 0.22, ease: [0.2, 0.8, 0.2, 1] }}
              className="pointer-events-auto flex w-full max-w-md items-center justify-between gap-3 rounded-lg border border-outline-variant bg-surface-container-highest px-4 py-3 shadow-ambient"
            >
              <p className="text-sm text-on-surface">{toast.message}</p>

              <div className="flex shrink-0 items-center gap-1">
                {toast.undo && (
                  <button
                    type="button"
                    onClick={async () => {
                      dispensar(toast.id);
                      await toast.undo?.();
                    }}
                    className="min-h-11 rounded px-3 text-sm font-semibold text-primary underline underline-offset-2"
                  >
                    Desfazer
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => dispensar(toast.id)}
                  aria-label="Fechar aviso"
                  className="inline-flex h-11 w-11 items-center justify-center rounded text-on-surface-variant transition hover:bg-surface-container"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
                    <path
                      d="M6 6l12 12M18 6L6 18"
                      stroke="currentColor"
                      strokeWidth="1.6"
                      strokeLinecap="round"
                    />
                  </svg>
                </button>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);
  if (!context) throw new Error('useToast deve ser usado dentro de <ToastProvider>');
  return context;
}
