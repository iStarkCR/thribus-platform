/**
 * Seed mock — Governança Enterprise (Fase 4).
 *
 * RBAC, audit log imutável, retention policy, cost analytics,
 * SLA targets e configuração de white-label.
 */

export type RoleName = 'admin' | 'supervisor' | 'operador' | 'auditor';

export interface Permission {
  resource: 'agent' | 'workspace' | 'tool' | 'knowledge' | 'workflow' | 'billing' | 'audit' | 'settings';
  actions: ('read' | 'write' | 'delete' | 'execute' | 'approve')[];
}

export interface Role {
  name: RoleName;
  label: string;
  description: string;
  memberCount: number;
  permissions: Permission[];
}

export interface Member {
  id: string;
  name: string;
  email: string;
  role: RoleName;
  workspaceIds: string[];
  lastSeenAt: string;
  twoFactorEnabled: boolean;
  status: 'active' | 'invited' | 'suspended';
}

export type AuditAction =
  | 'agent.created'
  | 'agent.updated'
  | 'agent.deleted'
  | 'prompt.changed'
  | 'tool.executed'
  | 'tool.approved'
  | 'tool.rejected'
  | 'member.invited'
  | 'member.removed'
  | 'role.changed'
  | 'workspace.settings_changed'
  | 'export.requested'
  | 'export.completed';

export interface AuditEntry {
  id: string;
  actorName: string;
  actorEmail: string;
  action: AuditAction;
  resource: string;
  resourceId: string;
  workspaceId: string;
  ip: string;
  userAgent: string;
  diff?: string;
  timestamp: string;
}

export interface RetentionPolicy {
  id: string;
  workspaceId: string;
  conversationsDays: number;
  executionsDays: number;
  auditLogDays: number;
  knowledgeChunksDays: number | null;
  region: 'br-sa-east-1' | 'us-east-1' | 'eu-west-1';
  dataResidencyLocked: boolean;
}

export interface CostBreakdownItem {
  category: 'llm' | 'embeddings' | 'tools' | 'storage' | 'infra';
  label: string;
  amount: number;
  share: number;
  trend: number;
}

export interface AgentCost {
  agentId: string;
  agentName: string;
  workspaceId: string;
  conversations30d: number;
  tokens30d: number;
  llmCost: number;
  toolsCost: number;
  totalCost: number;
  revenueAttributed: number;
  roi: number;
}

export interface SLATarget {
  id: string;
  workspaceId: string;
  name: string;
  metric: 'first_response_seconds' | 'resolution_minutes' | 'uptime_pct' | 'csat';
  target: number;
  actual: number;
  status: 'meeting' | 'at_risk' | 'breached';
  period: 'daily' | 'weekly' | 'monthly';
}

export interface BrandingConfig {
  workspaceId: string;
  workspaceName: string;
  primaryColor: string;
  accentColor: string;
  logoUrl?: string;
  customDomain?: string;
  emailFromName: string;
  emailFromAddress: string;
  loginBackgroundUrl?: string;
  footerText: string;
}

export const SEED_ROLES: Role[] = [
  {
    name: 'admin',
    label: 'Admin',
    description: 'Acesso total — pode criar/deletar agentes, mexer em billing, gerenciar membros e ver audit log.',
    memberCount: 2,
    permissions: [
      { resource: 'agent', actions: ['read', 'write', 'delete', 'execute'] },
      { resource: 'workspace', actions: ['read', 'write', 'delete'] },
      { resource: 'tool', actions: ['read', 'write', 'delete', 'execute', 'approve'] },
      { resource: 'knowledge', actions: ['read', 'write', 'delete'] },
      { resource: 'workflow', actions: ['read', 'write', 'delete', 'execute'] },
      { resource: 'billing', actions: ['read', 'write'] },
      { resource: 'audit', actions: ['read'] },
      { resource: 'settings', actions: ['read', 'write'] },
    ],
  },
  {
    name: 'supervisor',
    label: 'Supervisor',
    description: 'Vê todos os workspaces atribuídos, aprova ações destrutivas, edita prompts e workflows. Sem acesso a billing.',
    memberCount: 5,
    permissions: [
      { resource: 'agent', actions: ['read', 'write', 'execute'] },
      { resource: 'workspace', actions: ['read'] },
      { resource: 'tool', actions: ['read', 'write', 'execute', 'approve'] },
      { resource: 'knowledge', actions: ['read', 'write'] },
      { resource: 'workflow', actions: ['read', 'write', 'execute'] },
      { resource: 'audit', actions: ['read'] },
      { resource: 'settings', actions: ['read'] },
    ],
  },
  {
    name: 'operador',
    label: 'Operador',
    description: 'Acesso só ao workspace dele. Pode rodar agentes, atender escalações. Não muda prompt, não aprova ação destrutiva.',
    memberCount: 12,
    permissions: [
      { resource: 'agent', actions: ['read', 'execute'] },
      { resource: 'tool', actions: ['read', 'execute'] },
      { resource: 'knowledge', actions: ['read'] },
      { resource: 'workflow', actions: ['read'] },
    ],
  },
  {
    name: 'auditor',
    label: 'Auditor',
    description: 'Read-only em tudo. Lê audit log, conversas, métricas — pra compliance, jurídico, financeiro do cliente.',
    memberCount: 3,
    permissions: [
      { resource: 'agent', actions: ['read'] },
      { resource: 'workspace', actions: ['read'] },
      { resource: 'tool', actions: ['read'] },
      { resource: 'knowledge', actions: ['read'] },
      { resource: 'workflow', actions: ['read'] },
      { resource: 'audit', actions: ['read'] },
      { resource: 'settings', actions: ['read'] },
    ],
  },
];

