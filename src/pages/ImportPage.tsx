import { Link } from 'react-router-dom';
import { StatementImport } from '@/components/settings/StatementImport';

export function ImportPage() {
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5">
      <header className="flex flex-col gap-2">
        <Link
          to="/transacoes"
          className="inline-flex min-h-11 w-fit items-center gap-1 text-sm font-medium text-on-surface-variant hover:text-on-surface"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path d="M15 5l-7 7 7 7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
          Voltar para transações
        </Link>
        <h1 className="font-display text-2xl font-bold text-on-surface">Importar extrato</h1>
      </header>

      <StatementImport />
    </div>
  );
}
