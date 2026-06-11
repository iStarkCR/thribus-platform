import { useEffect, useState } from 'react';
import {
  Shield, Users, FileLock, Clock, DollarSign, Target, Palette,
  CheckCircle2, AlertTriangle, XCircle, Lock, KeyRound, Search,
  TrendingUp, TrendingDown, Plus, Eye, CircleDot,
} from 'lucide-react';
import { clsx } from 'clsx';
import {
  SEED_ROLES, SEED_MEMBERS, SEED_AUDIT, SEED_RETENTION, SEED_COST_BREAKDOWN,
  SEED_AGENT_COSTS, SEED_SLA, SEED_BRANDING,
  type Member, type RoleName, type AuditEntry, type RetentionPolicy,
  type AgentCost, type SLATarget, type BrandingConfig,
} from '@/lib/seed-governance';
import * as governance from '@/services/governance';
import { fetchAgentCosts } from '@/services/cost';

type Tab = 'rbac' | 'audit' | 'retention' | 'cost' | 'sla' | 'branding';

const WORKSPACE_ID = 'ws_texnet';

export function GovernancePage() {
  const [tab, setTab] = useState<Tab>('rbac');
  const [members, setMembers] = useState<Member[]>(SEED_MEMBERS);
  const [audit, setAudit] = useState<AuditEntry[]>(SEED_AUDIT);
  const [retention, setRetention] = useState<RetentionPolicy[]>(SEED_RETENTION);
  const [sla, setSla] = useState<SLATarget[]>(SEED_SLA);
  const [branding, setBranding] = useState<BrandingConfig[]>(SEED_BRANDING);
  const [agentCosts, setAgentCosts] = useState<AgentCost[]>(SEED_AGENT_COSTS);
  const [source, setSource] = useState<'mock' | 'live'>('mock');

  useEffect(() => {
    if (!governance.governanceConfigured) return;
    Promise.allSettled([
      governance.listMembers(WORKSPACE_ID).then((rows) => {
        if (rows.length > 0) { setMembers(rows); setSource('live'); }
      }),
      governance.listAudit(WORKSPACE_ID).then((rows) => {
        if (rows.length > 0) { setAudit(rows); setSource('live'); }
      }),
      governance.listRetention().then((rows) => {
        if (rows.length > 0) setRetention(rows);
      }),
      governance.listSla(WORKSPACE_ID).then((rows) => {
        if (rows.length > 0) setSla(rows);
      }),
      governance.listBranding().then((rows) => {
        if (rows.length > 0) setBranding(rows);
      }),
      fetchAgentCosts(WORKSPACE_ID, 30).then((rows) => {
        if (rows.length > 0) {
          setAgentCosts(rows.map((r) => ({
            agentId: r.agentId, agentName: r.agentName, workspaceId: WORKSPACE_ID,
            conversations30d: r.conversations30d,
            tokens30d: r.tokensIn + r.tokensOut,
            llmCost: r.llmCost, toolsCost: 0, totalCost: r.llmCost,
            revenueAttributed: 0, roi: 0,
          })));
        }
      }),
    ]);
  }, []);

  return (
    <>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2 text-[15px] font-bold text-creme">
          <Shield size={16} className="text-creme-mute" /> Governança
          <span className="text-[12px] font-mono font-normal text-creme-faint ml-1">
            · RBAC · audit · retenção · custos · SLA · white-label
          </span>
          <span className={clsx(
            'ml-2 text-[10.5px] font-mono px-1.5 py-px rounded-full inline-flex items-center gap-1',
            source === 'live' ? 'bg-semantic-green/15 text-semantic-green' : 'bg-semantic-amber/15 text-semantic-amber',
          )}>
            <CircleDot size={9} className={source === 'live' ? 'animate-pulse' : ''} />
            {source === 'live' ? `live · ${members.length} membros · ${audit.length} eventos` : 'mock'}
          </span>
        </div>
      </div>

      <div className="flex items-center gap-1 mb-4 border-b border-default overflow-x-auto">
        <TabBtn active={tab === 'rbac'} onClick={() => setTab('rbac')} icon={<Users size={13} />} label="RBAC" />
        <TabBtn active={tab === 'audit'} onClick={() => setTab('audit')} icon={<FileLock size={13} />} label="Audit log" />
        <TabBtn active={tab === 'retention'} onClick={() => setTab('retention')} icon={<Clock size={13} />} label="Retenção" />
        <TabBtn active={tab === 'cost'} onClick={() => setTab('cost')} icon={<DollarSign size={13} />} label="Custos" />
        <TabBtn active={tab === 'sla'} onClick={() => setTab('sla')} icon={<Target size={13} />} label="SLA" />
        <TabBtn active={tab === 'branding'} onClick={() => setTab('branding')} icon={<Palette size={13} />} label="White-label" />
      </div>

      {tab === 'rbac' && <RbacPanel members={members} live={source === 'live'} />}
      {tab === 'audit' && <AuditPanel entries={audit} />}
      {tab === 'retention' && <RetentionPanel policies={retention} />}
      {tab === 'cost' && <CostPanel agentCosts={agentCosts} live={source === 'live'} />}
      {tab === 'sla' && <SlaPanel targets={sla} />}
      {tab === 'branding' && <BrandingPanel configs={branding} />}
    </>
  );
}