export const SEED_MEMBERS: Member[] = [
  { id: 'm_1', name: 'Charles Andrade', email: 'developer@thribus.com.br', role: 'admin', workspaceIds: ['ws_thribus', 'ws_texnet'], lastSeenAt: '2026-05-16T11:50:00Z', twoFactorEnabled: true, status: 'active' },
  { id: 'm_2', name: 'Marcia Lopes', email: 'marcia@texnet.com.br', role: 'supervisor', workspaceIds: ['ws_texnet'], lastSeenAt: '2026-05-16T10:42:00Z', twoFactorEnabled: true, status: 'active' },
  { id: 'm_3', name: 'João Mendes', email: 'joao@texnet.com.br', role: 'operador', workspaceIds: ['ws_texnet'], lastSeenAt: '2026-05-16T09:18:00Z', twoFactorEnabled: false, status: 'active' },
  { id: 'm_4', name: 'Patricia Reis', email: 'patricia@texnet.com.br', role: 'operador', workspaceIds: ['ws_texnet'], lastSeenAt: '2026-05-15T18:30:00Z', twoFactorEnabled: true, status: 'active' },
  { id: 'm_5', name: 'Ricardo Auditor', email: 'auditoria@texnet.com.br', role: 'auditor', workspaceIds: ['ws_texnet'], lastSeenAt: '2026-05-14T16:22:00Z', twoFactorEnabled: true, status: 'active' },
  { id: 'm_6', name: 'Felipe Costa', email: 'felipe@empresanova.com.br', role: 'supervisor', workspaceIds: ['ws_novo'], lastSeenAt: '2026-05-12T11:00:00Z', twoFactorEnabled: false, status: 'invited' },
  { id: 'm_7', name: 'Ana Carolina', email: 'ana@texnet.com.br', role: 'operador', workspaceIds: ['ws_texnet'], lastSeenAt: '2026-04-22T14:00:00Z', twoFactorEnabled: false, status: 'suspended' },
];

export const SEED_AUDIT: AuditEntry[] = [
  { id: 'au_1', actorName: 'Charles Andrade', actorEmail: 'developer@thribus.com.br', action: 'prompt.changed', resource: 'agent', resourceId: 'agent_bianca', workspaceId: 'ws_texnet', ip: '189.78.32.114', userAgent: 'Mac · Chrome 138', diff: '+ Adicionada instrução de não prometer prazo de instalação fora de janela útil', timestamp: '2026-05-16T11:42:00Z' },
  { id: 'au_2', actorName: 'Marcia Lopes', actorEmail: 'marcia@texnet.com.br', action: 'tool.approved', resource: 'tool_approval', resourceId: 'apr_3', workspaceId: 'ws_texnet', ip: '177.45.128.7', userAgent: 'Mac · Safari 18', timestamp: '2026-05-16T08:40:00Z' },
  { id: 'au_3', actorName: 'Charles Andrade', actorEmail: 'developer@thribus.com.br', action: 'workspace.settings_changed', resource: 'workspace', resourceId: 'ws_texnet', workspaceId: 'ws_texnet', ip: '189.78.32.114', userAgent: 'Mac · Chrome 138', diff: 'router_config.enabled: false → true', timestamp: '2026-05-15T19:12:00Z' },
  { id: 'au_4', actorName: 'Marcia Lopes', actorEmail: 'marcia@texnet.com.br', action: 'tool.rejected', resource: 'tool_approval', resourceId: 'apr_4', workspaceId: 'ws_texnet', ip: '177.45.128.7', userAgent: 'Mac · Safari 18', timestamp: '2026-05-15T18:15:00Z' },
  { id: 'au_5', actorName: 'Sistema (Auto-approve)', actorEmail: 'system@thribus.com.br', action: 'tool.executed', resource: 'tool_approval', resourceId: 'apr_5', workspaceId: 'ws_texnet', ip: 'internal', userAgent: 'worker-v3.2.1', timestamp: '2026-05-15T14:33:00Z' },
  { id: 'au_6', actorName: 'Charles Andrade', actorEmail: 'developer@thribus.com.br', action: 'agent.created', resource: 'agent', resourceId: 'agent_carla', workspaceId: 'ws_texnet', ip: '189.78.32.114', userAgent: 'Mac · Chrome 138', diff: '+ Carla (Retenção) criada', timestamp: '2026-05-14T22:00:00Z' },
  { id: 'au_7', actorName: 'Ricardo Auditor', actorEmail: 'auditoria@texnet.com.br', action: 'export.requested', resource: 'audit_log', resourceId: 'ws_texnet:2026-04', workspaceId: 'ws_texnet', ip: '177.45.10.22', userAgent: 'Win · Firefox 132', timestamp: '2026-05-14T16:22:00Z' },
  { id: 'au_8', actorName: 'Charles Andrade', actorEmail: 'developer@thribus.com.br', action: 'member.invited', resource: 'member', resourceId: 'm_6', workspaceId: 'ws_novo', ip: '189.78.32.114', userAgent: 'Mac · Chrome 138', timestamp: '2026-05-12T11:00:00Z' },
];

