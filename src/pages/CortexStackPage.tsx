/**
 * Cortex Stack — operação completa pós M1+M2+M3.
 * Tabs: Templates · Workflows · Aprovações · Webhooks · CRM · Tickets · Faturamento · KB · Auditoria · Integrações · White-label
 */

import { useEffect, useState } from 'react';
import { useAppStore } from '@/hooks/useAppStore';
import {
  Sparkles,
  GitBranch,
  Inbox,
  Webhook,
  TrendingUp,
  Headphones,
  Receipt,
  BookOpen,
  ClipboardList,
  Plug,
  Palette,
  Loader2,
  Plus,
  AlertCircle,
  CheckCircle2,
  X,
  RefreshCw,
  Download,
} from 'lucide-react';
import { clsx } from 'clsx';
import {
  cortexStack,
  type AgentTemplate,
  type Workflow,
  type OutgoingWebhook,
  type Approval,
  type Lead,
  type Deal,
  type Ticket,
  type Invoice,
  type KbDoc,
  type AuditEntry,
  type Integration,
  type WhiteLabel,
} from '@/services/cortexStack';

type Tab = 'templates' | 'workflows' | 'approvals' | 'webhooks' | 'crm' | 'tickets' | 'billing' | 'kb' | 'audit' | 'integrations' | 'white-label';

const TABS: Array<{ id: Tab; label: string; icon: typeof Sparkles; group: 'M1' | 'M2' | 'M3' }> = [
  { id: 'templates', label: 'Templates de Agente', icon: Sparkles, group: 'M1' },
  { id: 'workflows', label: 'Workflows', icon: GitBranch, group: 'M1' },
  { id: 'approvals', label: 'Aprovações', icon: Inbox, group: 'M1' },
  { id: 'webhooks', label: 'Webhooks', icon: Webhook, group: 'M1' },
  { id: 'crm', label: 'CRM / Pipeline', icon: TrendingUp, group: 'M2' },
  { id: 'tickets', label: 'Tickets', icon: Headphones, group: 'M2' },
  { id: 'billing', label: 'Faturamento BR', icon: Receipt, group: 'M2' },
  { id: 'kb', label: 'Knowledge Base', icon: BookOpen, group: 'M2' },
  { id: 'audit', label: 'Auditoria', icon: ClipboardList, group: 'M3' },
  { id: 'integrations', label: 'Integrações', icon: Plug, group: 'M3' },
  { id: 'white-label', label: 'White-label', icon: Palette, group: 'M3' },
];

const LS_API_KEY = 'cortex.playground.apiKey';
const LS_TENANT = 'cortex.enterprise.tenant_id';

