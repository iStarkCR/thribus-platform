import { useEffect } from 'react';
import { HashRouter, Routes, Route } from 'react-router-dom';
import { AppLayout } from '@/components/layout/AppLayout';
import { DashboardPage } from '@/pages/DashboardPage';
import { AgentsPage } from '@/pages/AgentsPage';
import { ToolsPage } from '@/pages/ToolsPage';
import { LogsPage } from '@/pages/LogsPage';
import { WorkspacesPage } from '@/pages/WorkspacesPage';
import { SkillsPage } from '@/pages/SkillsPage';
import { TemplatesPage } from '@/pages/TemplatesPage';
import { MetricsPage } from '@/pages/MetricsPage';
import { SettingsPage } from '@/pages/SettingsPage';
import { CortexPage } from '@/pages/CortexPage';
import { CortexEnterprisePage } from '@/pages/CortexEnterprisePage';
import { CortexStackPage } from '@/pages/CortexStackPage';
import { ToastContainer } from '@/components/shared/ToastContainer';
import { useAppStore } from '@/hooks/useAppStore';

export function App() {
  const initialize = useAppStore((s) => s.initialize);

  useEffect(() => {
    initialize();
  }, [initialize]);

  return (
    <HashRouter>
      <AppLayout>
        <Routes>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/agents" element={<AgentsPage />} />
          <Route path="/tools" element={<ToolsPage />} />
          <Route path="/skills" element={<SkillsPage />} />
          <Route path="/templates" element={<TemplatesPage />} />
          <Route path="/analytics" element={<MetricsPage />} />
          <Route path="/logs" element={<LogsPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/clients" element={<WorkspacesPage />} />
          <Route path="/cortex" element={<CortexPage />} />
          <Route path="/enterprise" element={<CortexEnterprisePage />} />
          <Route path="/stack" element={<CortexStackPage />} />
        </Routes>
      </AppLayout>
      <ToastContainer />
    </HashRouter>
  );
}
