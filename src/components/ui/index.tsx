import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import {
  forwardRef,
  useEffect,
  useId,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type CSSProperties,
  type InputHTMLAttributes,
  type ReactNode,
  type RefObject,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';

/** Junta classes ignorando os valores falsy. */
export function cx(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(' ');
}

/**
 * Posição de um popover (menu de mês, alerta de orçamento…) no celular.
 *
 * Um popover ancorado por `right-0`/`left-1/2` no botão que o abre pode nascer
 * fora da tela quando esse botão não está centralizado — foi o caso do sino de
 * orçamento e do seletor de mês, que "abriam pro lado" e ficavam cortados. Em
 * telas estreitas (< 640px, o breakpoint `sm` do Tailwind) este hook devolve
 * um `style` fixo, colado embaixo do botão mas com as bordas presas às
 * margens da tela — cabe sempre inteiro. Em telas maiores devolve `null` e o
 * componente volta a usar o posicionamento absoluto normal, ancorado no botão.
 */
export function useMobilePopoverPosition(
  open: boolean,
  anchorRef: RefObject<HTMLElement>,
): CSSProperties | null {
  const [style, setStyle] = useState<CSSProperties | null>(null);

  useEffect(() => {
    if (!open) {
      setStyle(null);
      return;
    }

    function update() {
      const anchor = anchorRef.current;
      // jsdom (testes) não implementa matchMedia — trata como desktop, igual
      // a um navegador antigo sem suporte: cai no posicionamento normal.
      const isMobile =
        typeof window.matchMedia === 'function' &&
        window.matchMedia('(max-width: 639px)').matches;
      if (!isMobile || !anchor) {
        setStyle(null);
        return;
      }
      const rect = anchor.getBoundingClientRect();
      setStyle({ position: 'fixed', top: rect.bottom + 8, left: 16, right: 16 });
    }

    update();
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [open, anchorRef]);

  return style;
}

/* ------------------------------------------------------------------ Button */

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  fullWidth?: boolean;
}

const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-primary text-on-primary hover:opacity-90',
  secondary:
    'bg-surface-container-lowest text-on-surface border border-outline-variant hover:bg-surface-container',
  ghost: 'text-on-surface-variant hover:bg-surface-container',
  danger: 'bg-error text-on-error hover:opacity-90',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', fullWidth, className, ...props },
  ref,
) {
  const reduceMotion = useReducedMotion();

  return (
    <motion.button
      ref={ref}
      // Resposta imediata ao toque: o botão afunda enquanto o dedo está nele.
      whileTap={reduceMotion || props.disabled ? undefined : { scale: 0.97 }}
      transition={{ duration: 0.1 }}
      className={cx(
        'inline-flex min-h-11 items-center justify-center gap-2 rounded px-4 py-2.5 text-sm font-semibold transition',
        'disabled:cursor-not-allowed disabled:opacity-50',
        BUTTON_VARIANTS[variant],
        fullWidth && 'w-full',
        className,
      )}
      {...(props as React.ComponentProps<typeof motion.button>)}
    />
  );
});

/* ------------------------------------------------------------------- Field */

interface FieldProps {
  label: string;
  htmlFor: string;
  error?: string | undefined;
  hint?: string | undefined;
  children: ReactNode;
}

/** Rótulo, erro e dica — a estrutura acessível compartilhada pelos campos. */
export function Field({ label, htmlFor, error, hint, children }: FieldProps) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={htmlFor} className="font-label text-label-caps uppercase text-on-surface-variant">
        {label}
      </label>
      {children}
      {hint && !error && <p className="text-xs text-on-surface-variant">{hint}</p>}
      {error && (
        <p id={`${htmlFor}-error`} role="alert" className="text-xs font-medium text-error">
          {error}
        </p>
      )}
    </div>
  );
}

const CONTROL_CLASS =
  'min-h-11 w-full rounded border bg-surface-container-lowest px-3 py-2.5 text-sm text-on-surface ' +
  'placeholder:text-placeholder transition disabled:opacity-60';

function controlClass(hasError: boolean, extra?: string): string {
  return cx(CONTROL_CLASS, hasError ? 'border-error' : 'border-outline-variant', extra);
}

