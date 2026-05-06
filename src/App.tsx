import { useEffect } from 'react';
import { HashRouter, Routes, Route } from 'react-router-dom';
import { AppLayout } from '@/components/layout/AppLayout';
import { DashboardPage } from '@/pages/DashboardPage';
import { AgentsPage } from '@/pages/AgentsPage';
import { ToolsPage } from '@/pages/ToolsPage';
import { PlaceholderPage } from '@/pages/PlaceholderPage';
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
          <Route path="/conversations" element={<PlaceholderPage title="Conversas" description="Integração com Talki em desenvolvimento." icon="chat" />} />
          <Route path="/analytics" element={<PlaceholderPage title="Analytics" description="Módulo de métricas avançadas em desenvolvimento." icon="chart" />} />
          <Route path="/logs" element={<PlaceholderPage title="Logs" description="Histórico completo de execuções em desenvolvimento." icon="terminal" />} />
          <Route path="/settings" element={<PlaceholderPage title="Configurações" description="Painel de configurações em desenvolvimento." icon="settings" />} />
          <Route path="/clients" element={<PlaceholderPage title="Clientes" description="Gestão de clientes em desenvolvimento." icon="building" />} />
        </Routes>
      </AppLayout>
      <ToastContainer />
    </HashRouter>
  );
}
