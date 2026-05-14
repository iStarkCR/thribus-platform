import { useLocation, useNavigate } from 'react-router-dom';
import { clsx } from 'clsx';
import {
  LayoutGrid, Bot, Wrench, BarChart3,
  Terminal, Settings, Building2, ChevronRight, Zap, Sparkles, Layout, Brain, Briefcase,
} from 'lucide-react';
import { useAppStore } from '@/hooks/useAppStore';

const NAV_ITEMS = [
  {
    group: 'Principal',
    items: [
      { path: '/', label: 'Dashboard', icon: LayoutGrid },
      { path: '/agents', label: 'Colaboradores', icon: Bot, badge: true },
      { path: '/tools', label: 'Ferramentas', icon: Wrench },
      { path: '/skills', label: 'Skills', icon: Sparkles },
      { path: '/templates', label: 'Templates', icon: Layout },
    ],
  },
  {
    group: 'Cortex Brain',
    items: [
      { path: '/cortex', label: 'Cortex Admin', icon: Brain },
      { path: '/enterprise', label: 'Enterprise', icon: Briefcase },
    ],
  },
  {
    group: 'Analytics',
    items: [
      { path: '/analytics', label: 'Métricas', icon: BarChart3 },
      { path: '/logs', label: 'Logs', icon: Terminal },
    ],
  },
  {
    group: 'Sistema',
    items: [
      { path: '/settings', label: 'Configurações', icon: Settings },
      { path: '/clients', label: 'Workspaces', icon: Building2 },
    ],
  },
];

export function Sidebar() {
  const location = useLocation();
  const navigate = useNavigate();
  const agents = useAppStore((s) => s.agents);

  return (
    <aside className="fixed left-0 top-0 bottom-0 w-[244px] bg-surface-1 border-r border-default flex flex-col z-50">
      {/* Brand */}
      <div className="h-14 px-5 flex items-center gap-2.5 border-b border-default shrink-0">
        <div className="w-[30px] h-[30px] rounded-lg bg-gradient-to-br from-brand-dim to-brand flex items-center justify-center shrink-0">
          <Zap size={14} className="text-white" />
        </div>
        <div className="flex flex-col">
          <span className="text-[15px] font-bold text-creme leading-tight tracking-tight">Thribus Tech</span>
          <span className="text-[11.5px] font-semibold text-brand uppercase tracking-wider leading-tight">Colaboradores Digitais</span>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 p-2.5 overflow-y-auto">
        {NAV_ITEMS.map((group) => (
          <div key={group.group} className="mb-5">
            <div className="text-[11.5px] font-bold uppercase tracking-widest text-creme-faint px-2.5 mb-1.5">
              {group.group}
            </div>
            {group.items.map((item) => {
              const isActive = location.pathname === item.path;
              const Icon = item.icon;
              return (
                <button
                  key={item.path}
                  onClick={() => navigate(item.path)}
                  className={clsx(
                    'w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-[15px] font-medium transition-all duration-150 relative',
                    isActive
                      ? 'bg-brand/10 text-brand-bright'
                      : 'text-creme-mute hover:bg-surface-hover hover:text-creme-dim',
                  )}
                >
                  {isActive && (
                    <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[2.5px] h-4 bg-brand rounded-r" />
                  )}
                  <Icon size={16} className={clsx('shrink-0', isActive ? 'opacity-100' : 'opacity-50')} />
                  {item.label}
                  {item.badge && (
                    <span className="ml-auto text-[12px] font-semibold font-mono bg-brand/10 text-brand px-1.5 py-px rounded-full">
                      {agents.filter((a) => a.status === 'online').length}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        ))}
      </nav>

      {/* Footer */}
      <div className="p-2.5 border-t border-default shrink-0">
        <div className="flex items-center gap-2.5 px-2.5 py-2 rounded-lg hover:bg-surface-hover transition-colors cursor-pointer">
          <div className="w-[30px] h-[30px] rounded-full bg-surface-4 border border-hover flex items-center justify-center text-[13px] font-bold text-creme-mute shrink-0">
            CA
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-xs font-semibold text-creme truncate">Charles Andrade</div>
            <div className="text-[12px] text-creme-faint">CEO · Thribus Tech</div>
          </div>
          <ChevronRight size={14} className="text-creme-faint shrink-0" />
        </div>
      </div>
    </aside>
  );
}
