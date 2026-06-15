import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { clsx } from 'clsx';
import {
  ChevronRight, Zap, Settings, Building2, Bell, Lock,
  LogOut, User, Moon, HelpCircle,
} from 'lucide-react';
import { useAppStore } from '@/hooks/useAppStore';
import { useSession } from '@/hooks/useSession';
import { useAccess } from '@/hooks/useRole';
import { NAV_ITEMS } from '@/lib/nav';
import { WorkspaceSwitcher } from './WorkspaceSwitcher';

export function Sidebar() {
  const location = useLocation();
  const navigate = useNavigate();
  const agents = useAppStore((s) => s.agents);
  const { allowedPaths } = useAccess();

  // allowedPaths null = admin (vê tudo). Caso contrário filtra pelos grants do
  // usuário; grupos que ficam vazios somem.
  const groups = NAV_ITEMS
    .map((g) => ({ ...g, items: allowedPaths ? g.items.filter((i) => allowedPaths.has(i.path)) : g.items }))
    .filter((g) => g.items.length > 0);

  return (
    <aside className="fixed left-0 top-0 bottom-0 w-[244px] bg-surface-1 border-r border-default flex flex-col z-50">
      {/* Brand + sino */}
      <div className="h-14 px-3 flex items-center gap-2.5 border-b border-default shrink-0">
        <div className="w-[30px] h-[30px] rounded-lg bg-gradient-to-br from-brand-dim to-brand flex items-center justify-center shrink-0">
          <Zap size={14} className="text-white" />
        </div>
        <div className="flex flex-col flex-1 min-w-0">
          <span className="text-[15px] font-bold text-creme leading-tight tracking-tight truncate">Thribus Tech</span>
          <span className="text-[11.5px] font-semibold text-brand uppercase tracking-wider leading-tight truncate">Colaboradores Digitais</span>
        </div>
        <NotifBell onClick={() => navigate('/notifications')} />
      </div>

      {/* Seletor de conta (Talki-style) */}
      <WorkspaceSwitcher />

      {/* Nav */}
      <nav className="flex-1 p-2.5 overflow-y-auto">
        {groups.map((group) => (
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

  const { user, signOut, configured } = useSession();
  const displayName = (user?.user_metadata?.name as string | undefined) ?? user?.email?.split('@')[0] ?? 'Charles Andrade';
  const displayEmail = user?.email ?? 'developer@thribus.com.br';
  const role = (user?.user_metadata?.role as string | undefined) ?? 'CEO · Thribus Tech';
  const initials = displayName.split(' ').map((n: string) => n[0]).slice(0, 2).join('').toUpperCase();

  const go = (path: string) => { navigate(path); setOpen(false); };
  const logout = async () => {
    setOpen(false);
    if (configured) await signOut();
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
          {initials}
        </div>
        <div className="flex-1 min-w-0 text-left">
          <div className="text-xs font-semibold text-creme truncate">{displayName}</div>
          <div className="text-[12px] text-creme-faint truncate">{role}</div>
        </div>
        <ChevronRight size={14} className={clsx('text-creme-faint shrink-0 transition-transform', open && '-rotate-90')} />
      </button>

      {open && (
        <div className="absolute left-2.5 right-2.5 bottom-[60px] bg-surface-1 border border-default rounded-lg shadow-2xl overflow-hidden z-50">
          <div className="px-3 py-2.5 border-b border-default">
            <div className="text-[12.5px] font-semibold text-creme truncate">{displayName}</div>
            <div className="text-[10.5px] font-mono text-creme-faint truncate">{displayEmail}</div>
          </div>
          <MenuItem icon={<User size={13} />} label="Meu perfil" onClick={() => go('/profile')} />
          <MenuItem icon={<Bell size={13} />} label="Notificações" onClick={() => go('/notifications')} />
          <MenuItem icon={<Building2 size={13} />} label="Workspaces" onClick={() => go('/clients')} />
          <MenuItem icon={<Settings size={13} />} label="Configurações" onClick={() => go('/settings')} />
          <MenuItem icon={<Lock size={13} />} label="Vault & API Keys" onClick={() => go('/vault')} />
          <div className="border-t border-default" />
          <MenuItem icon={<HelpCircle size={13} />} label="Ajuda & Academy" onClick={() => go('/help')} />
          <MenuItem icon={<Moon size={13} />} label="Aparência / Tema" onClick={() => go('/settings')} />
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

// ─── Sino de notificações (badge contador + realtime) ──────────────────────
function NotifBell({ onClick }: { onClick: () => void }) {
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    let mounted = true;
    import('@/services/notifications').then(async (mod) => {
      if (!mod.notificationsConfigured) return;
      try {
        const list = await mod.listNotifications('ws_texnet', 50);
        if (mounted) setUnread(list.filter((n) => !n.read).length);
        const unsub = mod.subscribeNotifications('ws_texnet', () => {
          if (mounted) setUnread((c) => c + 1);
        });
        return () => unsub();
      } catch {
        // silencioso — sem Supabase ou sem RLS adequada, badge fica 0
      }
    });
    return () => { mounted = false; };
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
