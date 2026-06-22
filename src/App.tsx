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
import { CortexBrainPage } from '@/pages/CortexBrainPage';
import { CortexSkillsPage } from '@/pages/CortexSkillsPage';
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
import { PayPage } from '@/pages/PayPage';
import { ProfilePage } from '@/pages/ProfilePage';
import { AccessPage } from '@/pages/AccessPage';
import { TalkPage } from '@/pages/TalkPage';
import { DemandsPage } from '@/pages/DemandsPage';
import { RoutinesPage } from '@/pages/RoutinesPage';
import { FloatingOrb } from '@/components/voice/FloatingOrb';
import { CommandPalette } from '@/components/shared/CommandPalette';
import { ToastContainer } from '@/components/shared/ToastContainer';
import { ConfirmDialog, PromptDialog } from '@/components/shared/Dialogs';
import { useAppStore } from '@/hooks/useAppStore';
import { useSession } from '@/hooks/useSession';
import { useAccess } from '@/hooks/useRole';
import { Navigate, useLocation, useParams } from 'react-router-dom';

// Permite forçar o id da cobrança (testes / futuro Worker). Opcional.
declare global {
  interface Window { __PAY_ID__?: string }
}

// No subdomínio pagamento.thribustech.com, o id da cobrança vem do path
// (URL limpa, sem hash): pagamento.thribustech.com/<chargeId>.
function resolvePayId(): string {
  if (typeof window === 'undefined') return '';
  if (window.__PAY_ID__) return window.__PAY_ID__;
  if (window.location.hostname.startsWith('pagamento.')) {
    const seg = window.location.pathname.split('/').filter(Boolean).pop() ?? '';
    return decodeURIComponent(seg);
  }
  return '';
}

export function App() {
  const initialize = useAppStore((s) => s.initialize);

  useEffect(() => {
    initialize();
  }, [initialize]);

  // Subdomínio de pagamento — renderiza o checkout direto, sem shell nem
  // login, e sem inicializar o painel.
  const payId = resolvePayId();
  if (payId) {
    return <PayPage chargeId={payId} />;
  }

  return (
    <HashRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        {/* Página de pagamento pública (sem login) — checkout Thribus sobre Asaas */}
        <Route path="/pay/:id" element={<PayRoute />} />
        <Route path="/*" element={
          <ProtectedShell />
        } />
      </Routes>
      <ToastContainer />
      <CommandPalette />
      <GlobalConfirm />
      <GlobalPrompt />
    </HashRouter>
  );
}

// Lê o :id da rota hash (#/pay/:id) e injeta no PayPage.
function PayRoute() {
  const { id = '' } = useParams();
  return <PayPage chargeId={id} />;
}

function ProtectedShell() {
  const { session, loading, configured } = useSession();

  // Loading: spinner mínimo
  if (loading) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-surface-1">
        <div className="text-creme-faint text-[12.5px] font-mono">Carregando…</div>
      </div>
    );
  }

  // Se Supabase configurado E sem sessão → redirect login
  // Sem Supabase configurado = modo demo, deixa entrar
  if (configured && !session) {
    return <Navigate to="/login" replace />;
  }

  return (
    <AppLayout>
      <RoleGuard>
        <InnerRoutes />
      </RoleGuard>
      <FloatingOrb />
    </AppLayout>
  );
}

// Confirmação global no padrão do sistema (substitui window.confirm).
function GlobalConfirm() {
  const req = useAppStore((s) => s.confirmRequest);
  const resolveConfirm = useAppStore((s) => s.resolveConfirm);
  if (!req) return null;
  return (
    <ConfirmDialog
      title={req.title}
      message={req.message}
      confirmLabel={req.confirmLabel ?? 'Confirmar'}
      danger={req.danger ?? true}
      onConfirm={() => resolveConfirm(true)}
      onClose={() => resolveConfirm(false)}
    />
  );
}

// Prompt global no padrão do sistema (substitui window.prompt).
function GlobalPrompt() {
  const req = useAppStore((s) => s.promptRequest);
  const resolvePrompt = useAppStore((s) => s.resolvePrompt);
  if (!req) return null;
  return (
    <PromptDialog
      title={req.title}
      label={req.label}
      placeholder={req.placeholder}
      initial={req.initial}
      confirmLabel={req.confirmLabel}
      onConfirm={(v) => resolvePrompt(v)}
      onClose={() => resolvePrompt(null)}
    />
  );
}

// Usuário sem acesso à rota (por URL direta) → volta pro Dashboard.
function RoleGuard({ children }: { children: React.ReactNode }) {
  const { allowedPaths, loading } = useAccess();
  const { pathname } = useLocation();
  if (!loading && allowedPaths && !allowedPaths.has(pathname)) {
    return <Navigate to="/" replace />;
  }
  return <>{children}</>;
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
          <Route path="/cortex-brain" element={<CortexBrainPage />} />
          <Route path="/cortex-skills" element={<CortexSkillsPage />} />
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
          <Route path="/profile" element={<ProfilePage />} />
          <Route path="/access" element={<AccessPage />} />
          <Route path="/talk" element={<TalkPage />} />
          <Route path="/demands" element={<DemandsPage />} />
          <Route path="/routines" element={<RoutinesPage />} />
    </Routes>
  );
}