export const SEED_RETENTION: RetentionPolicy[] = [
  { id: 'rt_1', workspaceId: 'ws_texnet', conversationsDays: 365, executionsDays: 180, auditLogDays: 730, knowledgeChunksDays: null, region: 'br-sa-east-1', dataResidencyLocked: true },
  { id: 'rt_2', workspaceId: 'ws_thribus', conversationsDays: 90, executionsDays: 60, auditLogDays: 365, knowledgeChunksDays: null, region: 'br-sa-east-1', dataResidencyLocked: false },
];

export const SEED_COST_BREAKDOWN: CostBreakdownItem[] = [
  { category: 'llm', label: 'LLM (Anthropic + OpenAI)', amount: 2_412.80, share: 0.62, trend: -0.08 },
  { category: 'embeddings', label: 'Embeddings (RAG)', amount: 318.40, share: 0.082, trend: 0.22 },
  { category: 'tools', label: 'Tool executions (APIs externas)', amount: 184.20, share: 0.047, trend: 0.04 },
  { category: 'storage', label: 'Storage (Postgres + Vector)', amount: 92.10, share: 0.024, trend: 0.01 },
  { category: 'infra', label: 'Infra (VPS + Coolify)', amount: 880.00, share: 0.227, trend: 0 },
];

export const SEED_AGENT_COSTS: AgentCost[] = [
  { agentId: 'agent_bianca', agentName: 'Bianca', workspaceId: 'ws_texnet', conversations30d: 4_812, tokens30d: 18_412_300, llmCost: 1_124.80, toolsCost: 94.20, totalCost: 1_219.00, revenueAttributed: 87_400, roi: 70.7 },
  { agentId: 'agent_renata', agentName: 'Renata', workspaceId: 'ws_texnet', conversations30d: 8_211, tokens30d: 22_180_400, llmCost: 812.30, toolsCost: 71.40, totalCost: 883.70, revenueAttributed: 41_200, roi: 45.6 },
  { agentId: 'agent_marcos', agentName: 'Marcos', workspaceId: 'ws_texnet', conversations30d: 2_104, tokens30d: 6_440_100, llmCost: 318.60, toolsCost: 12.40, totalCost: 331.00, revenueAttributed: 28_900, roi: 86.3 },
  { agentId: 'agent_carla', agentName: 'Carla', workspaceId: 'ws_texnet', conversations30d: 318, tokens30d: 1_240_800, llmCost: 64.20, toolsCost: 4.10, totalCost: 68.30, revenueAttributed: 22_400, roi: 327.0 },
];

export const SEED_SLA: SLATarget[] = [
  { id: 'sla_1', workspaceId: 'ws_texnet', name: 'Primeira resposta < 30s', metric: 'first_response_seconds', target: 30, actual: 12.4, status: 'meeting', period: 'daily' },
  { id: 'sla_2', workspaceId: 'ws_texnet', name: 'Resolução < 12min', metric: 'resolution_minutes', target: 12, actual: 9.8, status: 'meeting', period: 'daily' },
  { id: 'sla_3', workspaceId: 'ws_texnet', name: 'Uptime do worker > 99.5%', metric: 'uptime_pct', target: 99.5, actual: 98.7, status: 'at_risk', period: 'monthly' },
  { id: 'sla_4', workspaceId: 'ws_texnet', name: 'CSAT > 4.2', metric: 'csat', target: 4.2, actual: 3.9, status: 'breached', period: 'weekly' },
];

export const SEED_BRANDING: BrandingConfig[] = [
  { workspaceId: 'ws_texnet', workspaceName: 'TexNet', primaryColor: '#0066CC', accentColor: '#FF6F00', logoUrl: 'https://texnet.com.br/logo.svg', customDomain: 'agentes.texnet.com.br', emailFromName: 'Bianca · TexNet', emailFromAddress: 'bianca@texnet.com.br', footerText: 'TexNet Telecomunicações — CNPJ 00.000.000/0001-00' },
  { workspaceId: 'ws_thribus', workspaceName: 'Thribus Tech', primaryColor: '#6B8F5E', accentColor: '#D4C9A8', logoUrl: 'https://thribus.com.br/logo.svg', emailFromName: 'Thribus Tech', emailFromAddress: 'agentes@thribus.com.br', footerText: 'Thribus Tech — soluções corporativas + AI' },
];
