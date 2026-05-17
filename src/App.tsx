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
import { KnowledgePage } from '@/pages/KnowledgePage';
import { IntegrationsPage } from '@/pages/IntegrationsPage';
import { OrchestrationPage } from '@/pages/OrchestrationPage';
import { GovernancePage } from '@/pages/GovernancePage';
import { LabPage } from '@/pages/LabPage';
import { Customer360Page } from '@/pages/Customer360Page';
import { InboxPage } from '@/pages/InboxPage';
import { StudioPage } from '@/pages/StudioPage';
import { VoicePage } from '@/pages/VoicePage';
import { MarketplacePage } from '@/pages/MarketplacePage';
import { ReportsPage } from '@/pages/ReportsPage';
import { ExperimentsPage } from '@/pages/ExperimentsPage';
import { LgpdPage } from '@/pages/LgpdPage';
import { InsightsPage } from '@/pages/InsightsPage';
import { PartnerPage } from '@/pages/PartnerPage';
import { StatusPage } from '@/pages/StatusPage';
import { ApiDocsPage } from '@/pages/ApiDocsPage';
import { HelpPage } from '@/pages/HelpPage';
import { MobilePage } from '@/pages/MobilePage';
import { BillingPage } from '@/pages/BillingPage';
import { OnboardingPage } from '@/pages/OnboardingPage';
import { NotificationsPage } from '@/pages/NotificationsPage';
import { WebhooksPage } from '@/pages/WebhooksPage';
import { SandboxPage } from '@/pages/SandboxPage';
import { ActivityPage } from '@/pages/ActivityPage';
import { OptimizerPage } from '@/pages/OptimizerPage';
import { CompliancePage } from '@/pages/CompliancePage';
import { VaultPage } from '@/pages/VaultPage';
import { LoginPage } from '@/pages/LoginPage';
import { CommandPalette } from '@/components/shared/CommandPalette';
import { ToastContainer } from '@/components/shared/ToastContainer';
import { useAppStore } from '@/hooks/useAppStore';

export function App() {
  const initialize = useAppStore((s) => s.initialize);

  useEffect(() => {
    initialize();
  }, [initialize]);

  return (
    <HashRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/*" element={
          <AppLayout>
            <InnerRoutes />
          </AppLayout>
        } />
      </Routes>
      <ToastContainer />
      <CommandPalette />
    </HashRouter>
  );
}

function InnerRoutes() {
  return (
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
          <Route path="/knowledge" element={<KnowledgePage />} />
          <Route path="/integrations" element={<IntegrationsPage />} />
          <Route path="/orchestration" element={<OrchestrationPage />} />
          <Route path="/governance" element={<GovernancePage />} />
          <Route path="/lab" element={<LabPage />} />
          <Route path="/customers" element={<Customer360Page />} />
          <Route path="/inbox" element={<InboxPage />} />
          <Route path="/studio" element={<StudioPage />} />
          <Route path="/voice" element={<VoicePage />} />
          <Route path="/marketplace" element={<MarketplacePage />} />
          <Route path="/reports" element={<ReportsPage />} />
          <Route path="/experiments" element={<ExperimentsPage />} />
          <Route path="/lgpd" element={<LgpdPage />} />
          <Route path="/insights" element={<InsightsPage />} />
          <Route path="/partners" element={<PartnerPage />} />
          <Route path="/status" element={<StatusPage />} />
          <Route path="/api-docs" element={<ApiDocsPage />} />
          <Route path="/help" element={<HelpPage />} />
          <Route path="/mobile" element={<MobilePage />} />
          <Route path="/billing" element={<BillingPage />} />
          <Route path="/onboarding" element={<OnboardingPage />} />
          <Route path="/notifications" element={<NotificationsPage />} />
          <Route path="/webhooks" element={<WebhooksPage />} />
          <Route path="/sandbox" element={<SandboxPage />} />
          <Route path="/activity" element={<ActivityPage />} />
          <Route path="/optimizer" element={<OptimizerPage />} />
          <Route path="/compliance" element={<CompliancePage />} />
          <Route path="/vault" element={<VaultPage />} />
    </Routes>
  );
}
