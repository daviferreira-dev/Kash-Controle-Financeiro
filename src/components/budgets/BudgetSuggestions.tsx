import { useMemo, useState } from 'react';
import { suggestBudgets, type BudgetSuggestion } from '@/domain/budgetSuggestion';
import { formatMonthLabel } from '@/lib/date';
import { useBudgets, useKash, useMoney } from '@/state/hooks';
import { Button, Card, SectionHeader } from '@/components/ui';

const DISMISSED_KEY = 'kash:dismissedBudgetSuggestions';

function readDismissed(): string[] {
  try {
    const raw = window.localStorage.getItem(DISMISSED_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? (parsed as string[]) : [];
  } catch {
    return [];
  }
}

function writeDismissed(keys: string[]): void {
  try {
    window.localStorage.setItem(DISMISSED_KEY, JSON.stringify(keys));
  } catch {
    // Sem armazenamento, a dispensa vale só nesta sessão.
  }
}

function SuggestionCard({
  suggestion,
  onAccept,
  onDismiss,
  busy,
}: {
  suggestion: BudgetSuggestion;
  onAccept: () => void;
  onDismiss: () => void;
  busy: boolean;
}) {
  const money = useMoney();
  const { categoryName, color, limitCents, averageCents, minCents, maxCents, months, stable } =
    suggestion;

  return (
    <Card>
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <span
            aria-hidden
            className="h-3 w-3 shrink-0 rounded-full"
            style={{ backgroundColor: color }}
          />
          <h3 className="truncate font-semibold text-on-surface">{categoryName}</h3>
        </div>
        <span className="tabular shrink-0 whitespace-nowrap font-display text-base font-semibold text-on-surface">
          {money.format(limitCents)}
        </span>
      </div>

      <p className="mt-2 text-sm text-on-surface-variant">
        Você gastou em média <strong className="text-on-surface">{money.format(averageCents)}</strong>{' '}
        por mês em {months.length === 2 ? 'dois meses' : `${months.length} meses`} (
        {months.map(formatMonthLabel).join(', ')}).
      </p>

      <p className="mt-1 text-xs text-on-surface-variant">
        {stable
          ? `Gasto regular, entre ${money.format(minCents)} e ${money.format(maxCents)}.`
          : `Gasto irregular, de ${money.format(minCents)} a ${money.format(maxCents)}. O teto tem folga sobre o pior mês.`}
      </p>

      <div className="mt-4 flex flex-wrap gap-2">
        <Button onClick={onAccept} disabled={busy}>
          Criar orçamento de {money.format(limitCents)}
        </Button>
        <Button variant="ghost" onClick={onDismiss} disabled={busy}>
          Agora não
        </Button>
      </div>
    </Card>
  );
}

export function BudgetSuggestions() {
  const { transactions, categories, budgets, month } = useKash();
  const { upsert } = useBudgets();

  const [dismissed, setDismissed] = useState<string[]>(readDismissed);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  const suggestions = useMemo(
    () =>
      suggestBudgets({ transactions, categories, budgets, currentMonth: month }).filter(
        (s) => !dismissed.includes(s.categoryId),
      ),
    [transactions, categories, budgets, month, dismissed],
  );

  if (suggestions.length === 0) return null;

  const visible = expanded ? suggestions : suggestions.slice(0, 3);

  async function accept(suggestion: BudgetSuggestion) {
    setBusyId(suggestion.categoryId);
    try {
      await upsert(suggestion.categoryId, suggestion.limitCents, month);
    } finally {
      setBusyId(null);
    }
  }

  function dismiss(categoryId: string) {
    const next = [...dismissed, categoryId];
    setDismissed(next);
    writeDismissed(next);
  }

  return (
    <section>
      <SectionHeader
        action={
          suggestions.length > 3 ? (
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className="text-sm font-semibold text-primary underline underline-offset-2"
            >
              {expanded ? 'Ver menos' : `Ver todas (${suggestions.length})`}
            </button>
          ) : undefined
        }
      >
        Sugestões a partir dos seus gastos
      </SectionHeader>

      <p className="mb-3 text-sm text-on-surface-variant">
        Estes limites saem do que você gastou de fato nos meses já fechados, não de um palpite.
      </p>

      <div className="flex flex-col gap-3">
        {visible.map((suggestion) => (
          <SuggestionCard
            key={suggestion.categoryId}
            suggestion={suggestion}
            busy={busyId === suggestion.categoryId}
            onAccept={() => accept(suggestion)}
            onDismiss={() => dismiss(suggestion.categoryId)}
          />
        ))}
      </div>
    </section>
  );
}
