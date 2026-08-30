import { useMemo, useState } from 'react';
import {
  FREQUENCY_LABEL,
  confidenceLabel,
  detectRecurrences,
  type RecurrenceSuggestion,
} from '@/domain/recurrenceDetection';
import { formatBR, today } from '@/lib/date';
import { useKash, useMoney, useRecurrences } from '@/state/hooks';
import { Button, Card, SectionHeader, cx, useToast } from '@/components/ui';

const DISMISSED_KEY = 'kash:dismissedPatterns';

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
    // Sem armazenamento, a dispensa vale só nesta sessão — aceitável.
  }
}

function SuggestionCard({
  suggestion,
  onAccept,
  onDismiss,
  busy,
}: {
  suggestion: RecurrenceSuggestion;
  onAccept: () => void;
  onDismiss: () => void;
  busy: boolean;
}) {
  const money = useMoney();
  const { label, type, frequency, amountCents, minCents, maxCents, stableAmount } = suggestion;

  return (
    <Card>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate font-semibold text-on-surface">{label}</h3>
          <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-on-surface-variant">
            <span className="rounded bg-surface-container-high px-1.5 py-0.5 font-medium">
              {FREQUENCY_LABEL[frequency]}
            </span>
            <span>{confidenceLabel(suggestion.confidence)}</span>
            <span aria-hidden>·</span>
            <span>
              {suggestion.occurrences.length} lançamentos, de {formatBR(suggestion.firstDate)} a{' '}
              {formatBR(suggestion.lastDate)}
            </span>
          </p>
        </div>

        <span
          className={cx(
            'tabular shrink-0 whitespace-nowrap font-display text-base font-semibold',
            type === 'income' ? 'text-income' : 'text-expense',
          )}
        >
          {type === 'income' ? '+' : '−'} {money.format(amountCents)}
        </span>
      </div>

      <p className="mt-2 text-sm text-on-surface-variant">
        {stableAmount ? (
          <>Próximo esperado em {formatBR(suggestion.nextDate)}.</>
        ) : (
          <>
            Valor varia entre {money.format(minCents)} e {money.format(maxCents)}. Próximo esperado em{' '}
            {formatBR(suggestion.nextDate)}.
          </>
        )}
      </p>

      <div className="mt-4 flex flex-wrap gap-2">
        <Button onClick={onAccept} disabled={busy}>
          Criar recorrência
        </Button>
        <Button variant="ghost" onClick={onDismiss} disabled={busy}>
          Não é recorrência
        </Button>
      </div>
    </Card>
  );
}

export function RecurrenceSuggestions() {
  const { transactions, recurrences } = useKash();
  const { create } = useRecurrences();
  const { notify } = useToast();

  const [dismissed, setDismissed] = useState<string[]>(readDismissed);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  const suggestions = useMemo(
    () =>
      detectRecurrences({
        transactions,
        today: today(),
        existingRecurrences: recurrences,
        dismissedKeys: dismissed,
      }),
    [transactions, recurrences, dismissed],
  );

  if (suggestions.length === 0) return null;

  const visible = expanded ? suggestions : suggestions.slice(0, 3);

  async function accept(suggestion: RecurrenceSuggestion) {
    setBusyKey(suggestion.key);
    try {
      await create({
        type: suggestion.type,
        amountCents: suggestion.amountCents,
        description: suggestion.label,
        categoryId: suggestion.categoryId,
        accountId: suggestion.accountId,
        notes: 'Detectada a partir do histórico',
        frequency: suggestion.frequency,
        startDate: suggestion.firstDate,
        endDate: null,
        // Nasce pausada de propósito: os lançamentos até aqui já existem no
        // histórico, e gerar os próximos duplicaria o que vem no extrato.
        status: 'paused',
        lastGeneratedDate: suggestion.lastDate,
      });
      notify(`"${suggestion.label}" criada como recorrência.`);
    } finally {
      setBusyKey(null);
    }
  }

  function dismiss(key: string) {
    const next = [...dismissed, key];
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
        Padrões encontrados no seu histórico
      </SectionHeader>

      <p className="mb-3 text-sm text-on-surface-variant">
        Estes lançamentos se repetem com regularidade. Transformar num cadastro de recorrência
        organiza suas contas fixas e mostra o que ainda vai cair no mês.
      </p>

      <div className="flex flex-col gap-3">
        {visible.map((suggestion) => (
          <SuggestionCard
            key={suggestion.key}
            suggestion={suggestion}
            busy={busyKey === suggestion.key}
            onAccept={() => accept(suggestion)}
            onDismiss={() => dismiss(suggestion.key)}
          />
        ))}
      </div>
    </section>
  );
}
