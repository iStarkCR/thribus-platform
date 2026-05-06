import { useLocation } from 'react-router-dom';
import { Search, Bell, Plus, Play } from 'lucide-react';

const PAGE_META: Record<string, { title: string; subtitle: string }> = {
  '/': { title: 'Dashboard', subtitle: 'Visão geral dos colaboradores digitais' },
  '/agents': { title: 'Colaboradores', subtitle: 'Gerencie todos os colaboradores digitais' },
  '/tools': { title: 'Ferramentas', subtitle: 'Gerencie as ferramentas disponíveis' },
  '/conversations': { title: 'Conversas', subtitle: 'Histórico de atendimentos' },
  '/analytics': { title: 'Analytics', subtitle: 'Métricas e performance' },
  '/logs': { title: 'Logs', subtitle: 'Histórico de execuções' },
  '/settings': { title: 'Configurações', subtitle: 'Configurações do sistema' },
  '/clients': { title: 'Clientes', subtitle: 'Gestão de clientes' },
};

interface HeaderProps {
  onNewAgent: () => void;
  onTestAgent: () => void;
}

export function Header({ onNewAgent, onTestAgent }: HeaderProps) {
  const location = useLocation();
  const meta = PAGE_META[location.pathname] || PAGE_META['/'];

  return (
    <header className="sticky top-0 z-40 h-14 px-7 bg-surface-0/[0.88] backdrop-blur-xl border-b border-default flex items-center justify-between">
      <div className="flex items-center gap-4">
        <span className="text-sm font-bold text-creme tracking-tight">{meta.title}</span>
        <span className="w-px h-4 bg-default" />
        <span className="text-xs text-creme-mute">{meta.subtitle}</span>
      </div>

      <div className="flex items-center gap-2">
        <button className="w-8 h-8 rounded-lg bg-surface-2 border border-default flex items-center justify-center text-creme-mute hover:text-creme hover:border-hover transition-all">
          <Search size={15} />
        </button>
        <button className="relative w-8 h-8 rounded-lg bg-surface-2 border border-default flex items-center justify-center text-creme-mute hover:text-creme hover:border-hover transition-all">
          <Bell size={15} />
          <span className="absolute top-1.5 right-1.5 w-[5px] h-[5px] rounded-full bg-semantic-red" />
        </button>

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