function TabBtn({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button
      onClick={onClick}
      className={clsx(
        'flex items-center gap-1.5 px-3 py-2 text-[13px] font-semibold transition-colors border-b-2 -mb-px shrink-0',
        active ? 'text-brand-bright border-brand' : 'text-creme-mute hover:text-creme border-transparent',
      )}
    >
      {icon} {label}
    </button>
  );
}

const ROLE_COLOR: Record<RoleName, string> = {
  admin: 'bg-semantic-red/15 text-semantic-red',
  supervisor: 'bg-brand/15 text-brand-bright',
  operador: 'bg-surface-3 text-creme-dim',
  auditor: 'bg-semantic-amber/15 text-semantic-amber',
};

function RbacPanel({ members, live }: { members: Member[]; live: boolean }) {
  const [search, setSearch] = useState('');
  const filtered = members.filter((m) =>
    !search.trim() ||
    m.name.toLowerCase().includes(search.toLowerCase()) ||
    m.email.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <>
      <div className="grid grid-cols-4 gap-2.5 mb-4">
        {SEED_ROLES.map((r) => {
          const count = live ? members.filter((m) => m.role === r.name).length : r.memberCount;
          return (
            <div key={r.name} className="bg-surface-2 border border-default rounded-[10px] p-3">
              <div className="flex items-center gap-2">
                <span className={clsx('px-2 py-0.5 rounded-md text-[11px] font-bold uppercase tracking-wider', ROLE_COLOR[r.name])}>
                  {r.label}
                </span>
                <span className="ml-auto text-[16px] font-bold font-mono text-creme">{count}</span>
              </div>
              <p className="text-[11.5px] text-creme-mute mt-2 leading-snug line-clamp-3">{r.description}</p>
              <div className="text-[10.5px] text-creme-faint mt-2 font-mono">
                {r.permissions.length} recurso{r.permissions.length !== 1 ? 's' : ''} · {r.permissions.reduce((s, p) => s + p.actions.length, 0)} permissões
              </div>
            </div>
          );
        })}
      </div>

      <div className="bg-surface-2 border border-default rounded-[10px] overflow-hidden">
        <div className="flex items-center justify-between p-3 border-b border-default">
          <h4 className="text-[13px] font-bold text-creme">Membros ({members.length})</h4>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-creme-faint" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar..."
                className="pl-7 pr-3 py-1 rounded-md bg-surface-1 border border-default text-[12.5px] text-creme placeholder-creme-faint focus:outline-none focus:border-brand w-[200px]"
              />
            </div>
            <button className="px-3 py-1 rounded-md text-[12px] font-semibold bg-brand-dim border border-brand text-creme hover:bg-brand transition-all flex items-center gap-1">
              <Plus size={11} /> Convidar
            </button>
          </div>
        </div>
        <div className="divide-y divide-default">
          {filtered.map((m) => (
            <div key={m.id} className="flex items-center gap-3 px-4 py-2.5 hover:bg-surface-hover/30 transition-colors">
              <div className="w-8 h-8 rounded-full bg-surface-3 border border-default flex items-center justify-center text-[12px] font-bold text-creme-mute shrink-0">
                {m.name.split(' ').map((n) => n[0]).slice(0, 2).join('')}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[13px] font-semibold text-creme truncate">{m.name}</div>
                <div className="text-[11px] text-creme-faint truncate font-mono">{m.email}</div>
              </div>
              <span className={clsx('px-2 py-0.5 rounded-md text-[10.5px] font-bold uppercase tracking-wider', ROLE_COLOR[m.role])}>
                {m.role}
              </span>
              <div className="text-[10.5px] text-creme-faint font-mono w-[120px] text-right">
                {m.status === 'invited' ? (
                  <span className="text-semantic-amber">convidado</span>
                ) : m.status === 'suspended' ? (
                  <span className="text-semantic-red">suspenso</span>
                ) : (
                  <>visto {new Date(m.lastSeenAt).toLocaleDateString('pt-BR')}</>
                )}
              </div>
              <div className="w-[28px] flex justify-center" title={m.twoFactorEnabled ? '2FA ativo' : '2FA não configurado'}>
                {m.twoFactorEnabled ? (
                  <Lock size={12} className="text-semantic-green" />
                ) : (
                  <KeyRound size={12} className="text-semantic-amber" />
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

function AuditPanel({ entries }: { entries: AuditEntry[] }) {
  const [search, setSearch] = useState('');
  const filtered = entries.filter((e) =>
    !search.trim() ||
    e.action.toLowerCase().includes(search.toLowerCase()) ||
    e.actorName.toLowerCase().includes(search.toLowerCase()) ||
    e.resourceId.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <>
      <div className="flex items-center gap-2 mb-3">
        <div className="relative flex-1 max-w-[360px]">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-creme-faint" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar ação, ator, recurso..."
            className="w-full pl-8 pr-3 py-1.5 rounded-lg bg-surface-2 border border-default text-[13px] text-creme placeholder-creme-faint focus:outline-none focus:border-brand"
          />
        </div>
        <button className="px-3 py-1.5 rounded-md text-[12.5px] font-semibold bg-surface-2 border border-default text-creme-mute hover:text-creme hover:border-hover transition-all flex items-center gap-1">
          <Eye size={11} /> Exportar CSV
        </button>
      </div>

      <div className="bg-surface-2 border border-default rounded-[10px] overflow-hidden">
        <div className="grid grid-cols-[180px_140px_1fr_120px_140px] gap-3 px-4 py-2 border-b border-default bg-surface-1/50 text-[10.5px] uppercase tracking-wider font-bold text-creme-faint">
          <div>Ator</div>
          <div>Ação</div>
          <div>Recurso / diff</div>
          <div>Origem</div>
          <div>Timestamp</div>
        </div>
        <div className="divide-y divide-default max-h-[60vh] overflow-y-auto">
          {filtered.map((e) => (
            <div key={e.id} className="grid grid-cols-[180px_140px_1fr_120px_140px] gap-3 px-4 py-2.5 text-[12px] hover:bg-surface-hover/30">
              <div className="min-w-0">
                <div className="text-creme font-semibold truncate">{e.actorName}</div>
                <div className="text-creme-faint font-mono text-[10.5px] truncate">{e.actorEmail}</div>
              </div>
              <code className="text-[11px] font-mono text-brand-bright truncate">{e.action}</code>
              <div className="min-w-0">
                <code className="text-[11px] font-mono text-creme-dim">{e.resource}/{e.resourceId}</code>
                {e.diff && <div className="text-[11px] text-creme-mute mt-0.5 line-clamp-1">{e.diff}</div>}
              </div>
              <div className="font-mono text-[10.5px] text-creme-faint truncate">{e.ip}</div>
              <div className="font-mono text-[10.5px] text-creme-faint">{new Date(e.timestamp).toLocaleString('pt-BR')}</div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

function RetentionPanel({ policies }: { policies: RetentionPolicy[] }) {
  return (
    <div className="space-y-3">
      {policies.map((r) => (
        <div key={r.id} className="bg-surface-2 border border-default rounded-[10px] p-4">
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-[14px] font-bold text-creme">Workspace <code className="font-mono text-brand-bright">{r.workspaceId}</code></h4>
            <div className="flex items-center gap-2">
              <span className="text-[10.5px] font-mono px-2 py-0.5 rounded-full bg-surface-3 text-creme-dim">
                {r.region}
              </span>
              {r.dataResidencyLocked && (
                <span className="text-[10.5px] font-mono px-2 py-0.5 rounded-full bg-semantic-green/15 text-semantic-green inline-flex items-center gap-1">
                  <Lock size={9} /> residência travada
                </span>
              )}
            </div>
          </div>

          <div className="grid grid-cols-4 gap-2.5">
            <RetentionItem label="Conversas" days={r.conversationsDays} />
            <RetentionItem label="Executions" days={r.executionsDays} />
            <RetentionItem label="Audit log" days={r.auditLogDays} />
            <RetentionItem label="Knowledge chunks" days={r.knowledgeChunksDays} />
          </div>
        </div>
      ))}

      <div className="bg-semantic-amber/5 border border-semantic-amber/20 rounded-[10px] p-3 text-[12px] text-creme-mute leading-relaxed">
        <AlertTriangle size={13} className="inline mr-1.5 text-semantic-amber" />
        Mudar retenção retroativamente apaga dados — irreversível. Mudanças requerem aprovação de admin + audit trail.
      </div>
    </div>
  );
}

function RetentionItem({ label, days }: { label: string; days: number | null }) {
  return (
    <div className="bg-surface-1 border border-default rounded-md p-2.5">
      <div className="text-[10.5px] uppercase tracking-wider font-bold text-creme-faint">{label}</div>
      <div className="text-[18px] font-bold font-mono text-creme mt-1">
        {days === null ? '∞' : days}
        {days !== null && <span className="text-[11px] text-creme-faint ml-1 font-sans">dias</span>}
      </div>
    </div>
  );
}

function CostPanel({ agentCosts, live }: { agentCosts: AgentCost[]; live: boolean }) {
  const total = SEED_COST_BREAKDOWN.reduce((s, i) => s + i.amount, 0);
  return (
    <>
      <div className="grid grid-cols-[1fr_320px] gap-3 mb-4">
        <div className="bg-surface-2 border border-default rounded-[10px] p-4">
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-[13px] font-bold text-creme">Breakdown mensal{live ? ' (estimativa)' : ''}</h4>
            <span className="text-[20px] font-bold font-mono text-creme">US$ {total.toFixed(2)}</span>
          </div>
          <div className="space-y-2">
            {SEED_COST_BREAKDOWN.map((c) => (
              <div key={c.category}>
                <div className="flex items-center justify-between text-[12px] mb-1">
                  <span className="text-creme-mute">{c.label}</span>
                  <span className="font-mono text-creme">US$ {c.amount.toFixed(2)}</span>
                </div>
                <div className="h-1.5 bg-surface-1 rounded-full overflow-hidden">
                  <div className="h-full bg-brand" style={{ width: `${c.share * 100}%` }} />
                </div>
                <div className="text-[10.5px] font-mono text-creme-faint mt-0.5 flex items-center gap-2">
                  {(c.share * 100).toFixed(1)}% do total
                  {c.trend !== 0 && (
                    <span className={clsx(
                      'inline-flex items-center gap-0.5',
                      c.trend > 0 ? 'text-semantic-red' : 'text-semantic-green',
                    )}>
                      {c.trend > 0 ? <TrendingUp size={9} /> : <TrendingDown size={9} />}
                      {(Math.abs(c.trend) * 100).toFixed(0)}%
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-surface-2 border border-default rounded-[10px] p-4">
          <h4 className="text-[13px] font-bold text-creme mb-2">ROI por agente</h4>
          <p className="text-[11.5px] text-creme-faint mb-3">Custo total vs. receita atribuível (30d)</p>
          <div className="space-y-3">
            {agentCosts.map((a) => (
              <div key={a.agentId}>
                <div className="flex items-center justify-between text-[12px]">
                  <span className="font-semibold text-creme">{a.agentName}</span>
                  <span className="font-mono text-brand-bright">{a.roi > 0 ? `${a.roi.toFixed(0)}×` : '—'}</span>
                </div>
                <div className="text-[10.5px] font-mono text-creme-faint mt-0.5">
                  custo US$ {a.totalCost.toFixed(2)}{a.revenueAttributed > 0 ? ` · receita R$ ${a.revenueAttributed.toLocaleString('pt-BR')}` : ' · receita não atribuída'}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="bg-surface-2 border border-default rounded-[10px] overflow-hidden">
        <div className="grid grid-cols-[1fr_120px_120px_120px_140px_100px] gap-3 px-4 py-2 border-b border-default text-[10.5px] uppercase tracking-wider font-bold text-creme-faint">
          <div>Agente</div>
          <div>Conversas</div>
          <div>Tokens</div>
          <div>Custo LLM</div>
          <div>Receita atrib.</div>
          <div className="text-right">ROI</div>
        </div>
        {agentCosts.map((a) => (
          <div key={a.agentId} className="grid grid-cols-[1fr_120px_120px_120px_140px_100px] gap-3 px-4 py-2.5 text-[12px] border-t border-default hover:bg-surface-hover/30">
            <div className="font-semibold text-creme">{a.agentName}</div>
            <div className="font-mono text-creme-dim">{a.conversations30d.toLocaleString('pt-BR')}</div>
            <div className="font-mono text-creme-dim">{(a.tokens30d / 1_000_000).toFixed(1)}M</div>
            <div className="font-mono text-creme-dim">US$ {a.llmCost.toFixed(2)}</div>
            <div className="font-mono text-creme-dim">{a.revenueAttributed > 0 ? `R$ ${a.revenueAttributed.toLocaleString('pt-BR')}` : '—'}</div>
            <div className="font-mono text-brand-bright text-right font-bold">{a.roi > 0 ? `${a.roi.toFixed(0)}×` : '—'}</div>
          </div>
        ))}
      </div>
    </>
  );
}

function SlaPanel({ targets }: { targets: SLATarget[] }) {
  return (
    <div className="grid grid-cols-2 gap-3">
      {targets.map((s) => {
        const meta = {
          meeting: { color: 'text-semantic-green', bg: 'bg-semantic-green/10 border-semantic-green/20', Icon: CheckCircle2 },
          at_risk: { color: 'text-semantic-amber', bg: 'bg-semantic-amber/10 border-semantic-amber/20', Icon: AlertTriangle },
          breached: { color: 'text-semantic-red', bg: 'bg-semantic-red/10 border-semantic-red/20', Icon: XCircle },
        }[s.status];
        const StatusIcon = meta.Icon;
        const ratio = s.metric === 'uptime_pct' || s.metric === 'csat'
          ? s.actual / s.target
          : s.target / Math.max(s.actual, 0.01);
        const pct = Math.min(Math.max(ratio, 0), 1.5) * 100;

        return (
          <div key={s.id} className={clsx('rounded-[10px] border p-4', meta.bg)}>
            <div className="flex items-start justify-between gap-2 mb-3">
              <div>
                <h4 className="text-[13.5px] font-bold text-creme">{s.name}</h4>
                <p className="text-[10.5px] uppercase tracking-wider text-creme-faint font-mono mt-0.5">{s.period}</p>
              </div>
              <span className={clsx('inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10.5px] font-bold', meta.color, 'bg-surface-1/70')}>
                <StatusIcon size={10} /> {s.status === 'meeting' ? 'meeting' : s.status === 'at_risk' ? 'em risco' : 'estourou'}
              </span>
            </div>

            <div className="flex items-baseline gap-2">
              <span className={clsx('text-[28px] font-bold font-mono', meta.color)}>{s.actual}</span>
              <span className="text-[12px] font-mono text-creme-faint">
                {s.metric === 'first_response_seconds' && 's'}
                {s.metric === 'resolution_minutes' && 'min'}
                {s.metric === 'uptime_pct' && '%'}
                {s.metric === 'csat' && '/5'}
              </span>
              <span className="ml-auto text-[11px] font-mono text-creme-faint">target: {s.target}</span>
            </div>

            <div className="h-1.5 bg-surface-1 rounded-full overflow-hidden mt-3">
              <div className={clsx('h-full', meta.color.replace('text-', 'bg-'))} style={{ width: `${Math.min(pct, 100)}%` }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function BrandingPanel({ configs }: { configs: BrandingConfig[] }) {
  return (
    <div className="space-y-3">
      {configs.map((b) => (
        <div key={b.workspaceId} className="bg-surface-2 border border-default rounded-[10px] p-4">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-12 h-12 rounded-lg border border-default flex items-center justify-center" style={{ backgroundColor: b.primaryColor }}>
              <Palette size={18} className="text-creme" />
            </div>
            <div className="flex-1">
              <h4 className="text-[14px] font-bold text-creme">{b.workspaceName}</h4>
              <code className="text-[11px] font-mono text-creme-faint">{b.workspaceId}</code>
            </div>
            {b.customDomain && (
              <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-brand/15 text-brand-bright">
                {b.customDomain}
              </span>
            )}
          </div>

          <div className="grid grid-cols-4 gap-3">
            <BrandField label="Cor primária" value={b.primaryColor} colorPreview />
            <BrandField label="Cor de destaque" value={b.accentColor} colorPreview />
            <BrandField label="Email FROM" value={b.emailFromAddress} />
            <BrandField label="Nome remetente" value={b.emailFromName} />
          </div>

          <div className="mt-3 pt-3 border-t border-default text-[11.5px] text-creme-mute">
            <span className="text-creme-faint font-mono text-[10.5px] uppercase tracking-wider mr-2">Footer:</span>
            {b.footerText}
          </div>
        </div>
      ))}
    </div>
  );
}

function BrandField({ label, value, colorPreview }: { label: string; value: string; colorPreview?: boolean }) {
  return (
    <div className="bg-surface-1 border border-default rounded-md p-2.5">
      <div className="text-[10.5px] uppercase tracking-wider font-bold text-creme-faint">{label}</div>
      <div className="flex items-center gap-1.5 mt-1.5">
        {colorPreview && (
          <span className="w-4 h-4 rounded border border-default shrink-0" style={{ backgroundColor: value }} />
        )}
        <code className="text-[12px] font-mono text-creme truncate">{value}</code>
      </div>
    </div>
  );
}
