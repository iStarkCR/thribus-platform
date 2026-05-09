import { useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Search, Bell, Plus, Play } from 'lucide-react';
import { useAppStore } from '@/hooks/useAppStore';
import { NotificationsDropdown } from './NotificationsDropdown';

const PAGE_META: Record<string, { title: string; subtitle: string }> = {
  '/': { title: 'Dashboard', subtitle: 'Visão geral dos colaboradores digitais' },
  '/agents': { title: 'Colaboradores', subtitle: 'Gerencie todos os colaboradores digitais' },
  '/tools': { title: 'Ferramentas', subtitle: 'Gerencie as ferramentas disponíveis' },
  '/skills': { title: 'Skills', subtitle: 'Catálogo de habilidades empacotadas (M3)' },
  '/analytics': { title: 'Métricas', subtitle: 'Performance e custo dos colaboradores' },
  '/logs': { title: 'Logs', subtitle: 'Histórico de execuções' },
  '/settings': { title: 'Configurações', subtitle: 'Configurações do sistema' },
  '/clients': { title: 'Workspaces', subtitle: 'Credenciais por cliente (multi-tenant)' },
};

interface HeaderProps {
  onNewAgent: () => void;
  onTestAgent: () => void;
}

export function Header({ onNewAgent, onTestAgent }: HeaderProps) {
  const location = useLocation();
  const meta = PAGE_META[location.pathname] || PAGE_META['/'];
  const { escalations, executions, addToast } = useAppStore();

  const [showNotifications, setShowNotifications] = useState(false);

  const failedCount = executions.filter((e) => e.status === 'failed').length;
  const totalAlerts = escalations.length + failedCount;

  const handleSearch = () => {
    addToast('Busca em desenvolvimento — use os filtros nas páginas por enquanto', 'blue');
  };

  return (
    <header className="sticky top-0 z-40 h-14 px-7 bg-surface-0/[0.88] backdrop-blur-xl border-b border-default flex items-center justify-between">
      <div className="flex items-center gap-4">
        <span className="text-sm font-bold text-creme tracking-tight">{meta.title}</span>
        <span className="w-px h-4 bg-default" />
        <span className="text-xs text-creme-mute">{meta.subtitle}</span>
      </div>

      <div className="flex items-center gap-2">
        <button
          onClick={handleSearch}
          className="w-8 h-8 rounded-lg bg-surface-2 border border-default flex items-center justify-center text-creme-mute hover:text-creme hover:border-hover transition-all"
          title="Buscar"
        >
          <Search size={15} />
        </button>

        <div className="relative">
          <button
            onClick={() => setShowNotifications((v) => !v)}
            className={`relative w-8 h-8 rounded-lg border flex items-center justify-center transition-all ${
              showNotifications
                ? 'bg-brand/10 border-brand text-brand-bright'
                : 'bg-surface-2 border-default text-creme-mute hover:text-creme hover:border-hover'
            }`}
            title="Lembretes"
          >
            <Bell size={15} />
            {totalAlerts > 0 && (
              <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-[16px] px-1 rounded-full bg-semantic-red text-[10.5px] font-bold font-mono text-white flex items-center justify-center">
                {totalAlerts > 9 ? '9+' : totalAlerts}
              </span>
            )}
          </button>
          {showNotifications && (
            <NotificationsDropdown onClose={() => setShowNotifications(false)} />
          )}
        </div>

        <button
          onClick={onNewAgent}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-surface-2 border border-default text-creme-dim hover:text-creme hover:border-hover hover:bg-surface-3 transition-all"
        >
          <Plus size={13} />
          Novo Colaborador
        </button>
        <button
          onClick={onTestAgent}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-brand-dim border border-brand text-creme hover:bg-brand hover:shadow-[0_0_16px_rgba(107,143,94,0.25)] transition-all"
        >
          <Play size={13} />
          Testar
        </button>
      </div>
    </header>
  );
}
