import { useRef, useState } from 'react';
import { useAccounts, useCategories, useKash } from '@/state/hooks';
import { IntegrityError } from '@/lib/errors';
import { formatBRL } from '@/lib/money';
import { Button, Card, ConfirmDialog, Input, SectionHeader, cx, useToast } from '@/components/ui';
import { Link } from 'react-router-dom';
import { AccountBalances } from '@/components/settings/AccountBalances';

type Feedback = { kind: 'success' | 'error'; message: string } | null;

export function SettingsPage() {
  const { db, refresh, accounts, categories } = useKash();
  const { archive: archiveCategory, unarchive: unarchiveCategory, remove: removeCategory, create: createCategory } =
    useCategories();
  const { archive: archiveAccount, unarchive: unarchiveAccount, remove: removeAccount, create: createAccount } =
    useAccounts();

  const { notify } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [pendingImport, setPendingImport] = useState<unknown>(null);
  const [newCategory, setNewCategory] = useState('');
  const [newAccount, setNewAccount] = useState('');

  async function handleExport() {
    try {
      const snapshot = await db.exportAll();
      const blob = new Blob([JSON.stringify(snapshot, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);

      const link = document.createElement('a');
      link.href = url;
      link.download = `kash-backup-${new Date().toISOString().slice(0, 10)}.json`;
      link.click();
      URL.revokeObjectURL(url);

      setFeedback({ kind: 'success', message: 'Backup baixado com sucesso.' });
    } catch {
      setFeedback({ kind: 'error', message: 'Não foi possível gerar o backup.' });
    }
  }

  async function handleFileChosen(file: File) {
    try {
      const parsed: unknown = JSON.parse(await file.text());
      // A confirmação vem antes da escrita: importar substitui tudo (FR-030).
      setPendingImport(parsed);
    } catch {
      setFeedback({ kind: 'error', message: 'Arquivo inválido: não é um JSON legível.' });
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  async function handleConfirmImport() {
    const snapshot = pendingImport;
    setPendingImport(null);
    if (snapshot === null) return;

    const result = await db.importAll(snapshot);
    if (result.ok) {
      await refresh();
      setFeedback({
        kind: 'success',
        message: `Importado: ${result.counts.transactions} lançamento(s), ${result.counts.categories} categoria(s), ${result.counts.accounts} conta(s).`,
      });
    } else {
      // A base atual continua intacta — é a garantia do requisito.
      setFeedback({ kind: 'error', message: result.errors.join(' ') });
    }
  }

  async function handleRemoveCategory(id: string) {
    try {
      await removeCategory(id);
      setFeedback({ kind: 'success', message: 'Categoria excluída.' });
    } catch (error) {
      setFeedback({
        kind: 'error',
        message: error instanceof IntegrityError ? error.message : 'Não foi possível excluir.',
      });
    }
  }

  async function handleRemoveAccount(id: string) {
    try {
      await removeAccount(id);
      setFeedback({ kind: 'success', message: 'Conta excluída.' });
    } catch (error) {
      setFeedback({
        kind: 'error',
        message: error instanceof IntegrityError ? error.message : 'Não foi possível excluir.',
      });
    }
  }

  async function handleAddCategory() {
    const name = newCategory.trim();
    if (name === '') return;

    await createCategory({
      name,
      icon: 'tag',
      color: '#8a726d',
      kind: 'expense',
      archived: false,
      isDefault: false,
    });
    setNewCategory('');
  }

  async function handleAddAccount() {
    const name = newAccount.trim();
    if (name === '') return;

    await createAccount({ name, initialBalanceCents: 0, archived: false, isDefault: false });
    setNewAccount('');
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <h1 className="font-display text-2xl font-bold text-on-surface">Ajustes</h1>

      {feedback && (
        <div
          role="status"
          className={cx(
            'rounded px-4 py-3 text-sm',
            feedback.kind === 'success'
              ? 'bg-income-container text-on-surface'
              : 'bg-error-container text-on-error-container',
          )}
        >
          {feedback.message}
        </div>
      )}

      {/* Backup */}
      <section>
        <SectionHeader>Backup dos dados</SectionHeader>
        <Card>
          <p className="text-sm text-on-surface-variant">
            Seus dados ficam apenas neste navegador. Se você limpar os dados do site, trocar de
            navegador ou de computador, eles não vão junto — exporte um arquivo para não perder nada.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button onClick={handleExport}>Exportar dados</Button>
            <Button variant="secondary" onClick={() => fileInputRef.current?.click()}>
              Importar dados
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept="application/json,.json"
              className="hidden"
              aria-label="Escolher arquivo de backup"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void handleFileChosen(file);
              }}
            />
          </div>
        </Card>
      </section>

      <AccountBalances />

      <section>
        <SectionHeader>Importar extrato do banco</SectionHeader>
        <Card>
          <p className="text-sm text-on-surface-variant">
            Traga seus lançamentos a partir do CSV exportado pelo app do seu banco.
          </p>
          <Link to="/importar" className="mt-4 inline-block">
            <Button variant="secondary">Importar extrato (CSV)</Button>
          </Link>
        </Card>
      </section>

      {/* Categorias */}
      <section>
        <SectionHeader>Categorias</SectionHeader>
        <Card>
          <ul className="divide-y divide-outline-variant">
            {categories.map((category) => (
              <li key={category.id} className="flex items-center justify-between gap-3 py-2.5">
                <span className="flex min-w-0 items-center gap-2">
                  <span
                    aria-hidden
                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: category.color }}
                  />
                  <span
                    className={cx(
                      'truncate text-sm',
                      category.archived ? 'text-on-surface-variant line-through' : 'text-on-surface',
                    )}
                  >
                    {category.name}
                  </span>
                  {category.archived && (
                    <span className="shrink-0 text-xs text-on-surface-variant">(arquivada)</span>
                  )}
                </span>
                <span className="flex shrink-0 gap-1">
                  <button
                    type="button"
                    onClick={async () => {
                      if (category.archived) {
                        await unarchiveCategory(category.id);
                        notify(`"${category.name}" reativada.`);
                      } else {
                        await archiveCategory(category.id);
                        notify(`"${category.name}" arquivada.`, () =>
                          unarchiveCategory(category.id),
                        );
                      }
                    }}
                    className="inline-flex min-h-11 items-center justify-center rounded px-3 text-xs font-medium transition text-on-surface-variant hover:bg-surface-container"
                  >
                    {category.archived ? 'Reativar' : 'Arquivar'}
                  </button>
                  {!category.isDefault && (
                    <button
                      type="button"
                      onClick={() => handleRemoveCategory(category.id)}
                      className="inline-flex min-h-11 items-center justify-center rounded px-3 text-xs font-medium transition text-error hover:bg-error-container"
                    >
                      Excluir
                    </button>
                  )}
                </span>
              </li>
            ))}
          </ul>

          <div className="mt-4 flex items-end gap-2">
            <div className="flex-1">
              <Input
                label="Nova categoria"
                value={newCategory}
                onChange={(e) => setNewCategory(e.target.value)}
                placeholder="Pets"
                maxLength={40}
              />
            </div>
            <Button onClick={handleAddCategory}>Adicionar</Button>
          </div>
        </Card>
      </section>

      {/* Contas */}
      <section>
        <SectionHeader>Contas</SectionHeader>
        <Card>
          <ul className="divide-y divide-outline-variant">
            {accounts.map((account) => (
              <li key={account.id} className="flex items-center justify-between gap-3 py-2.5">
                <span className="min-w-0">
                  <span
                    className={cx(
                      'block truncate text-sm',
                      account.archived ? 'text-on-surface-variant line-through' : 'text-on-surface',
                    )}
                  >
                    {account.name}
                  </span>
                  {account.initialBalanceCents !== 0 && (
                    <span className="tabular text-xs text-on-surface-variant">
                      Saldo inicial {formatBRL(account.initialBalanceCents)}
                    </span>
                  )}
                </span>
                <span className="flex shrink-0 gap-1">
                  <button
                    type="button"
                    onClick={async () => {
                      if (account.archived) {
                        await unarchiveAccount(account.id);
                        notify(`"${account.name}" reativada.`);
                      } else {
                        await archiveAccount(account.id);
                        notify(`"${account.name}" arquivada.`, () => unarchiveAccount(account.id));
                      }
                    }}
                    className="inline-flex min-h-11 items-center justify-center rounded px-3 text-xs font-medium transition text-on-surface-variant hover:bg-surface-container"
                  >
                    {account.archived ? 'Reativar' : 'Arquivar'}
                  </button>
                  {!account.isDefault && (
                    <button
                      type="button"
                      onClick={() => handleRemoveAccount(account.id)}
                      className="inline-flex min-h-11 items-center justify-center rounded px-3 text-xs font-medium transition text-error hover:bg-error-container"
                    >
                      Excluir
                    </button>
                  )}
                </span>
              </li>
            ))}
          </ul>

          <div className="mt-4 flex items-end gap-2">
            <div className="flex-1">
              <Input
                label="Nova conta"
                value={newAccount}
                onChange={(e) => setNewAccount(e.target.value)}
                placeholder="Inter"
                maxLength={40}
              />
            </div>
            <Button onClick={handleAddAccount}>Adicionar</Button>
          </div>
        </Card>
      </section>

      <ConfirmDialog
        open={pendingImport !== null}
        title="Substituir todos os dados"
        message="A importação substitui integralmente os dados atuais deste navegador. Se ainda não exportou um backup, cancele e exporte antes."
        confirmLabel="Substituir"
        onConfirm={handleConfirmImport}
        onCancel={() => setPendingImport(null)}
      />
    </div>
  );
}
