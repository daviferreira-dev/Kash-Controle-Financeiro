import { Navigate, Route, Routes } from 'react-router-dom';
import { AppShell } from '@/components/layout/AppShell';
import { OverviewPage } from '@/pages/OverviewPage';
import { TransactionsPage } from '@/pages/TransactionsPage';
import { BudgetsPage } from '@/pages/BudgetsPage';
import { RecurrencesPage } from '@/pages/RecurrencesPage';
import { SettingsPage } from '@/pages/SettingsPage';
import { ImportPage } from '@/pages/ImportPage';

/** Rotas em português, para manter a coerência com o FR-031. */
export function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<OverviewPage />} />
        <Route path="/transacoes" element={<TransactionsPage />} />
        <Route path="/orcamentos" element={<BudgetsPage />} />
        <Route path="/recorrencias" element={<RecurrencesPage />} />
        <Route path="/importar" element={<ImportPage />} />
        <Route path="/configuracoes" element={<SettingsPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