/* ------------------------------------------------------------------- Input */

interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'id'> {
  label: string;
  error?: string | undefined;
  hint?: string | undefined;
  id?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, error, hint, id, className, ...props },
  ref,
) {
  const generatedId = useId();
  const inputId = id ?? generatedId;

  return (
    <Field label={label} htmlFor={inputId} error={error} hint={hint}>
      <input
        ref={ref}
        id={inputId}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${inputId}-error` : undefined}
        className={controlClass(Boolean(error), className)}
        {...props}
      />
    </Field>
  );
});

/* ------------------------------------------------------------ CurrencyInput */

interface CurrencyInputProps extends Omit<InputProps, 'inputMode' | 'type'> {
  /** Renderiza o valor com a tipografia display, para o campo de destaque. */
  hero?: boolean;
}

/**
 * Campo monetário. Mantém a string digitada e delega a conversão a `parseBRL`
 * no submit — assim o usuário digita "1.234,56" naturalmente.
 */
export const CurrencyInput = forwardRef<HTMLInputElement, CurrencyInputProps>(
  function CurrencyInput({ label, error, hint, id, hero, className, ...props }, ref) {
    const generatedId = useId();
    const inputId = id ?? generatedId;

    return (
      <Field label={label} htmlFor={inputId} error={error} hint={hint}>
        <div className="relative">
          <span
            aria-hidden
            className={cx(
              'pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant',
              hero ? 'font-display text-2xl' : 'text-sm',
            )}
          >
            R$
          </span>
          <input
            ref={ref}
            id={inputId}
            type="text"
            inputMode="decimal"
            autoComplete="off"
            placeholder="0,00"
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? `${inputId}-error` : undefined}
            className={controlClass(
              Boolean(error),
              cx(
                'tabular pl-12',
                hero ? 'font-display text-3xl font-bold sm:text-4xl' : '',
                className,
              ),
            )}
            {...props}
          />
        </div>
      </Field>
    );
  },
);

/* ------------------------------------------------------------------ Select */

interface SelectProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'id'> {
  label: string;
  error?: string | undefined;
  hint?: string | undefined;
  id?: string;
  children: ReactNode;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { label, error, hint, id, className, children, ...props },
  ref,
) {
  const generatedId = useId();
  const selectId = id ?? generatedId;

  return (
    <Field label={label} htmlFor={selectId} error={error} hint={hint}>
      <select
        ref={ref}
        id={selectId}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${selectId}-error` : undefined}
        className={controlClass(Boolean(error), className)}
        {...props}
      >
        {children}
      </select>
    </Field>
  );
});

/* ---------------------------------------------------------------- Textarea */

