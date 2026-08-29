import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import type { Transaction } from '@/domain/types';
import { detectRecurrences } from '@/domain/recurrenceDetection';
import { today } from '@/lib/date';
import {
  dedupeKey,
  parseStatementCsv,
  statementRowsToTransactions,
  suggestCategory,
  type ParseError,
  type StatementRow,
} from '@/domain/csvImport';
import { readCategoryMemory, rememberCategory } from '@/storage/categoryMemory';
import { formatBRL } from '@/lib/money';
import { formatBR } from '@/lib/date';
import { useKash } from '@/state/hooks';
import { Button, Card, ConfirmDialog, Select, cx } from '@/components/ui';

type Mode = 'replace' | 'append';

interface Preview {
  fileName: string;
  rows: StatementRow[];
  errors: ParseError[];
  /** Linhas que já existem na base, quando o modo é "adicionar". */
  duplicates: number;
}

export function StatementImport() {
  const { db, refresh, accounts, categories, transactions } = useKash();
  const activeAccounts = accounts.filter((a) => !a.archived);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [accountId, setAccountId] = useState(activeAccounts[0]?.id ?? '');
  // O padrão é o modo não destrutivo: extratos semanais se sobrepõem, e
  // "Substituir" apagaria lançamentos manuais e de outras contas.
  const [mode, setMode] = useState<Mode>('append');
  const [preview, setPreview] = useState<Preview | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [detected, setDetected] = useState(0);
  // Lançamentos que o Kash não conseguiu classificar, esperando a pessoa dizer
  // a categoria (e ensinar para as próximas importações).
  const [review, setReview] = useState<Transaction[]>([]);
  const [picks, setPicks] = useState<Record<string, string>>({});

  const existingKeys = new Set(
    transactions.map((t) =>
      dedupeKey({
        externalId: extractExternalId(t.notes),
        date: t.date,
        amountCents: t.amountCents,
        type: t.type,
        description: t.description,
      }),
    ),
  );

  async function handleFile(file: File) {
    setResult(null);
    setDetected(0);
    const content = await file.text();
    const { rows, errors } = parseStatementCsv(content);

    const duplicates = rows.filter((row) => existingKeys.has(dedupeKey(row))).length;
    setPreview({ fileName: file.name, rows, errors, duplicates });

    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  async function handleConfirm() {
    setConfirming(false);
    if (!preview) return;

    const account = accounts.find((a) => a.id === accountId);
    if (!account) return;

    const toImport =
      mode === 'append'
        ? preview.rows.filter((row) => !existingKeys.has(dedupeKey(row)))
        : preview.rows;

    const learned = readCategoryMemory();
    const newTransactions = statementRowsToTransactions({
      rows: toImport,
      categories,
      account,
      learned,
    });

    if (mode === 'replace') {
      // Substitui os lançamentos, preservando categorias, contas, orçamentos
      // e recorrências — só o extrato é trocado.
      const snapshot = await db.exportAll();
      await db.importAll({ ...snapshot, transactions: [] });
    }

    const created = await db.transactions.createMany(newTransactions);
    await refresh();

    // O que não bateu com nenhuma regra nem com o aprendizado fica pendente
    // de revisão logo abaixo, sem sair da tela.
    const semCategoria = created.filter(
      (t) => !suggestCategory(t.description, categories, learned).matched,
    );
    setReview(semCategoria);
    setPicks(Object.fromEntries(semCategoria.map((t) => [t.id, t.categoryId])));

    // Analisa o histórico já com os novos lançamentos: é o que transforma
    // "subi o extrato" em "descobri minhas contas fixas".
    const all = await db.transactions.list();
    const recurrences = await db.recurrences.list();
    setDetected(
      detectRecurrences({ transactions: all, today: today(), existingRecurrences: recurrences })
        .length,
    );

    const skipped = preview.rows.length - toImport.length;
    setResult(
      `${newTransactions.length} lançamento(s) importado(s) para ${account.name}.` +
        (skipped > 0 ? ` ${skipped} já existia(m) e foi(ram) ignorado(s).` : '') +
        (mode === 'replace' ? ' Os lançamentos anteriores foram removidos.' : ''),
    );
    setPreview(null);
  }

  async function applyReview() {
    const changed = review.filter((t) => picks[t.id] && picks[t.id] !== t.categoryId);
    for (const t of changed) {
      const categoryId = picks[t.id]!;
      await db.transactions.update(t.id, { categoryId });
      rememberCategory(t.description, categoryId);
    }
    if (changed.length > 0) await refresh();
    setResult((current) =>
      current && changed.length > 0
        ? `${current} ${changed.length} categoria(s) ajustada(s). O Kash vai lembrar na próxima.`
        : current,
    );
    setReview([]);
    setPicks({});
  }

  const income = preview?.rows.filter((r) => r.type === 'income') ?? [];
  const expense = preview?.rows.filter((r) => r.type === 'expense') ?? [];
  const incomeCents = income.reduce((sum, r) => sum + r.amountCents, 0);
  const expenseCents = expense.reduce((sum, r) => sum + r.amountCents, 0);

  const willImport =
    preview && mode === 'append' ? preview.rows.length - preview.duplicates : (preview?.rows.length ?? 0);

  return (
    <section>
      <Card>
        <p className="text-sm text-on-surface-variant">
          Exporte o extrato da sua conta em <strong>CSV</strong> pelo app do banco e escolha o
          arquivo aqui. O Kash lê data, valor e descrição, e sugere uma categoria para cada
          lançamento. Você revisa depois na lista de transações.
        </p>

        {result && (
          <div role="status" className="mt-3 rounded bg-income-container px-3 py-2 text-sm text-on-surface">
            <p>{result}</p>
            {detected > 0 && (
              <p className="mt-2">
                Encontrei <strong>{detected}</strong>{' '}
                {detected === 1 ? 'padrão que parece recorrência' : 'padrões que parecem recorrências'}{' '}
                no seu histórico.{' '}
                <Link to="/recorrencias" className="font-semibold underline underline-offset-2">
                  Ver e confirmar
                </Link>
              </p>
            )}
          </div>
        )}

        {review.length > 0 && (
          <div className="mt-4 rounded border border-warning bg-warning-container px-3 py-3 text-sm">
            <p className="font-semibold text-on-surface">
              Faltou classificar {review.length} lançamento{review.length > 1 ? 's' : ''}.
            </p>
            <p className="mt-1 text-xs text-on-surface-variant">
              Diga a categoria de cada um. O Kash memoriza o estabelecimento e aplica sozinho nas
              próximas importações.
            </p>

            <ul className="mt-3 flex flex-col gap-3">
              {review.map((t) => (
                <li key={t.id} className="flex flex-wrap items-end gap-2">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-on-surface">{t.description}</span>
                    <span className="text-xs text-on-surface-variant">
                      {formatBR(t.date)} · {t.type === 'income' ? '+' : '−'} {formatBRL(t.amountCents)}
                    </span>
                  </span>
                  <div className="w-40 shrink-0">
                    <Select
                      label="Categoria"
                      value={picks[t.id] ?? t.categoryId}
                      onChange={(e) => setPicks((p) => ({ ...p, [t.id]: e.target.value }))}
                    >
                      {categories
                        .filter((c) => !c.archived)
                        .map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                    </Select>
                  </div>
                </li>
              ))}
            </ul>

            <div className="mt-3 flex flex-wrap gap-2">
              <Button onClick={applyReview}>Aplicar e memorizar</Button>
              <Button variant="ghost" onClick={() => setReview([])}>
                Deixar como estão
              </Button>
            </div>
          </div>
        )}

        <div className="mt-4 flex flex-col gap-4">
          <Select
            label="Conta de destino"
            value={accountId}
            onChange={(e) => setAccountId(e.target.value)}
          >
            {activeAccounts.map((account) => (
              <option key={account.id} value={account.id}>
                {account.name}
              </option>
            ))}
          </Select>

          <fieldset className="flex flex-col gap-2">
            <legend className="font-label text-label-caps uppercase text-on-surface-variant">
              O que fazer com os lançamentos atuais
            </legend>
            {(
              [
                [
                  'append',
                  'Adicionar (recomendado)',
                  'Mantém os lançamentos atuais e soma só os que ainda não existem. É o modo certo para atualizar o extrato toda semana.',
                ],
                [
                  'replace',
                  'Substituir tudo',
                  'Apaga TODOS os lançamentos, inclusive os manuais e os de outras contas, e deixa só os deste extrato.',
                ],
              ] as const
            ).map(([value, label, hint]) => (
              <label
                key={value}
                className={cx(
                  'flex cursor-pointer items-start gap-2 rounded border p-3 transition',
                  mode === value
                    ? 'border-primary bg-surface-container'
                    : 'border-outline-variant hover:bg-surface-container',
                )}
              >
                <input
                  type="radio"
                  name="modo-importacao"
                  value={value}
                  checked={mode === value}
                  onChange={() => setMode(value)}
                  className="mt-0.5"
                />
                <span>
                  <span
                    className={cx(
                      'block text-sm font-semibold',
                      value === 'replace' ? 'text-error' : 'text-on-surface',
                    )}
                  >
                    {label}
                  </span>
                  <span className="block text-xs text-on-surface-variant">{hint}</span>
                </span>
              </label>
            ))}
          </fieldset>

          <div>
            <Button variant="secondary" onClick={() => fileInputRef.current?.click()}>
              Escolher arquivo CSV
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              aria-label="Escolher arquivo CSV do extrato"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void handleFile(file);
              }}
            />
          </div>
        </div>

        {preview && (
          <div className="mt-5 border-t border-outline-variant pt-4">
            <h3 className="font-semibold text-on-surface">Prévia de {preview.fileName}</h3>

            {preview.rows.length === 0 ? (
              <p className="mt-2 text-sm text-error">
                Nenhum lançamento pôde ser lido deste arquivo.
              </p>
            ) : (
              <>
                <ul className="mt-2 space-y-1 text-sm text-on-surface-variant">
                  <li>
                    <strong className="text-on-surface">{preview.rows.length}</strong> lançamento(s)
                    lido(s)
                  </li>
                  <li>
                    {income.length} entrada(s) somando{' '}
                    <span className="tabular font-semibold text-income">{formatBRL(incomeCents)}</span>
                  </li>
                  <li>
                    {expense.length} saída(s) somando{' '}
                    <span className="tabular font-semibold text-expense">{formatBRL(expenseCents)}</span>
                  </li>
                  {mode === 'append' && preview.duplicates > 0 && (
                    <li>{preview.duplicates} já existe(m) na base e será(ão) ignorado(s)</li>
                  )}
                </ul>

                <div className="mt-3 max-h-56 overflow-y-auto rounded border border-outline-variant">
                  <ul className="divide-y divide-outline-variant text-sm">
                    {preview.rows.slice(0, 50).map((row) => (
                      <li key={row.line} className="flex items-center justify-between gap-3 px-3 py-2">
                        <span className="min-w-0">
                          <span className="block truncate text-on-surface">{row.description}</span>
                          <span className="text-xs text-on-surface-variant">
                            {formatBR(row.date)}
                          </span>
                        </span>
                        <span
                          className={cx(
                            'tabular shrink-0 font-semibold',
                            row.type === 'income' ? 'text-income' : 'text-expense',
                          )}
                        >
                          {row.type === 'income' ? '+' : '−'} {formatBRL(row.amountCents)}
                        </span>
                      </li>
                    ))}
                  </ul>
                  {preview.rows.length > 50 && (
                    <p className="px-3 py-2 text-xs text-on-surface-variant">
                      …e mais {preview.rows.length - 50} lançamento(s).
                    </p>
                  )}
                </div>
              </>
            )}

            {preview.errors.length > 0 && (
              <details className="mt-3">
                <summary className="cursor-pointer text-sm font-semibold text-error">
                  {preview.errors.length} linha(s) com problema
                </summary>
                <ul className="mt-2 space-y-1 text-xs text-on-surface-variant">
                  {preview.errors.slice(0, 20).map((error) => (
                    <li key={error.line}>
                      <strong>Linha {error.line}:</strong> {error.message}
                    </li>
                  ))}
                </ul>
              </details>
            )}

            <div className="mt-4 flex flex-wrap gap-2">
              <Button onClick={() => setConfirming(true)} disabled={willImport === 0}>
                Importar {willImport} lançamento(s)
              </Button>
              <Button variant="ghost" onClick={() => setPreview(null)}>
                Cancelar
              </Button>
            </div>
          </div>
        )}
      </Card>

      <ConfirmDialog
        open={confirming}
        title={mode === 'replace' ? 'Substituir lançamentos' : 'Importar lançamentos'}
        message={
          mode === 'replace'
            ? `Todos os lançamentos atuais serão apagados e substituídos por ${willImport} do extrato. Categorias, contas, orçamentos e recorrências são preservados. Se ainda não exportou um backup, cancele e exporte antes.`
            : `${willImport} lançamento(s) serão adicionados aos que já existem.`
        }
        confirmLabel={mode === 'replace' ? 'Substituir' : 'Importar'}
        onConfirm={handleConfirm}
        onCancel={() => setConfirming(false)}
      />
    </section>
  );
}

/** Recupera o id do banco gravado nas observações por uma importação anterior. */
function extractExternalId(notes: string | null): string | null {
  if (!notes) return null;
  const match = /·\s*id\s+(\S+)/.exec(notes);
  return match ? match[1]! : null;
}
