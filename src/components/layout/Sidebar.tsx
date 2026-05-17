import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { clsx } from 'clsx';
import {
  LayoutGrid, Bot, Wrench, BarChart3,
  Terminal, Settings, Building2, ChevronRight, Zap, Sparkles, Layout, Brain, Briefcase, Boxes,
  BookOpen, Plug, Network, Shield,
  FlaskConical, UserCircle2, Inbox, Blocks, Phone, Store, FileBarChart, TestTube2,
  ShieldCheck, Lightbulb, Handshake, Activity, Code2, BookMarked, Smartphone,
  CreditCard, Rocket, Bell, Webhook, Beaker, Radio, Gauge, FileCheck, Lock,
  LogOut, User, Moon, HelpCircle,
} from 'lucide-react';
import { useAppStore } from '@/hooks/useAppStore';

const NAV_ITEMS = [
  {
    group: 'Principal',
    items: [
      { path: '/', label: 'Dashboard', icon: LayoutGrid },
      { path: '/onboarding', label: 'Onboarding', icon: Rocket },
      { path: '/agents', label: 'Colaboradores', icon: Bot, badge: true },
      { path: '/studio', label: 'Studio (no-code)', icon: Blocks },
      { path: '/tools', label: 'Ferramentas', icon: Wrench },
      { path: '/skills', label: 'Skills', icon: Sparkles },
      { path: '/templates', label: 'Templates', icon: Layout },
      { path: '/activity', label: 'Activity Feed', icon: Radio },
    ],
  },
  {
    group: 'Cérebro',
    items: [
      { path: '/knowledge', label: 'Knowledge Base', icon: BookOpen },
      { path: '/integrations', label: 'Integrações', icon: Plug },
      { path: '/orchestration', label: 'Orquestração', icon: Network },
    ],
  },
  {
    group: 'Operação',
    items: [
      { path: '/inbox', label: 'Inbox Unificada', icon: Inbox },
      { path: '/customers', label: 'Customer 360', icon: UserCircle2 },
      { path: '/voice', label: 'Canal de Voz', icon: Phone },
    ],
  },
  {
    group: 'Lab & Intel',
    items: [
      { path: '/lab', label: 'Agent Lab', icon: FlaskConical },
      { path: '/experiments', label: 'A/B Tests', icon: TestTube2 },
      { path: '/insights', label: 'Insights & VoC', icon: Lightbulb },
      { path: '/reports', label: 'Reports', icon: FileBarChart },
      { path: '/optimizer', label: 'AI Cost Optimizer', icon: Gauge },
    ],
  },
  {
    group: 'Growth',
    items: [
      { path: '/marketplace', label: 'Marketplace', icon: Store },
      { path: '/partners', label: 'Partner Portal', icon: Handshake },
      { path: '/billing', label: 'Billing (Stripe+Asaas)', icon: CreditCard },
      { path: '/sandbox', label: 'Sandbox / Trial', icon: Beaker },
    ],
  },
  {
    group: 'Plataforma',
    items: [
      { path: '/api-docs', label: 'API Reference', icon: Code2 },
      { path: '/webhooks', label: 'Webhooks Outbound', icon: Webhook },
      { path: '/mobile', label: 'Mobile / PWA', icon: Smartphone },
      { path: '/notifications', label: 'Notificações', icon: Bell },
      { path: '/status', label: 'Status', icon: Activity },
      { path: '/help', label: 'Help & Academy', icon: BookMarked },
    ],
  },
  {
    group: 'Cortex Brain',
    items: [
      { path: '/cortex', label: 'Cortex Admin', icon: Brain },
      { path: '/enterprise', label: 'Enterprise', icon: Briefcase },
      { path: '/stack', label: 'Stack (M1-M3)', icon: Boxes },
    ],
  },
  {
    group: 'Governança',
    items: [
      { path: '/governance', label: 'RBAC · Audit · SLA', icon: Shield },
      { path: '/lgpd', label: 'LGPD Center', icon: ShieldCheck },
      { path: '/compliance', label: 'Compliance Builder', icon: FileCheck },
      { path: '/vault', label: 'Vault & API Keys', icon: Lock },
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

      {/* Footer — User menu */}
      <UserMenu />
    </aside>
  );
}

function UserMenu() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener('mousedown', onClick);
    return () => window.removeEventListener('mousedown', onClick);
  }, []);

  const go = (path: string) => { navigate(path); setOpen(false); };
  const logout = () => {
    // Mock: limpa estado e volta pro login
    setOpen(false);
    navigate('/login');
  };

  return (
    <div ref={ref} className="relative p-2.5 border-t border-default shrink-0">
      <button
        onClick={() => setOpen(!open)}
        className={clsx(
          'w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg transition-colors',
          open ? 'bg-surface-hover' : 'hover:bg-surface-hover',
        )}
      >
        <div className="w-[30px] h-[30px] rounded-full bg-gradient-to-br from-brand-dim to-brand border border-hover flex items-center justify-center text-[13px] font-bold text-creme shrink-0">
          CA
        </div>
        <div className="flex-1 min-w-0 text-left">
          <div className="text-xs font-semibold text-creme truncate">Charles Andrade</div>
          <div className="text-[12px] text-creme-faint">CEO · Thribus Tech</div>
        </div>
        <ChevronRight size={14} className={clsx('text-creme-faint shrink-0 transition-transform', open && '-rotate-90')} />
      </button>

      {open && (
        <div className="absolute left-2.5 right-2.5 bottom-[60px] bg-surface-1 border border-default rounded-lg shadow-2xl overflow-hidden z-50">
          <div className="px-3 py-2.5 border-b border-default">
            <div className="text-[12.5px] font-semibold text-creme truncate">Charles Andrade</div>
            <div className="text-[10.5px] font-mono text-creme-faint truncate">developer@thribus.com.br</div>
          </div>
          <MenuItem icon={<User size={13} />} label="Meu perfil" onClick={() => go('/profile')} />
          <MenuItem icon={<Bell size={13} />} label="Notificações" onClick={() => go('/notifications')} />
          <MenuItem icon={<Building2 size={13} />} label="Workspaces" onClick={() => go('/clients')} />
          <MenuItem icon={<Settings size={13} />} label="Configurações" onClick={() => go('/settings')} />
          <MenuItem icon={<Lock size={13} />} label="Vault & API Keys" onClick={() => go('/vault')} />
          <div className="border-t border-default" />
          <MenuItem icon={<HelpCircle size={13} />} label="Ajuda & Academy" onClick={() => go('/help')} />
          <MenuItem icon={<Moon size={13} />} label="Tema (escuro)" subtitle="ativo" onClick={() => { /* noop */ }} />
          <div className="border-t border-default" />
          <MenuItem icon={<LogOut size={13} />} label="Sair" danger onClick={logout} />
        </div>
      )}
    </div>
  );
}

function MenuItem({ icon, label, subtitle, danger, onClick }: { icon: React.ReactNode; label: string; subtitle?: string; danger?: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={clsx(
        'w-full flex items-center gap-2.5 px-3 py-2 text-[12.5px] font-medium transition-colors',
        danger ? 'text-semantic-red hover:bg-semantic-red/10' : 'text-creme-mute hover:text-creme hover:bg-surface-hover',
      )}
    >
      <span className={clsx('shrink-0', danger ? 'text-semantic-red' : 'text-creme-faint')}>{icon}</span>
      <span className="flex-1 text-left">{label}</span>
      {subtitle && <span className="text-[10px] font-mono text-creme-faint">{subtitle}</span>}
    </button>
  );
}