interface TextareaProps extends Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'id'> {
  label: string;
  error?: string | undefined;
  hint?: string | undefined;
  id?: string;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { label, error, hint, id, className, ...props },
  ref,
) {
  const generatedId = useId();
  const areaId = id ?? generatedId;

  return (
    <Field label={label} htmlFor={areaId} error={error} hint={hint}>
      <textarea
        ref={ref}
        id={areaId}
        rows={3}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${areaId}-error` : undefined}
        className={controlClass(Boolean(error), cx('resize-y', className))}
        {...props}
      />
    </Field>
  );
});

/* -------------------------------------------------------------------- Chip */

interface ChipProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  selected?: boolean;
  color?: string;
}

/** Chip selecionável. `aria-pressed` comunica o estado sem depender de cor. */
export function Chip({ selected, color, className, children, ...props }: ChipProps) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      className={cx(
        'inline-flex min-h-11 items-center gap-1.5 rounded border px-3 py-1.5 text-sm transition',
        selected
          ? 'border-primary bg-primary text-on-primary font-semibold'
          : 'border-outline-variant bg-surface-container-lowest text-on-surface hover:bg-surface-container',
        className,
      )}
      {...props}
    >
      {color && (
        <span
          aria-hidden
          className="h-2 w-2 shrink-0 rounded-full"
          style={{ backgroundColor: selected ? 'currentColor' : color }}
        />
      )}
      {children}
    </button>
  );
}

/* ------------------------------------------------------------------- Modal */

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}

export function Modal({ open, onClose, title, children }: ModalProps) {
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);

  // `onClose` costuma ser uma função nova a cada render do pai. Guardá-la num
  // ref evita que o efeito abaixo seja reexecutado a cada re-render — se ele
  // fosse, o foco voltaria para o diálogo e o usuário perderia o que digitava.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return;

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onCloseRef.current();
    }
    document.addEventListener('keydown', onKeyDown);

    // Leva o foco para dentro do diálogo — mas só se um campo com autoFocus
    // ainda não o tiver tomado. Focar o container por cima do autoFocus faria
    // o usuário digitar no vazio logo ao abrir o formulário.
    const dialog = dialogRef.current;
    if (dialog && !dialog.contains(document.activeElement)) {
      const firstField = dialog.querySelector<HTMLElement>(
        'input, select, textarea, button:not([aria-label="Fechar"])',
      );
      (firstField ?? dialog).focus();
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="absolute inset-0 bg-scrim"
            onClick={onClose}
            aria-hidden
          />
          <ModalPanel
            dialogRef={dialogRef}
            titleId={titleId}
            title={title}
            onClose={onClose}
          >
            {children}
          </ModalPanel>
        </div>
      )}
    </AnimatePresence>
  );
}

function ModalPanel({
  dialogRef,
  titleId,
  title,
  onClose,
  children,
}: {
  dialogRef: React.RefObject<HTMLDivElement>;
  titleId: string;
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const reduceMotion = useReducedMotion();

  return (
    <div style={{ display: 'contents' }}>
      <motion.div
        ref={dialogRef}
        initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 24, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 16, scale: 0.98 }}
        transition={{ duration: 0.22, ease: [0.2, 0.8, 0.2, 1] }}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={cx(
          'relative z-10 flex max-h-[92vh] w-full flex-col overflow-hidden bg-surface-container-lowest shadow-ambient',
          'rounded-t-lg sm:max-w-lg sm:rounded',
        )}
      >
        <header className="flex items-center justify-between border-b border-outline-variant px-5 py-4">
          <h2 id={titleId} className="font-label text-section-header uppercase text-on-surface">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            className="-mr-2 inline-flex h-11 w-11 items-center justify-center rounded text-on-surface-variant transition hover:bg-surface-container"
          >
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden>
              <path
                d="M5 5l10 10M15 5L5 15"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </header>
        <div className="overflow-y-auto px-5 py-5">{children}</div>
      </motion.div>
    </div>
  );
}

/* ----------------------------------------------------------- ConfirmDialog */

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Excluir',
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  return (
    <Modal open={open} onClose={onCancel} title={title}>
      <p className="text-sm text-on-surface-variant">{message}</p>
      <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button variant="secondary" onClick={onCancel}>
          Cancelar
        </Button>
        <Button variant="danger" onClick={onConfirm}>
          {confirmLabel}
        </Button>
      </div>
    </Modal>
  );
}

/* --------------------------------------------------------------- EmptyState */

interface EmptyStateProps {
  title: string;
  description: string;
  action?: ReactNode;
}

/** Estado vazio explicativo com ação sugerida (FR-013). */
export function EmptyState({ title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center gap-3 rounded border border-dashed border-outline-variant bg-surface-container-lowest px-6 py-12 text-center">
      <h3 className="font-display text-xl text-on-surface">{title}</h3>
      <p className="max-w-sm text-sm text-on-surface-variant">{description}</p>
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

/* -------------------------------------------------------------------- Card */

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div
      className={cx(
        'rounded border border-outline-variant bg-surface-container-lowest p-5',
        className,
      )}
    >
      {children}
    </div>
  );
}

/* ------------------------------------------------------------ SectionHeader */

export function SectionHeader({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-3 flex items-center justify-between gap-3">
      <h2 className="font-label text-section-header uppercase tracking-wide text-on-surface-variant">
        {children}
      </h2>
      {action}
    </div>
  );
}

export { ToastProvider, useToast } from './Toast';