export function CortexStackPage() {
  const [tab, setTab] = useState<Tab>('templates');
  const [tenantId, setTenantId] = useState(() => localStorage.getItem(LS_TENANT) ?? '');
  const [apiKey, setApiKey] = useState(() => localStorage.getItem(LS_API_KEY) ?? '');

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-extrabold text-creme tracking-tight">Cortex Stack</h1>
        <p className="text-sm text-creme-mute mt-1">
          Operação completa pós-evolução M1 + M2 + M3 — workflows, módulos B2B, governança.
        </p>
      </div>

      {/* Context bar */}
      <div className="rounded-xl border border-default bg-surface-1 p-3 grid grid-cols-2 gap-3">
        <label className="block">
          <span className="text-[10.5px] uppercase tracking-wider font-bold text-creme-faint">Tenant ID</span>
          <input
            value={tenantId}
            onChange={(e) => {
              setTenantId(e.target.value);
              localStorage.setItem(LS_TENANT, e.target.value);
            }}
            placeholder="uuid do tenant"
            className="mt-1 w-full px-2.5 py-1.5 rounded-lg bg-surface-3 border border-hover text-[12.5px] text-creme font-mono"
          />
        </label>
        <label className="block">
          <span className="text-[10.5px] uppercase tracking-wider font-bold text-creme-faint">API Key (pra módulos)</span>
          <input
            value={apiKey}
            onChange={(e) => {
              setApiKey(e.target.value);
              localStorage.setItem(LS_API_KEY, e.target.value);
            }}
            type="password"
            placeholder="ck_live_…"
            className="mt-1 w-full px-2.5 py-1.5 rounded-lg bg-surface-3 border border-hover text-[12.5px] text-creme font-mono"
          />
        </label>
      </div>

      {/* Tabs */}
      <div className="border-b border-default overflow-x-auto">
        <div className="flex gap-1 min-w-max">
          {(['M1', 'M2', 'M3'] as const).map((group) => (
            <div key={group} className="flex items-center gap-1 px-2">
              <span className="text-[10px] font-bold uppercase tracking-widest text-creme-faint opacity-50">{group}</span>
              {TABS.filter((t) => t.group === group).map((t) => {
                const Icon = t.icon;
                const active = tab === t.id;
                return (
                  <button
                    key={t.id}
                    onClick={() => setTab(t.id)}
                    className={clsx(
                      'px-3 py-2 text-[12.5px] font-semibold flex items-center gap-1.5 border-b-2 transition-colors -mb-px whitespace-nowrap',
                      active
                        ? 'text-brand-bright border-brand'
                        : 'text-creme-mute border-transparent hover:text-creme-dim',
                    )}
                  >
                    <Icon size={13} className={active ? 'opacity-100' : 'opacity-50'} />
                    {t.label}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      {/* Content */}
      <div>
        {tab === 'templates' && <TabTemplates tenantId={tenantId} />}
        {tab === 'workflows' && <TabWorkflows tenantId={tenantId} />}
        {tab === 'approvals' && <TabApprovals tenantId={tenantId} />}
        {tab === 'webhooks' && <TabWebhooks tenantId={tenantId} />}
        {tab === 'crm' && <TabCrm apiKey={apiKey} />}
        {tab === 'tickets' && <TabTickets apiKey={apiKey} />}
        {tab === 'billing' && <TabBilling apiKey={apiKey} />}
        {tab === 'kb' && <TabKb apiKey={apiKey} />}
        {tab === 'audit' && <TabAudit tenantId={tenantId} />}
        {tab === 'integrations' && <TabIntegrations tenantId={tenantId} />}
        {tab === 'white-label' && <TabWhiteLabel tenantId={tenantId} />}
      </div>
    </div>
  );
}

// ─── Tabs Implementations ──────────────────────────────────────────────────────

function TabTemplates({ tenantId }: { tenantId: string }) {
  const [list, setList] = useState<AgentTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const r = await cortexStack.listTemplates();
        setList(r.templates);
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function seed() {
    try {
      const r = await cortexStack.seedTemplates();
      useAppStore.getState().addToast(`Seed: ${r.inserted} novos, ${r.updated} atualizados`, 'green');
      const ls = await cortexStack.listTemplates();
      setList(ls.templates);
    } catch (e) {
      useAppStore.getState().addToast((e as Error).message, 'red');
    }
  }

  async function install(slug: string) {
    const store = useAppStore.getState();
    if (!tenantId) { store.addToast('Configure o tenant ID acima', 'amber'); return; }
    const agent_id = await store.askPrompt({ title: 'Instalar template', label: 'agent_id', placeholder: 'ex: bianca, custom1', confirmLabel: 'Instalar' });
    if (!agent_id) return;
    try {
      await cortexStack.installTemplate(slug, { tenant_id: tenantId, agent_id });
      store.addToast('Template instalado!', 'green');
    } catch (e) {
      store.addToast((e as Error).message, 'red');
    }
  }

  return (
    <Container>
      <Header
        title={`${list.length} templates oficiais por vertical`}
        actions={
          <button onClick={seed} className="px-3 py-1.5 rounded-lg bg-brand hover:bg-brand-bright text-bg font-bold text-[13px]">
            Seed DB
          </button>
        }
      />
      {loading && <CenterLoader />}
      {error && <ErrorMsg msg={error} />}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {list.map((t) => (
          <div key={t.slug} className="rounded-xl border border-default bg-surface-1 p-4 flex flex-col">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-lg bg-brand/10 text-brand-bright flex items-center justify-center font-bold text-[13.5px]">
                {t.name.slice(0, 2).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="font-extrabold text-creme text-[14px]">{t.name}</h3>
                  <span className="text-[10.5px] px-1.5 py-0.5 rounded bg-surface-3 text-creme-mute font-mono uppercase">{t.vertical}</span>
                </div>
                <p className="text-[12.5px] text-creme-mute mt-1 leading-relaxed">{t.description}</p>
                <div className="flex flex-wrap gap-1 mt-2">
                  {t.intents.slice(0, 4).map((i) => (
                    <span key={i} className="text-[10.5px] px-1.5 py-0.5 rounded bg-surface-3 text-creme-faint">{i}</span>
                  ))}
                  {t.intents.length > 4 && (
                    <span className="text-[10.5px] text-creme-faint px-1.5">+{t.intents.length - 4}</span>
                  )}
                </div>
              </div>
            </div>
            <div className="mt-3 flex justify-between items-center">
              <span className="text-[11.5px] text-creme-faint">
                {t.install_count != null && `${t.install_count} instalações`}
              </span>
              <button
                onClick={() => install(t.slug)}
                disabled={!tenantId}
                className="px-2.5 py-1 rounded-lg bg-brand/10 hover:bg-brand/20 text-brand-bright font-bold text-[12px] disabled:opacity-50 flex items-center gap-1"
              >
                <Plus size={11} /> Instalar
              </button>
            </div>
          </div>
        ))}
      </div>
    </Container>
  );
}

function TabWorkflows({ tenantId }: { tenantId: string }) {
  const [list, setList] = useState<Workflow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    if (!tenantId) return;
    setLoading(true);
    setError(null);
    try {
      const r = await cortexStack.listWorkflows(tenantId);
      setList(r.workflows);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { void refresh(); }, [tenantId]);

  async function createDemo() {
    if (!tenantId) return;
    try {
      await cortexStack.createWorkflow({
        tenant_id: tenantId,
        name: 'Demo: Notifica novo lead',
        description: 'Quando lead novo entra, manda email pro owner',
        trigger_type: 'event',
        trigger_config: { event: 'crm.lead.created' },
        steps: [
          { id: 's1', type: 'notify', config: { channel: 'in_app', title: 'Novo lead: {{trigger.lead.name}}' } },
        ],
      });
      await refresh();
    } catch (e) {
      useAppStore.getState().addToast((e as Error).message, 'red');
    }
  }

  if (!tenantId) return <NeedConfig field="tenant ID" />;
  return (
    <Container>
      <Header
        title={`${list.length} workflows`}
        actions={
          <button onClick={createDemo} className="px-3 py-1.5 rounded-lg bg-brand hover:bg-brand-bright text-bg font-bold text-[13px] flex items-center gap-1.5">
            <Plus size={13} /> Workflow demo
          </button>
        }
      />
      {error && <ErrorMsg msg={error} />}
      {loading ? <CenterLoader /> : (
        <Table headers={['Nome', 'Trigger', 'Steps', 'Status', 'Criado']}>
          {list.map((w) => (
            <tr key={w.id} className="hover:bg-surface-hover">
              <td className="px-5 py-3">
                <div className="font-bold text-creme text-[13.5px]">{w.name}</div>
                {w.description && <div className="text-[11.5px] text-creme-faint">{w.description}</div>}
              </td>
              <td className="px-3 py-3 text-[12.5px]"><Pill>{w.trigger_type}</Pill></td>
              <td className="px-3 py-3 text-[12.5px] text-creme-mute">{w.steps?.length ?? 0} passos</td>
              <td className="px-3 py-3">
                {w.enabled ? <Pill tone="success">ativo</Pill> : <Pill tone="muted">desabilitado</Pill>}
              </td>
              <td className="px-5 py-3 text-[11.5px] text-creme-faint">{new Date(w.created_at).toLocaleDateString('pt-BR')}</td>
            </tr>
          ))}
        </Table>
      )}
    </Container>
  );
}

function TabApprovals({ tenantId }: { tenantId: string }) {
  const [list, setList] = useState<Approval[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    if (!tenantId) return;
    setLoading(true);
    setError(null);
    try {
      const r = await cortexStack.listPendingApprovals(tenantId);
      setList(r.approvals);
    } catch (e) { setError((e as Error).message); }
    finally { setLoading(false); }
  }
  useEffect(() => { void refresh(); }, [tenantId]);

  if (!tenantId) return <NeedConfig field="tenant ID" />;
  return (
    <Container>
      <Header title={`${list.length} aprovações pendentes`} actions={
        <button onClick={refresh} className="px-2.5 py-1.5 rounded-lg bg-surface-3 hover:bg-surface-4 text-creme text-[12.5px] flex items-center gap-1.5">
          <RefreshCw size={12} /> Atualizar
        </button>
      } />
      {error && <ErrorMsg msg={error} />}
      {loading ? <CenterLoader /> : list.length === 0 ? (
        <EmptyState icon={CheckCircle2} text="Nenhuma aprovação pendente. Tudo limpo." />
      ) : (
        <Table headers={['Origem', 'Ação', 'Risco', 'Contexto', 'Criado']}>
          {list.map((a) => (
            <tr key={a.id} className="hover:bg-surface-hover">
              <td className="px-5 py-3 font-mono text-[11.5px] text-creme-mute">{a.source}</td>
              <td className="px-3 py-3 text-[13px] text-creme font-bold">{a.action_type}</td>
              <td className="px-3 py-3">
                <Pill tone={a.risk_level >= 4 ? 'danger' : a.risk_level >= 3 ? 'warn' : 'default'}>
                  L{a.risk_level}
                </Pill>
              </td>
              <td className="px-3 py-3 text-[12px] text-creme-mute max-w-[400px] truncate">{a.context}</td>
              <td className="px-5 py-3 text-[11.5px] text-creme-faint">{new Date(a.created_at).toLocaleString('pt-BR')}</td>
            </tr>
          ))}
        </Table>
      )}
    </Container>
  );
}

function TabWebhooks({ tenantId }: { tenantId: string }) {
  const [list, setList] = useState<OutgoingWebhook[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [secret, setSecret] = useState<string | null>(null);

  async function refresh() {
    if (!tenantId) return;
    setLoading(true);
    try {
      const r = await cortexStack.listWebhooks(tenantId);
      setList(r.webhooks);
    } catch (e) { setError((e as Error).message); }
    finally { setLoading(false); }
  }
  useEffect(() => { void refresh(); }, [tenantId]);

  async function create() {
    if (!tenantId || !name || !url) return;
    try {
      const r = await cortexStack.createWebhook({ tenant_id: tenantId, name, url });
      setSecret(r.secret);
      setName(''); setUrl('');
      await refresh();
    } catch (e) { useAppStore.getState().addToast((e as Error).message, 'red'); }
  }

  if (!tenantId) return <NeedConfig field="tenant ID" />;
  return (
    <Container>
      <Header title={`${list.length} webhooks configurados`} actions={
        <button onClick={() => setShowNew(!showNew)} className="px-3 py-1.5 rounded-lg bg-brand hover:bg-brand-bright text-bg font-bold text-[13px] flex items-center gap-1.5">
          <Plus size={13} /> Novo webhook
        </button>
      } />

      {showNew && (
        <div className="rounded-xl border border-default bg-surface-1 p-4 grid grid-cols-3 gap-2 items-end">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nome (ex: prod CRM)" className="px-3 py-2 rounded-lg bg-surface-3 border border-hover text-[13px] text-creme" />
          <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://..." className="col-span-1 px-3 py-2 rounded-lg bg-surface-3 border border-hover text-[13px] text-creme font-mono" />
          <button onClick={create} className="px-3 py-2 rounded-lg bg-brand text-bg font-bold text-[13px]">Criar</button>
        </div>
      )}

      {secret && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 flex items-start gap-2">
          <AlertCircle size={16} className="text-amber-200 mt-0.5 shrink-0" />
          <div className="flex-1">
            <div className="text-[12px] font-bold text-amber-200">Webhook secret — guarde AGORA:</div>
            <code className="block mt-1 px-2 py-1 rounded bg-bg font-mono text-[11.5px] text-creme break-all">{secret}</code>
          </div>
          <button onClick={() => setSecret(null)} className="text-amber-200 hover:text-amber-100"><X size={14} /></button>
        </div>
      )}

      {error && <ErrorMsg msg={error} />}
      {loading ? <CenterLoader /> : (
        <Table headers={['Nome', 'URL', 'Eventos', 'Status', 'Última entrega', 'Falhas']}>
          {list.map((w) => (
            <tr key={w.id} className="hover:bg-surface-hover">
              <td className="px-5 py-3 font-bold text-creme text-[13px]">{w.name}</td>
              <td className="px-3 py-3 font-mono text-[11.5px] text-creme-mute truncate max-w-[300px]">{w.url}</td>
              <td className="px-3 py-3 text-[11.5px] text-creme-mute">{w.events.join(', ')}</td>
              <td className="px-3 py-3">{w.enabled ? <Pill tone="success">ativo</Pill> : <Pill tone="muted">revogado</Pill>}</td>
              <td className="px-3 py-3 text-[11.5px] text-creme-faint">{w.last_success_at ? new Date(w.last_success_at).toLocaleString('pt-BR') : '—'}</td>
              <td className="px-3 py-3 text-[12px]">{w.consecutive_failures > 0 ? <span className="text-red-300 font-bold">{w.consecutive_failures}</span> : '0'}</td>
            </tr>
          ))}
        </Table>
      )}
    </Container>
  );
}

function TabCrm({ apiKey }: { apiKey: string }) {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [forecast, setForecast] = useState<{ total: number; total_weighted: number } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    if (!apiKey) return;
    setLoading(true);
    try {
      const [l, d, f] = await Promise.all([
        cortexStack.listLeads(apiKey),
        cortexStack.listDeals(apiKey),
        cortexStack.forecast(apiKey),
      ]);
      setLeads(l.leads);
      setDeals(d.deals);
      setForecast({ total: f.total, total_weighted: f.total_weighted });
    } catch (e) { setError((e as Error).message); }
    finally { setLoading(false); }
  }
  useEffect(() => { void refresh(); }, [apiKey]);

  if (!apiKey) return <NeedConfig field="API Key" />;

  const stages = ['lead', 'qualified', 'proposal', 'negotiation', 'won', 'lost'];
  return (
    <Container>
      {/* Forecast cards */}
      {forecast && (
        <div className="grid grid-cols-2 gap-3 mb-4">
          <StatCard label="Pipeline total" value={brl(forecast.total)} />
          <StatCard label="Forecast ponderado" value={brl(forecast.total_weighted)} tone="brand" />
        </div>
      )}

      {error && <ErrorMsg msg={error} />}
      {loading && <CenterLoader />}

      {/* Kanban */}
      <div className="grid grid-cols-6 gap-2 overflow-x-auto">
        {stages.map((stage) => {
          const stageDeals = deals.filter((d) => d.stage === stage);
          const stageValue = stageDeals.reduce((s, d) => s + Number(d.value || 0), 0);
          return (
            <div key={stage} className="rounded-xl border border-default bg-surface-1 p-2 min-w-[180px]">
              <div className="px-1.5 py-1 flex items-center justify-between mb-2">
                <div className="text-[11px] font-bold uppercase text-creme">{stage}</div>
                <div className="text-[10.5px] text-creme-faint">{stageDeals.length} · {brl(stageValue)}</div>
              </div>
              <div className="space-y-1.5">
                {stageDeals.map((d) => (
                  <div key={d.id} className="rounded-lg border border-default bg-surface-2 p-2">
                    <div className="text-[12px] font-bold text-creme truncate">{d.title}</div>
                    <div className="text-[10.5px] text-creme-mute mt-0.5">{brl(d.value)} · {d.probability}%</div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      <h3 className="text-[13px] font-bold uppercase tracking-wider text-creme-faint mt-5 mb-2">Leads recentes</h3>
      <Table headers={['Nome', 'Empresa', 'Email', 'Status', 'Fonte', 'Criado']}>
        {leads.slice(0, 20).map((l) => (
          <tr key={l.id} className="hover:bg-surface-hover">
            <td className="px-5 py-3 font-bold text-creme text-[13px]">{l.name}</td>
            <td className="px-3 py-3 text-[12.5px] text-creme-mute">{l.company ?? '—'}</td>
            <td className="px-3 py-3 text-[12px] text-creme-faint">{l.email ?? '—'}</td>
            <td className="px-3 py-3"><Pill>{l.status}</Pill></td>
            <td className="px-3 py-3 text-[11.5px] text-creme-faint">{l.source ?? '—'}</td>
            <td className="px-5 py-3 text-[11.5px] text-creme-faint">{new Date(l.created_at).toLocaleDateString('pt-BR')}</td>
          </tr>
        ))}
      </Table>
    </Container>
  );
}

function TabTickets({ apiKey }: { apiKey: string }) {
  const [list, setList] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!apiKey) return;
    setLoading(true);
    cortexStack.listTickets(apiKey)
      .then((r) => setList(r.tickets))
      .catch((e) => setError((e as Error).message))
      .finally(() => setLoading(false));
  }, [apiKey]);

  if (!apiKey) return <NeedConfig field="API Key" />;

  return (
    <Container>
      <Header title={`${list.length} tickets`} />
      {error && <ErrorMsg msg={error} />}
      {loading ? <CenterLoader /> : (
        <Table headers={['#', 'Assunto', 'Status', 'Prioridade', 'Cliente', 'Criado']}>
          {list.map((t) => (
            <tr key={t.id} className="hover:bg-surface-hover">
              <td className="px-5 py-3 font-mono text-[12px] text-creme-faint">#{t.number}</td>
              <td className="px-3 py-3 font-bold text-creme text-[13px] max-w-[300px] truncate">{t.subject}</td>
              <td className="px-3 py-3"><Pill tone={t.status === 'resolved' ? 'success' : 'default'}>{t.status}</Pill></td>
              <td className="px-3 py-3"><Pill tone={t.priority === 'urgent' ? 'danger' : t.priority === 'high' ? 'warn' : 'default'}>{t.priority}</Pill></td>
              <td className="px-3 py-3 text-[12.5px] text-creme-mute">{t.customer_name ?? '—'}</td>
              <td className="px-5 py-3 text-[11.5px] text-creme-faint">{new Date(t.created_at).toLocaleDateString('pt-BR')}</td>
            </tr>
          ))}
        </Table>
      )}
    </Container>
  );
}

function TabBilling({ apiKey }: { apiKey: string }) {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [metrics, setMetrics] = useState<{ to_receive: number; overdue: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!apiKey) return;
    Promise.all([
      cortexStack.listInvoices(apiKey),
      cortexStack.billingMetrics(apiKey),
    ]).then(([i, m]) => {
      setInvoices(i.invoices);
      setMetrics({ to_receive: m.to_receive, overdue: m.overdue });
    }).catch((e) => setError((e as Error).message));
  }, [apiKey]);

  if (!apiKey) return <NeedConfig field="API Key" />;

  return (
    <Container>
      {metrics && (
        <div className="grid grid-cols-2 gap-3 mb-4">
          <StatCard label="A receber" value={brl(metrics.to_receive)} />
          <StatCard label="Inadimplência" value={brl(metrics.overdue)} tone={metrics.overdue > 0 ? 'danger' : 'default'} />
        </div>
      )}
      {error && <ErrorMsg msg={error} />}
      <Table headers={['Cliente', 'Descrição', 'Valor', 'Vencimento', 'Status', 'Método']}>
        {invoices.map((i) => (
          <tr key={i.id} className="hover:bg-surface-hover">
            <td className="px-5 py-3 font-bold text-creme text-[13px]">{i.customer_name}</td>
            <td className="px-3 py-3 text-[12.5px] text-creme-mute max-w-[300px] truncate">{i.description}</td>
            <td className="px-3 py-3 font-mono text-[13px] text-creme">{brl(i.amount)}</td>
            <td className="px-3 py-3 text-[12px] text-creme-mute">{i.due_date}</td>
            <td className="px-3 py-3"><Pill tone={i.status === 'paid' ? 'success' : i.status === 'overdue' ? 'danger' : 'default'}>{i.status}</Pill></td>
            <td className="px-3 py-3 text-[12px] text-creme-faint">{i.payment_method ?? '—'}</td>
          </tr>
        ))}
      </Table>
    </Container>
  );
}

function TabKb({ apiKey }: { apiKey: string }) {
  const [docs, setDocs] = useState<KbDoc[]>([]);
  const [search, setSearch] = useState('');
  const [hits, setHits] = useState<Array<{ title: string; text: string; similarity: number }>>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!apiKey) return;
    cortexStack.listKbDocs(apiKey).then((r) => setDocs(r.docs)).catch((e) => setError((e as Error).message));
  }, [apiKey]);

  async function doSearch() {
    if (!search.trim()) return;
    try {
      const r = await cortexStack.searchKb(apiKey, search.trim());
      setHits(r.hits);
    } catch (e) { setError((e as Error).message); }
  }

  if (!apiKey) return <NeedConfig field="API Key" />;
  return (
    <Container>
      <div className="rounded-xl border border-default bg-surface-1 p-3 flex gap-2">
        <input value={search} onChange={(e) => setSearch(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && doSearch()} placeholder="Buscar (semântico) — pgvector..." className="flex-1 px-3 py-2 rounded-lg bg-surface-3 border border-hover text-[13px] text-creme" />
        <button onClick={doSearch} className="px-3 py-2 rounded-lg bg-brand text-bg font-bold text-[13px]">Buscar</button>
      </div>

      {error && <ErrorMsg msg={error} />}

      {hits.length > 0 && (
        <div className="rounded-xl border border-brand/30 bg-brand/5 p-4 space-y-2">
          <div className="text-[12px] font-bold text-brand-bright">Top {hits.length} resultados semânticos</div>
          {hits.map((h, i) => (
            <div key={i} className="text-[12.5px]">
              <span className="text-creme font-bold">{h.title}</span>
              <span className="text-creme-faint ml-2 font-mono">sim={h.similarity.toFixed(2)}</span>
              <div className="text-creme-mute mt-0.5 line-clamp-2">{h.text}</div>
            </div>
          ))}
        </div>
      )}

      <Table headers={['Título', 'Tags', 'Visibilidade', 'Versão', 'Views', 'Editado']}>
        {docs.map((d) => (
          <tr key={d.id} className="hover:bg-surface-hover">
            <td className="px-5 py-3 font-bold text-creme text-[13px]">{d.title}</td>
            <td className="px-3 py-3 text-[11.5px]">
              <div className="flex flex-wrap gap-1">
                {d.tags.map((t) => <span key={t} className="px-1.5 py-0.5 rounded bg-surface-3 text-creme-faint">{t}</span>)}
              </div>
            </td>
            <td className="px-3 py-3"><Pill>{d.visibility}</Pill></td>
            <td className="px-3 py-3 text-[12px] font-mono text-creme-faint">v{d.version}</td>
            <td className="px-3 py-3 text-[12px] text-creme-mute">{d.view_count}</td>
            <td className="px-3 py-3 text-[11.5px] text-creme-faint">{new Date(d.last_edited_at).toLocaleDateString('pt-BR')}</td>
          </tr>
        ))}
      </Table>
    </Container>
  );
}

function TabAudit({ tenantId }: { tenantId: string }) {
  const [list, setList] = useState<AuditEntry[]>([]);
  const [filters, setFilters] = useState({ agent: '', status: '', q: '' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function search() {
    if (!tenantId) return;
    setLoading(true);
    setError(null);
    try {
      const params: Record<string, string> = { tenant_id: tenantId };
      if (filters.agent) params.agent = filters.agent;
      if (filters.status) params.status = filters.status;
      if (filters.q) params.q = filters.q;
      const r = await cortexStack.searchAudit(params);
      setList(r.entries);
    } catch (e) { setError((e as Error).message); }
    finally { setLoading(false); }
  }

  useEffect(() => { void search(); }, [tenantId]);

  if (!tenantId) return <NeedConfig field="tenant ID" />;
  return (
    <Container>
      <div className="rounded-xl border border-default bg-surface-1 p-3 grid grid-cols-5 gap-2">
        <select value={filters.agent} onChange={(e) => setFilters({ ...filters, agent: e.target.value })} className="px-2.5 py-1.5 rounded-lg bg-surface-3 border border-hover text-[12.5px] text-creme">
          <option value="">Todos agentes</option>
          <option value="bianca">Bianca</option>
          <option value="renata">Renata</option>
          <option value="marcos">Marcos</option>
          <option value="carla">Carla</option>
        </select>
        <select value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })} className="px-2.5 py-1.5 rounded-lg bg-surface-3 border border-hover text-[12.5px] text-creme">
          <option value="">Todos status</option>
          <option value="ok">OK</option>
          <option value="error">Error</option>
          <option value="blocked">Blocked</option>
        </select>
        <input value={filters.q} onChange={(e) => setFilters({ ...filters, q: e.target.value })} placeholder="Texto..." className="col-span-2 px-2.5 py-1.5 rounded-lg bg-surface-3 border border-hover text-[12.5px] text-creme" />
        <div className="flex gap-1">
          <button onClick={search} className="flex-1 px-2.5 py-1.5 rounded-lg bg-brand text-bg font-bold text-[12.5px]">Buscar</button>
          <a href={cortexStack.auditExportUrl(tenantId)} target="_blank" rel="noopener" className="px-2 py-1.5 rounded-lg bg-surface-3 hover:bg-surface-4 text-creme flex items-center"><Download size={13} /></a>
        </div>
      </div>

      {error && <ErrorMsg msg={error} />}
      {loading ? <CenterLoader /> : (
        <Table headers={['Quando', 'Trace', 'Agente', 'Intent', 'Status', 'Latência', 'Custo', 'Input']}>
          {list.map((e) => (
            <tr key={e.id} className="hover:bg-surface-hover">
              <td className="px-5 py-2 text-[11.5px] text-creme-faint font-mono">{new Date(e.created_at).toLocaleTimeString('pt-BR')}</td>
              <td className="px-3 py-2 font-mono text-[10.5px] text-creme-faint">{e.trace_id.slice(0, 8)}</td>
              <td className="px-3 py-2 font-bold text-[12px] text-brand-bright">{e.selected_agent ?? '—'}</td>
              <td className="px-3 py-2 text-[12px] text-creme">{e.intent ?? '—'}</td>
              <td className="px-3 py-2"><Pill tone={e.status === 'ok' ? 'success' : 'danger'}>{e.status}</Pill></td>
              <td className="px-3 py-2 text-[11.5px] font-mono text-creme-mute">{e.latency_ms}ms</td>
              <td className="px-3 py-2 text-[11.5px] font-mono text-creme-mute">${Number(e.estimated_cost_usd ?? 0).toFixed(5)}</td>
              <td className="px-3 py-2 text-[11.5px] text-creme-mute max-w-[300px] truncate">{e.input_text}</td>
            </tr>
          ))}
        </Table>
      )}
    </Container>
  );
}

function TabIntegrations({ tenantId }: { tenantId: string }) {
  const [list, setList] = useState<Integration[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    if (!tenantId) return;
    setLoading(true);
    try {
      const r = await cortexStack.listIntegrations(tenantId);
      setList(r.integrations);
    } catch (e) { setError((e as Error).message); }
    finally { setLoading(false); }
  }
  useEffect(() => { void refresh(); }, [tenantId]);

  async function connect(provider: string) {
    try {
      await cortexStack.createIntegration({ tenant_id: tenantId, provider, display_name: provider });
      await refresh();
    } catch (e) { useAppStore.getState().addToast((e as Error).message, 'red'); }
  }

  if (!tenantId) return <NeedConfig field="tenant ID" />;

  const AVAILABLE = [
    { id: 'hubspot', label: 'HubSpot', icon: '🟠' },
    { id: 'pipedrive', label: 'Pipedrive', icon: '🟢' },
    { id: 'salesforce', label: 'Salesforce', icon: '☁️' },
    { id: 'slack', label: 'Slack', icon: '💬' },
    { id: 'teams', label: 'Microsoft Teams', icon: '🟣' },
    { id: 'google_calendar', label: 'Google Calendar', icon: '📅' },
    { id: 'whatsapp_meta', label: 'WhatsApp Cloud', icon: '🟢' },
    { id: 'totvs_protheus', label: 'TOTVS Protheus', icon: '🔵' },
    { id: 'bling', label: 'Bling ERP', icon: '🟡' },
  ];

  return (
    <Container>
      <h3 className="text-[13px] font-bold uppercase tracking-wider text-creme-faint">Disponíveis</h3>
      <div className="grid grid-cols-3 gap-2">
        {AVAILABLE.map((i) => {
          const connected = list.find((l) => l.provider === i.id);
          return (
            <button
              key={i.id}
              onClick={() => !connected && connect(i.id)}
              className={clsx(
                'rounded-xl border p-3 text-left transition-colors',
                connected ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-default bg-surface-1 hover:border-hover',
              )}
            >
              <div className="flex items-center gap-2">
                <span className="text-xl">{i.icon}</span>
                <span className="text-[13px] font-bold text-creme">{i.label}</span>
                {connected && <CheckCircle2 size={14} className="ml-auto text-emerald-300" />}
              </div>
              {connected && (
                <div className="text-[10.5px] text-creme-faint mt-1">
                  {connected.last_sync_at ? `Last sync: ${new Date(connected.last_sync_at).toLocaleString('pt-BR')}` : 'Nunca sincronizado'}
                </div>
              )}
            </button>
          );
        })}
      </div>

      {error && <ErrorMsg msg={error} />}
      {loading && <CenterLoader />}
    </Container>
  );
}

function TabWhiteLabel({ tenantId }: { tenantId: string }) {
  const [wl, setWl] = useState<WhiteLabel>({});
  const [customDomain, setCustomDomain] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!tenantId) return;
    cortexStack.getWhiteLabel(tenantId).then((r) => {
      setWl(r.tenant?.white_label ?? {});
      setCustomDomain(r.tenant?.custom_domain ?? '');
    }).catch((e) => setError((e as Error).message));
  }, [tenantId]);

  async function save() {
    if (!tenantId) return;
    setLoading(true);
    setError(null);
    try {
      await cortexStack.updateWhiteLabel(tenantId, { white_label: wl, custom_domain: customDomain });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e) { setError((e as Error).message); }
    finally { setLoading(false); }
  }

  if (!tenantId) return <NeedConfig field="tenant ID" />;

  return (
    <Container>
      <div className="rounded-xl border border-default bg-surface-1 p-5 space-y-3 max-w-2xl">
        <h3 className="text-[14px] font-bold text-creme">White-label config</h3>
        <p className="text-[12.5px] text-creme-mute">
          Personalize visual e domínio próprio (clientes "agency" revendem a plataforma).
        </p>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Brand name">
            <input value={wl.brand_name ?? ''} onChange={(e) => setWl({ ...wl, brand_name: e.target.value })} placeholder="Cortex" className="w-full px-3 py-2 rounded-lg bg-surface-3 border border-hover text-[13px] text-creme" />
          </Field>
          <Field label="Cor primária (hex)">
            <input value={wl.primary_color ?? ''} onChange={(e) => setWl({ ...wl, primary_color: e.target.value })} placeholder="#10b981" className="w-full px-3 py-2 rounded-lg bg-surface-3 border border-hover text-[13px] text-creme font-mono" />
          </Field>
        </div>

        <Field label="Logo URL">
          <input value={wl.logo_url ?? ''} onChange={(e) => setWl({ ...wl, logo_url: e.target.value })} placeholder="https://..." className="w-full px-3 py-2 rounded-lg bg-surface-3 border border-hover text-[13px] text-creme" />
        </Field>

        <Field label="Favicon URL">
          <input value={wl.favicon_url ?? ''} onChange={(e) => setWl({ ...wl, favicon_url: e.target.value })} placeholder="https://..." className="w-full px-3 py-2 rounded-lg bg-surface-3 border border-hover text-[13px] text-creme" />
        </Field>

        <Field label="Email de suporte">
          <input value={wl.support_email ?? ''} onChange={(e) => setWl({ ...wl, support_email: e.target.value })} placeholder="suporte@..." className="w-full px-3 py-2 rounded-lg bg-surface-3 border border-hover text-[13px] text-creme" />
        </Field>

        <Field label="Domínio custom (cliente acessa por aqui)">
          <input value={customDomain} onChange={(e) => setCustomDomain(e.target.value)} placeholder="brain.cliente.com.br" className="w-full px-3 py-2 rounded-lg bg-surface-3 border border-hover text-[13px] text-creme font-mono" />
        </Field>

        {error && <ErrorMsg msg={error} />}
        {saved && <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 px-3 py-2 text-[12.5px] text-emerald-200 flex items-center gap-2"><CheckCircle2 size={14} /> Configuração salva</div>}

        <button onClick={save} disabled={loading} className="px-4 py-2 rounded-lg bg-brand hover:bg-brand-bright text-bg font-bold text-[13px] disabled:opacity-50 flex items-center gap-1.5">
          {loading ? <Loader2 size={13} className="animate-spin" /> : <Palette size={13} />}
          Salvar
        </button>
      </div>
    </Container>
  );
}

// ─── Reusable UI ──────────────────────────────────────────────────────────────

function Container({ children }: { children: React.ReactNode }) {
  return <div className="space-y-4">{children}</div>;
}

function Header({ title, actions }: { title: string; actions?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between">
      <div className="text-[13.5px] text-creme-mute">{title}</div>
      {actions}
    </div>
  );
}

function CenterLoader() {
  return <div className="py-12 flex justify-center"><Loader2 size={20} className="text-creme-mute animate-spin" /></div>;
}

function ErrorMsg({ msg }: { msg: string }) {
  return (
    <div className="rounded-xl border border-red-500/30 bg-red-500/5 px-4 py-3 text-[13.5px] text-red-200 flex items-start gap-2">
      <AlertCircle size={16} className="shrink-0 mt-0.5" />
      <div>{msg}</div>
    </div>
  );
}

function EmptyState({ icon: Icon, text }: { icon: typeof CheckCircle2; text: string }) {
  return (
    <div className="rounded-xl border border-default bg-surface-1 px-5 py-12 text-center text-[13.5px] text-creme-mute">
      <Icon size={28} className="mx-auto mb-2 opacity-40" />
      {text}
    </div>
  );
}

function NeedConfig({ field }: { field: string }) {
  return (
    <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 px-5 py-4 text-[13.5px] text-amber-200">
      Configure <strong>{field}</strong> no topo da página primeiro.
    </div>
  );
}

function Table({ headers, children }: { headers: string[]; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-default bg-surface-1 overflow-hidden">
      <table className="w-full">
        <thead className="bg-surface-2 text-[10.5px] uppercase tracking-wider text-creme-faint">
          <tr>{headers.map((h, i) => (
            <th key={i} className={clsx('text-left py-2.5 font-bold', i === 0 ? 'px-5' : 'px-3', i === headers.length - 1 && 'pr-5')}>{h}</th>
          ))}</tr>
        </thead>
        <tbody className="divide-y divide-default">{children}</tbody>
      </table>
    </div>
  );
}

function Pill({ children, tone = 'default' }: { children: React.ReactNode; tone?: 'default' | 'success' | 'warn' | 'danger' | 'muted' }) {
  const map = {
    default: 'bg-surface-3 text-creme-mute',
    success: 'bg-emerald-500/10 text-emerald-300',
    warn: 'bg-amber-500/10 text-amber-200',
    danger: 'bg-red-500/10 text-red-200',
    muted: 'bg-surface-3 text-creme-faint',
  };
  return <span className={`px-1.5 py-0.5 rounded font-bold text-[10.5px] uppercase ${map[tone]}`}>{children}</span>;
}

function StatCard({ label, value, tone = 'default' }: { label: string; value: string; tone?: 'default' | 'brand' | 'danger' }) {
  const colorMap = { default: 'text-creme', brand: 'text-brand-bright', danger: 'text-red-300' };
  return (
    <div className="rounded-xl border border-default bg-surface-1 px-5 py-4">
      <div className="text-[11px] uppercase tracking-wider font-bold text-creme-faint">{label}</div>
      <div className={`mt-1.5 text-2xl font-extrabold ${colorMap[tone]}`}>{value}</div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-[11px] uppercase tracking-wider font-bold text-creme-faint">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}

function brl(n: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(n || 0);
}
