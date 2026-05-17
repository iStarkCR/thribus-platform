import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, ArrowRight, Command } from 'lucide-react';
import { clsx } from 'clsx';

interface CmdItem {
  id: string;
  group: string;
  label: string;
  href: string;
  shortcut?: string;
  hint?: string;
}

const ITEMS: CmdItem[] = [
  // Principal
  { id: 'dashboard', group: 'Principal', label: 'Dashboard', href: '/' },
  { id: 'agents', group: 'Principal', label: 'Colaboradores (Agentes)', href: '/agents' },
  { id: 'studio', group: 'Principal', label: 'Studio (no-code builder)', href: '/studio' },
  { id: 'tools', group: 'Principal', label: 'Ferramentas', href: '/tools' },
  { id: 'skills', group: 'Principal', label: 'Skills', href: '/skills' },
  { id: 'templates', group: 'Principal', label: 'Templates', href: '/templates' },
  // Cérebro
  { id: 'knowledge', group: 'Cérebro', label: 'Knowledge Base', href: '/knowledge' },
  { id: 'integrations', group: 'Cérebro', label: 'Integrações', href: '/integrations' },
  { id: 'orchestration', group: 'Cérebro', label: 'Orquestração', href: '/orchestration' },
  // Operação
  { id: 'inbox', group: 'Operação', label: 'Inbox Unificada', href: '/inbox', hint: 'WhatsApp/email/voz' },
  { id: 'customers', group: 'Operação', label: 'Customer 360', href: '/customers' },
  { id: 'voice', group: 'Operação', label: 'Canal de Voz', href: '/voice' },
  // Lab
  { id: 'lab', group: 'Lab', label: 'Agent Lab (Playground)', href: '/lab' },
  { id: 'experiments', group: 'Lab', label: 'A/B Tests', href: '/experiments' },
  { id: 'insights', group: 'Lab', label: 'Insights & VoC', href: '/insights' },
  { id: 'reports', group: 'Lab', label: 'Reports', href: '/reports' },
  { id: 'optimizer', group: 'Lab', label: 'AI Cost Optimizer', href: '/optimizer', hint: 'economia automática' },
  // Growth
  { id: 'marketplace', group: 'Growth', label: 'Marketplace', href: '/marketplace' },
  { id: 'partners', group: 'Growth', label: 'Partner Portal', href: '/partners' },
  { id: 'billing', group: 'Growth', label: 'Billing (Stripe+Asaas)', href: '/billing' },
  { id: 'sandbox', group: 'Growth', label: 'Sandbox / Trial', href: '/sandbox' },
  // Governança
  { id: 'governance', group: 'Governança', label: 'RBAC · Audit · SLA', href: '/governance' },
  { id: 'lgpd', group: 'Governança', label: 'LGPD Center', href: '/lgpd' },
  { id: 'compliance', group: 'Governança', label: 'Compliance Builder', href: '/compliance' },
  { id: 'vault', group: 'Governança', label: 'Vault & API Keys', href: '/vault' },
  // Plataforma
  { id: 'api-docs', group: 'Plataforma', label: 'API Reference', href: '/api-docs' },
  { id: 'webhooks', group: 'Plataforma', label: 'Webhooks Outbound', href: '/webhooks' },
  { id: 'mobile', group: 'Plataforma', label: 'Mobile / PWA', href: '/mobile' },
  { id: 'status', group: 'Plataforma', label: 'Status', href: '/status' },
  { id: 'help', group: 'Plataforma', label: 'Help & Academy', href: '/help' },
  { id: 'notifications', group: 'Plataforma', label: 'Notificações', href: '/notifications' },
  { id: 'activity', group: 'Plataforma', label: 'Activity Feed', href: '/activity' },
  { id: 'onboarding', group: 'Plataforma', label: 'Onboarding', href: '/onboarding' },
  // Cortex Brain
  { id: 'cortex', group: 'Cortex Brain', label: 'Cortex Admin', href: '/cortex' },
  { id: 'enterprise', group: 'Cortex Brain', label: 'Cortex Enterprise', href: '/enterprise' },
  { id: 'stack', group: 'Cortex Brain', label: 'Cortex Stack (M1-M3)', href: '/stack' },
  // Analytics & Sistema
  { id: 'analytics', group: 'Analytics', label: 'Métricas', href: '/analytics' },
  { id: 'logs', group: 'Analytics', label: 'Logs', href: '/logs' },
  { id: 'settings', group: 'Sistema', label: 'Configurações', href: '/settings' },
  { id: 'workspaces', group: 'Sistema', label: 'Workspaces', href: '/clients' },
];

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [cursor, setCursor] = useState(0);
  const nav = useNavigate();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setOpen((o) => !o);
      }
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    if (!query) return ITEMS;
    return ITEMS.filter((i) => i.label.toLowerCase().includes(query) || i.group.toLowerCase().includes(query) || i.hint?.toLowerCase().includes(query));
  }, [q]);

  useEffect(() => setCursor(0), [q]);

  const go = (href: string) => {
    nav(href);
    setOpen(false);
    setQ('');
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setCursor((c) => Math.min(c + 1, filtered.length - 1)); }
    if (e.key === 'ArrowUp') { e.preventDefault(); setCursor((c) => Math.max(c - 1, 0)); }
    if (e.key === 'Enter' && filtered[cursor]) { go(filtered[cursor].href); }
  };

  if (!open) return (
    <button
      onClick={() => setOpen(true)}
      className="fixed bottom-4 right-4 z-40 px-3 py-2 rounded-lg bg-surface-2 border border-default text-creme-mute hover:text-creme hover:border-hover text-[12px] font-semibold shadow-lg inline-flex items-center gap-1.5"
      title="Abrir command palette (⌘K)"
    >
      <Command size={12} /> K
    </button>
  );

  // Agrupa filtrados por group preservando ordem
  const groups: { name: string; items: CmdItem[] }[] = [];
  for (const item of filtered) {
    let g = groups.find((x) => x.name === item.group);
    if (!g) { g = { name: item.group, items: [] }; groups.push(g); }
    g.items.push(item);
  }

  let runningIdx = 0;
  return (
    <div className="fixed inset-0 z-[200] flex items-start justify-center pt-[10vh] bg-black/40 backdrop-blur-sm" onClick={() => setOpen(false)}>
      <div className="w-[560px] max-w-[92vw] bg-surface-1 border border-default rounded-xl shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 px-4 py-3 border-b border-default">
          <Search size={14} className="text-creme-faint" />
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={onKey}
            placeholder="Pular pra qualquer página · digite e Enter"
            className="flex-1 bg-transparent text-[14px] text-creme placeholder-creme-faint focus:outline-none"
          />
          <code className="text-[10px] font-mono px-1.5 py-px rounded bg-surface-3 text-creme-faint">esc</code>
        </div>
        <div className="max-h-[480px] overflow-y-auto p-2">
          {filtered.length === 0 ? (
            <div className="p-6 text-center text-[12.5px] text-creme-faint">Nenhum resultado pra "{q}"</div>
          ) : groups.map((g) => (
            <div key={g.name} className="mb-2">
              <div className="text-[10px] uppercase tracking-wider font-bold text-creme-faint px-2 py-1">{g.name}</div>
              {g.items.map((item) => {
                const isCursor = runningIdx === cursor;
                runningIdx++;
                return (
                  <button
                    key={item.id}
                    onClick={() => go(item.href)}
                    onMouseEnter={() => setCursor(filtered.indexOf(item))}
                    className={clsx(
                      'w-full text-left p-2 rounded-md flex items-center gap-2 transition-colors',
                      isCursor ? 'bg-brand/15 text-brand-bright' : 'text-creme-mute hover:bg-surface-hover',
                    )}
                  >
                    <span className="text-[13px] font-semibold flex-1">{item.label}</span>
                    {item.hint && <span className="text-[10.5px] font-mono text-creme-faint">{item.hint}</span>}
                    <ArrowRight size={11} className="text-creme-faint" />
                  </button>
                );
              })}
            </div>
          ))}
        </div>
        <div className="px-4 py-2 border-t border-default text-[10.5px] font-mono text-creme-faint flex items-center gap-3">
          <span>↑↓ navegar</span><span>↵ abrir</span><span>esc fechar</span>
          <span className="ml-auto">⌘K toggle</span>
        </div>
      </div>
    </div>
  );
}
