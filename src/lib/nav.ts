/**
 * Navegação central da plataforma — fonte única pro Sidebar e pro guard de rota.
 *
 * `client: true` marca itens que o cliente final enxerga. Sem a flag = admin-only
 * (Thribus Tech opera nos bastidores). Pra mudar o que o cliente vê, basta
 * ligar/desligar a flag aqui — Sidebar e App.tsx derivam desta config.
 */

import {
  LayoutGrid, Bot, Wrench, BarChart3, Terminal, Settings, Building2, Sparkles, Layout,
  Brain, Briefcase, Boxes, BookOpen, Plug, Network, Shield, FlaskConical, UserCircle2,
  Inbox, Blocks, Phone, Store, FileBarChart, TestTube2, ShieldCheck, Lightbulb, Handshake,
  Activity, Code2, BookMarked, Smartphone, CreditCard, Rocket, Bell, Webhook, Beaker,
  Radio, Gauge, FileCheck, Lock, UserCog, MessagesSquare, ListChecks, Clock,
  type LucideIcon,
} from 'lucide-react';

export interface NavItem {
  path: string;
  label: string;
  icon: LucideIcon;
  badge?: boolean;
  /** Visível pro cliente final. Ausente = admin-only (operador Thribus). */
  client?: boolean;
}

export interface NavGroup {
  group: string;
  items: NavItem[];
}

export const NAV_ITEMS: NavGroup[] = [
  {
    group: 'Principal',
    items: [
      { path: '/', label: 'Dashboard', icon: LayoutGrid, client: true },
      { path: '/onboarding', label: 'Onboarding', icon: Rocket, client: true },
      { path: '/agents', label: 'Colaboradores', icon: Bot, badge: true, client: true },
      { path: '/talk', label: 'Conversas', icon: MessagesSquare },
      { path: '/studio', label: 'Studio (no-code)', icon: Blocks },
      { path: '/tools', label: 'Ferramentas', icon: Wrench },
      { path: '/skills', label: 'Skills', icon: Sparkles },
      { path: '/templates', label: 'Templates', icon: Layout },
      { path: '/activity', label: 'Activity Feed', icon: Radio, client: true },
    ],
  },
  {
    group: 'Cérebro',
    items: [
      { path: '/knowledge', label: 'Knowledge Base', icon: BookOpen, client: true },
      { path: '/integrations', label: 'Integrações', icon: Plug },
      { path: '/orchestration', label: 'Orquestração', icon: Network },
    ],
  },
  {
    group: 'Operação',
    items: [
      { path: '/demands', label: 'Demandas do time', icon: ListChecks },
      { path: '/routines', label: 'Rotinas', icon: Clock },
      { path: '/inbox', label: 'Inbox Unificada', icon: Inbox, client: true },
      { path: '/customers', label: 'Customer 360', icon: UserCircle2, client: true },
      { path: '/voice', label: 'Canal de Voz', icon: Phone, client: true },
    ],
  },
  {
    group: 'Lab & Intel',
    items: [
      { path: '/lab', label: 'Agent Lab', icon: FlaskConical },
      { path: '/experiments', label: 'A/B Tests', icon: TestTube2 },
      { path: '/insights', label: 'Insights & VoC', icon: Lightbulb, client: true },
      { path: '/reports', label: 'Reports', icon: FileBarChart, client: true },
      { path: '/optimizer', label: 'AI Cost Optimizer', icon: Gauge },
    ],
  },
  {
    group: 'Growth',
    items: [
      { path: '/marketplace', label: 'Marketplace', icon: Store },
      { path: '/partners', label: 'Partner Portal', icon: Handshake },
      { path: '/billing', label: 'Billing (Stripe+Asaas)', icon: CreditCard, client: true },
      { path: '/sandbox', label: 'Sandbox / Trial', icon: Beaker },
    ],
  },
  {
    group: 'Plataforma',
    items: [
      { path: '/api-docs', label: 'API Reference', icon: Code2 },
      { path: '/webhooks', label: 'Webhooks Outbound', icon: Webhook },
      { path: '/mobile', label: 'Mobile / PWA', icon: Smartphone },
      { path: '/notifications', label: 'Notificações', icon: Bell, client: true },
      { path: '/status', label: 'Status', icon: Activity, client: true },
      { path: '/help', label: 'Help & Academy', icon: BookMarked, client: true },
    ],
  },
  {
    group: 'Cortex Brain',
    items: [
      { path: '/cortex-brain', label: 'Controle (modelo · uso)', icon: Gauge },
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
      { path: '/access', label: 'Acessos', icon: UserCog },
      { path: '/settings', label: 'Configurações', icon: Settings },
      { path: '/clients', label: 'Workspaces', icon: Building2 },
    ],
  },
];

/** Paths que o cliente final pode acessar. `/profile` é sempre liberado (via menu). */
export const CLIENT_PATHS: ReadonlySet<string> = new Set<string>([
  ...NAV_ITEMS.flatMap((g) => g.items.filter((i) => i.client).map((i) => i.path)),
  '/profile',
]);

export function isClientVisiblePath(path: string): boolean {
  return CLIENT_PATHS.has(path);
}
