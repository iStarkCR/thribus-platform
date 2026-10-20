import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { clsx } from 'clsx';
import {
  ChevronRight, Settings, Building2, Bell, Lock,
  LogOut, User, Moon, Sun, HelpCircle, PanelLeftClose, PanelLeft, Sparkles, X,
} from 'lucide-react';
import { useAppStore } from '@/hooks/useAppStore';
import { useIsMobile } from '@/hooks/useIsMobile';
import { useGlass, useTheme } from '@/hooks/useTheme';
import { useSession } from '@/hooks/useSession';
import { useAccess } from '@/hooks/useRole';
import { NAV_ITEMS } from '@/lib/nav';
import { WorkspaceSwitcher } from './WorkspaceSwitcher';
import thribusMark from '@/assets/thribus-mark.svg';

export function Sidebar() {
  const location = useLocation();
  const navigate = useNavigate();
  const agents = useAppStore((s) => s.agents);
  const collapsedPref = useAppStore((s) => s.sidebarCollapsed);
  const setSidebarCollapsed = useAppStore((s) => s.setSidebarCollapsed);
  const mobileNavOpen = useAppStore((s) => s.mobileNavOpen);
  const setMobileNavOpen = useAppStore((s) => s.setMobileNavOpen);
  const isMobile = useIsMobile();
  // Em mobile o drawer é sempre EXPANDIDO (a preferência de recolher só vale no desktop).
  const collapsed = collapsedPref && !isMobile;
  const { allowedPaths } = useAccess();

  // allowedPaths null = admin (vê tudo). Caso contrário filtra pelos grants do
  // usuário; grupos que ficam vazios somem.
  const groups = NAV_ITEMS
    .map((g) => ({ ...g, items: allowedPaths ? g.items.filter((i) => allowedPaths.has(i.path)) : g.items }))
    .filter((g) => g.items.length > 0);

  // Seções colapsáveis — só as principais abertas por padrão (são ~45 itens).
  // Estado persistido; o grupo da rota ativa abre sempre.
  const DEFAULT_OPEN = ['Principal', 'Cérebro', 'Operação'];
  const [openGroups, setOpenGroups] = useState<Set<string>>(() => {
    try { const s = localStorage.getItem('thribus.navGroups'); if (s) return new Set<string>(JSON.parse(s)); } catch { /* noop */ }
    return new Set(DEFAULT_OPEN);
  });
  const toggleGroup = (g: string) => setOpenGroups((prev) => {
    const next = new Set(prev);
    if (next.has(g)) next.delete(g); else next.add(g);
    try { localStorage.setItem('thribus.navGroups', JSON.stringify([...next])); } catch { /* noop */ }
    return next;
  });

  return (
    <aside className={clsx(
      // Painel flutuante (estilo macOS): destacado das bordas no desktop, drawer cheio no mobile.
      'glass-strong fixed left-0 top-0 bottom-0 md:left-2.5 md:top-2.5 md:bottom-2.5 md:rounded-2xl bg-surface-1 border-r md:border border-default flex flex-col z-[60] overflow-hidden transition-[width,transform] duration-200',
      collapsed ? 'w-[64px]' : 'w-[244px]',
      // Drawer em mobile: desliza pra dentro quando aberto; no desktop fica sempre visível.
      mobileNavOpen ? 'translate-x-0 shadow-2xl md:shadow-none' : '-translate-x-full',
      'md:translate-x-0',
    )}>
      {/* Brand + sino + recolher */}
      <div className={clsx('h-14 flex items-center border-b border-default shrink-0', collapsed ? 'justify-center px-2' : 'px-3 gap-2.5')}>
        <img src={thribusMark} alt="Thribus" width={30} height={30} className="w-[30px] h-[30px] rounded-lg shrink-0" />
        {!collapsed && (
          <>
            {/* Nome em linha única (a tagline fica no tooltip — não cabe sem truncar ao lado do sino e do recolher). */}
            <div className="flex flex-col flex-1 min-w-0" title="Thribus Platform · Colaboradores Digitais">
              <span className="text-[14.5px] font-semibold text-creme leading-tight tracking-tight truncate">Thribus Platform</span>
            </div>
            <NotifBell onClick={() => navigate('/notifications')} />
            <button onClick={() => (isMobile ? setMobileNavOpen(false) : setSidebarCollapsed(true))} title={isMobile ? 'Fechar' : 'Recolher'} className="w-7 h-7 rounded-md text-creme-faint hover:text-creme hover:bg-surface-hover inline-flex items-center justify-center transition-colors">
              {isMobile ? <X size={16} /> : <PanelLeftClose size={15} />}
            </button>
          </>
        )}
      </div>

      {collapsed && (
        <button onClick={() => setSidebarCollapsed(false)} title="Expandir" className="mx-auto mt-2 w-9 h-9 rounded-lg text-creme-faint hover:text-creme hover:bg-surface-hover inline-flex items-center justify-center transition-colors">
          <PanelLeft size={16} />
        </button>
      )}

      {/* Seletor de conta (Talki-style) */}
      {!collapsed && <WorkspaceSwitcher />}

      {/* Nav */}
      <nav className="flex-1 p-2.5 overflow-y-auto">
        {groups.map((group) => {
          const hasActive = group.items.some((i) => i.path === location.pathname);
          const expanded = collapsed || openGroups.has(group.group) || hasActive;
          return (
          <div key={group.group} className={collapsed ? 'mb-2' : 'mb-1.5'}>
            {!collapsed && (
              <button
                onClick={() => toggleGroup(group.group)}
                className="w-full flex items-center gap-1 px-2 py-1.5 mb-0.5 rounded-md text-[11px] font-bold uppercase tracking-widest text-creme-mute hover:text-creme hover:bg-surface-hover/60 transition-colors"
              >
                <ChevronRight size={12} className={clsx('shrink-0 transition-transform', expanded && 'rotate-90')} />
                <span className="flex-1 text-left truncate">{group.group}</span>
                {!expanded && <span className="shrink-0 text-[10px] font-mono text-creme-faint/60">{group.items.length}</span>}
              </button>
            )}
            {expanded && group.items.map((item) => {
              const isActive = location.pathname === item.path;
              const Icon = item.icon;
              return (
                <button
                  key={item.path}
                  onClick={() => navigate(item.path)}
                  title={collapsed ? item.label : undefined}
                  className={clsx(
                    'w-full flex items-center py-2 rounded-[10px] text-[14px] font-medium transition-all duration-150 relative min-w-0',
                    collapsed ? 'justify-center px-0' : 'gap-2.5 px-2.5',
                    isActive
                      ? 'bg-brand/[0.14] text-creme font-semibold shadow-[inset_0_1px_0_rgb(255_255_255_/_0.06)]'
                      : 'text-creme-dim hover:bg-surface-hover hover:text-creme active:scale-[0.98]',
                  )}
                >
                  {isActive && (
                    <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 bg-brand-bright rounded-r-full" />
                  )}
                  <Icon size={17} className={clsx('shrink-0', isActive ? 'opacity-100 text-brand-bright' : 'opacity-70')} />
                  {!collapsed && <span className="truncate min-w-0 text-left">{item.label}</span>}
                  {!collapsed && item.badge && (
                    <span className="ml-auto shrink-0 text-[12px] font-semibold font-mono bg-brand/10 text-brand px-1.5 py-px rounded-full">
                      {agents.filter((a) => a.status === 'online').length}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
          );
        })}
      </nav>

      {/* Footer — User menu */}
      <UserMenu collapsed={collapsed} />
    </aside>
  );
}

function UserMenu({ collapsed }: { collapsed: boolean }) {
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

  const { user, signOut, configured } = useSession();
  const displayName = (user?.user_metadata?.name as string | undefined) ?? user?.email?.split('@')[0] ?? 'Charles Andrade';
  const displayEmail = user?.email ?? 'developer@thribus.com.br';
  const role = (user?.user_metadata?.role as string | undefined) ?? 'CEO · Thribus Tech';
  const initials = displayName.split(' ').map((n: string) => n[0]).slice(0, 2).join('').toUpperCase();

  const { glass, toggle: toggleGlass } = useGlass();
  const { theme, setTheme } = useTheme();
  const [showTheme, setShowTheme] = useState(false);
  const go = (path: string) => { navigate(path); setOpen(false); setShowTheme(false); };
  const logout = async () => {
    setOpen(false);
    if (configured) await signOut();
    navigate('/login');
  };

  return (
    <div ref={ref} className="relative p-2.5 border-t border-default shrink-0">
      <button
        onClick={() => setOpen(!open)}
        title={collapsed ? displayName : undefined}
        className={clsx(
          'w-full flex items-center py-2 rounded-lg transition-colors',
          collapsed ? 'justify-center px-0' : 'gap-2.5 px-2.5',
          open ? 'bg-surface-hover' : 'hover:bg-surface-hover',
        )}
      >
        <div className="w-[30px] h-[30px] rounded-full bg-gradient-to-br from-brand-dim to-brand border border-hover flex items-center justify-center text-[13px] font-bold text-creme shrink-0">
          {initials}
        </div>
        {!collapsed && (
          <>
            <div className="flex-1 min-w-0 text-left">
              <div className="text-xs font-semibold text-creme truncate">{displayName}</div>
              <div className="text-[12px] text-creme-faint truncate">{role}</div>
            </div>
            <ChevronRight size={14} className={clsx('text-creme-faint shrink-0 transition-transform', open && '-rotate-90')} />
          </>
        )}
      </button>

      {open && (
        <div
          className={clsx(
            'glass-strong absolute bg-surface-1 border border-default rounded-2xl shadow-2xl overflow-hidden z-50 py-1.5',
            // recolhido: flyout pra direita com largura fixa (não espreme nos 64px)
            collapsed ? 'left-full ml-2 bottom-2.5 w-72' : 'left-2 right-2 bottom-[64px]',
          )}
        >
          <div className="flex items-center gap-2.5 px-3.5 py-3 mb-1 border-b border-default">
            <div className="w-9 h-9 rounded-full bg-gradient-to-br from-brand-dim to-brand border border-hover flex items-center justify-center text-[13px] font-bold text-creme shrink-0">
              {initials}
            </div>
            <div className="min-w-0">
              <div className="text-[13.5px] font-bold text-creme truncate">{displayName}</div>
              <div className="text-[11px] font-mono text-creme-faint truncate">{displayEmail}</div>
            </div>
          </div>
          <MenuItem icon={<User size={16} />} label="Meu perfil" onClick={() => go('/profile')} />
          <MenuItem icon={<Bell size={16} />} label="Notificações" onClick={() => go('/notifications')} />
          <MenuItem icon={<Building2 size={16} />} label="Workspaces" onClick={() => go('/clients')} />
          <MenuItem icon={<Settings size={16} />} label="Configurações" onClick={() => go('/settings')} />
          <MenuItem icon={<Lock size={16} />} label="Vault & API Keys" onClick={() => go('/vault')} />
          <div className="border-t border-default my-1" />
          <MenuItem icon={<HelpCircle size={16} />} label="Ajuda & Academy" onClick={() => go('/help')} />
          <button
            onClick={() => setShowTheme((v) => !v)}
            className="w-full flex items-center gap-3 px-3.5 py-2.5 text-[13.5px] font-medium transition-colors text-creme-mute hover:text-creme hover:bg-surface-hover"
          >
            <span className="shrink-0 text-creme-faint">
              {theme === 'dark' ? <Moon size={16} /> : <Sun size={16} />}
            </span>
            <span className="flex-1 text-left">Aparência / Tema</span>
            <ChevronRight
              size={13}
              className={clsx('text-creme-faint shrink-0 transition-transform duration-150', showTheme && 'rotate-90')}
            />
          </button>
          {showTheme && (
            <div className="px-3.5 pb-2.5 flex gap-2">
              <button
                onClick={() => setTheme('light')}
                className={clsx(
                  'flex-1 flex flex-col items-center gap-1 py-2 rounded-lg text-[12px] font-medium transition-colors',
                  theme === 'light'
                    ? 'bg-brand/20 text-brand border border-brand/30'
                    : 'bg-surface-hover text-creme-mute hover:text-creme',
                )}
              >
                <Sun size={15} />
                <span>Claro</span>
              </button>
              <button
                onClick={() => setTheme('dark')}
                className={clsx(
                  'flex-1 flex flex-col items-center gap-1 py-2 rounded-lg text-[12px] font-medium transition-colors',
                  theme === 'dark'
                    ? 'bg-brand/20 text-brand border border-brand/30'
                    : 'bg-surface-hover text-creme-mute hover:text-creme',
                )}
              >
                <Moon size={15} />
                <span>Escuro</span>
              </button>
            </div>
          )}
          <MenuItem icon={<Sparkles size={16} />} label={glass ? 'Liquid Glass · ligado' : 'Liquid Glass'} onClick={() => toggleGlass()} />
          <div className="border-t border-default my-1" />
          <MenuItem icon={<LogOut size={16} />} label="Sair" danger onClick={logout} />
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
        'w-full flex items-center gap-3 px-3.5 py-2.5 text-[13.5px] font-medium transition-colors',
        danger ? 'text-semantic-red hover:bg-semantic-red/10' : 'text-creme-mute hover:text-creme hover:bg-surface-hover',
      )}
    >
      <span className={clsx('shrink-0', danger ? 'text-semantic-red' : 'text-creme-faint')}>{icon}</span>
      <span className="flex-1 text-left">{label}</span>
      {subtitle && <span className="text-[10px] font-mono text-creme-faint">{subtitle}</span>}
    </button>
  );
}

// ─── Sino de notificações (badge contador + realtime) ──────────────────────
function NotifBell({ onClick }: { onClick: () => void }) {
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    let mounted = true;
    let unsub: (() => void) | undefined;
    import('@/services/notifications').then(async (mod) => {
      if (!mod.notificationsConfigured || !mounted) return;
      try {
        const list = await mod.listNotifications('ws_texnet', 50);
        if (mounted) setUnread(list.filter((n) => !n.read).length);
        const u = mod.subscribeNotifications('ws_texnet', () => {
          if (mounted) setUnread((c) => c + 1);
        });
        // O cleanup do effect roda síncrono; guarda o unsub aqui. Se já desmontou
        // durante o await, encerra o canal na hora (senão vaza WebSocket órfão).
        if (mounted) unsub = u; else u();
      } catch {
        // silencioso — sem Supabase ou sem RLS adequada, badge fica 0
      }
    });
    return () => { mounted = false; unsub?.(); };
  }, []);

  return (
    <button
      onClick={onClick}
      className="relative w-8 h-8 rounded-md text-creme-mute hover:text-creme hover:bg-surface-hover inline-flex items-center justify-center transition-colors"
      title="Notificações"
    >
      <Bell size={14} />
      {unread > 0 && (
        <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-[16px] px-1 rounded-full bg-semantic-red text-[9.5px] font-bold font-mono text-creme flex items-center justify-center">
          {unread > 99 ? '99+' : unread}
        </span>
      )}
    </button>
  );
}
