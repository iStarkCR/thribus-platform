import { useEffect, useMemo, useState } from 'react';
import {
  UserCircle2, Search, Phone, Mail, MapPin, Flame, ThermometerSun,
  Snowflake, TrendingUp, TrendingDown, Tag, MessageSquare, FileText,
  DollarSign, Sparkles, Bot, CircleDot,
} from 'lucide-react';
import { clsx } from 'clsx';
import {
  SEED_CUSTOMERS, SEED_LEAD_FACTS, SEED_LEAD_INTERACTIONS, SEED_LEAD_CONTRACTS,
  type CustomerProfile, type LeadTemperature, type LeadStage,
  type LeadFact, type LeadInteraction, type LeadContract,
} from '@/lib/seed-customer360';
import * as customers from '@/services/customers';

const STAGE_LABEL: Record<LeadStage, { label: string; color: string }> = {
  novo: { label: 'Novo', color: 'bg-surface-3 text-creme-dim' },
  qualificado: { label: 'Qualificado', color: 'bg-brand/15 text-brand-bright' },
  em_negociacao: { label: 'Em negociação', color: 'bg-semantic-amber/15 text-semantic-amber' },
  cliente: { label: 'Cliente', color: 'bg-semantic-green/15 text-semantic-green' },
  churn: { label: 'Churn', color: 'bg-semantic-red/15 text-semantic-red' },
};

const TEMP_ICON: Record<LeadTemperature, { Icon: typeof Flame; color: string }> = {
  quente: { Icon: Flame, color: 'text-semantic-red' },
  morno: { Icon: ThermometerSun, color: 'text-semantic-amber' },
  frio: { Icon: Snowflake, color: 'text-brand-bright' },
};

export function Customer360Page() {
  const [search, setSearch] = useState('');
  const [stageFilter, setStageFilter] = useState<LeadStage | 'all'>('all');

  const [allCustomers, setAllCustomers] = useState<CustomerProfile[]>(SEED_CUSTOMERS);
  const [selectedId, setSelectedId] = useState<string>(SEED_CUSTOMERS[0]?.id ?? '');
  const [factsLive, setFactsLive] = useState<LeadFact[] | null>(null);
  const [interactionsLive, setInteractionsLive] = useState<LeadInteraction[] | null>(null);
  const [contractsLive, setContractsLive] = useState<LeadContract[] | null>(null);
  const [source, setSource] = useState<'mock' | 'live'>('mock');

  // Fetch perfis do workspace
  useEffect(() => {
    if (!customers.customersConfigured) return;
    customers.listCustomers('ws_texnet', 200)
      .then((rows) => {
        if (rows.length > 0) {
          setAllCustomers(rows);
          setSource('live');
          if (!rows.find((r) => r.id === selectedId)) setSelectedId(rows[0].id);
        }
      })
      .catch((e) => console.warn('[Customer360] live falhou:', (e as Error).message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Quando seleciona um, busca fatos/interações/contratos reais
  useEffect(() => {
    if (source !== 'live' || !selectedId) return;
    Promise.allSettled([
      customers.getCustomerFacts(selectedId).then(setFactsLive),
      customers.getCustomerInteractions(selectedId).then(setInteractionsLive),
      customers.getCustomerContracts(selectedId).then(setContractsLive),
    ]);
  }, [selectedId, source]);

  const filtered = useMemo(() => {
    let r = allCustomers;
    if (stageFilter !== 'all') r = r.filter((c) => c.stage === stageFilter);
    const q = search.trim().toLowerCase();
    if (q) r = r.filter((c) => c.name.toLowerCase().includes(q) || c.phone.includes(q) || c.tags.some((t) => t.includes(q)));
    return r;
  }, [search, stageFilter, allCustomers]);

  const selected = useMemo(() => allCustomers.find((c) => c.id === selectedId) ?? null, [selectedId, allCustomers]);
  const facts = factsLive ?? SEED_LEAD_FACTS.filter((f) => f.leadId === selectedId);
  const interactions = interactionsLive ?? SEED_LEAD_INTERACTIONS.filter((i) => i.leadId === selectedId);
  const contracts = contractsLive ?? SEED_LEAD_CONTRACTS.filter((c) => c.leadId === selectedId);

  return (
    <>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2 text-[15px] font-bold text-creme">
          <UserCircle2 size={16} className="text-creme-mute" /> Customer 360
          <span className="text-[12px] font-mono font-normal text-creme-faint ml-1">
            · perfil persistente · fatos · interações · contratos
          </span>
          <span className={clsx(
            'ml-2 text-[10.5px] font-mono px-1.5 py-px rounded-full inline-flex items-center gap-1',
            source === 'live' ? 'bg-semantic-green/15 text-semantic-green' : 'bg-semantic-amber/15 text-semantic-amber',
          )}>
            <CircleDot size={9} className={source === 'live' ? 'animate-pulse' : ''} />
            {source === 'live' ? `live · ${allCustomers.length} clientes` : 'mock'}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-[340px_1fr] gap-3 h-[calc(100vh-160px)] min-h-[500px]">
        <div className="bg-surface-2 border border-default rounded-[10px] flex flex-col overflow-hidden">
          <div className="p-3 border-b border-default space-y-2">
            <div className="relative">
              <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-creme-faint" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Nome, telefone, tag..."
                className="w-full pl-8 pr-3 py-1.5 rounded-lg bg-surface-1 border border-default text-[13px] text-creme placeholder-creme-faint focus:outline-none focus:border-brand"
              />
            </div>
            <select
              value={stageFilter}
              onChange={(e) => setStageFilter(e.target.value as LeadStage | 'all')}
              className="w-full px-3 py-1.5 rounded-md bg-surface-1 border border-default text-[12.5px] text-creme focus:outline-none focus:border-brand"
            >
              <option value="all">Todos estágios</option>
              {Object.entries(STAGE_LABEL).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
          </div>
          <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
            {filtered.map((c) => <CustomerRow key={c.id} customer={c} selected={c.id === selectedId} onClick={() => setSelectedId(c.id)} />)}
          </div>
        </div>

        <div className="bg-surface-2 border border-default rounded-[10px] flex flex-col overflow-hidden">
          {selected ? (
            <CustomerDetail customer={selected} facts={facts} interactions={interactions} contracts={contracts} />
          ) : (
            <div className="flex-1 flex items-center justify-center text-creme-faint">
              <UserCircle2 size={28} className="opacity-50" />
            </div>
          )}
        </div>
      </div>
    </>
  );
}

function CustomerRow({ customer: c, selected, onClick }: { customer: CustomerProfile; selected: boolean; onClick: () => void }) {
  const Temp = TEMP_ICON[c.temperature];
  return (
    <button
      onClick={onClick}
      className={clsx(
        'w-full text-left p-2.5 rounded-lg border transition-all',
        selected ? 'bg-brand/10 border-brand/30' : 'bg-surface-1 border-default hover:border-hover hover:bg-surface-hover',
      )}
    >
      <div className="flex items-start gap-2.5">
        <div className="w-9 h-9 rounded-full bg-surface-3 border border-default flex items-center justify-center text-[12px] font-bold text-creme-mute shrink-0">
          {c.name.split(' ').map((n) => n[0]).slice(0, 2).join('')}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className={clsx('text-[13px] font-semibold truncate', selected ? 'text-brand-bright' : 'text-creme')}>{c.name}</span>
            <Temp.Icon size={11} className={clsx('shrink-0', Temp.color)} />
          </div>
          <div className="text-[10.5px] text-creme-faint font-mono truncate mt-0.5">{c.phone}</div>
          <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
            <span className={clsx('text-[10px] font-mono px-1.5 py-px rounded-full', STAGE_LABEL[c.stage].color)}>
              {STAGE_LABEL[c.stage].label}
            </span>
            <span className="text-[10px] font-mono text-creme-faint">score {c.score}</span>
          </div>
        </div>
      </div>
    </button>
  );
}

function CustomerDetail({ customer: c, facts, interactions, contracts }: { customer: CustomerProfile; facts: typeof SEED_LEAD_FACTS; interactions: typeof SEED_LEAD_INTERACTIONS; contracts: typeof SEED_LEAD_CONTRACTS }) {
  const Temp = TEMP_ICON[c.temperature];
  const trendUp = c.sentimentTrend > 0.1;
  const trendDown = c.sentimentTrend < -0.1;

  return (
    <>
      <div className="p-5 border-b border-default">
        <div className="flex items-start gap-4">
          <div className="w-14 h-14 rounded-full bg-surface-3 border border-default flex items-center justify-center text-[18px] font-bold text-creme-mute shrink-0">
            {c.name.split(' ').map((n) => n[0]).slice(0, 2).join('')}
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-[18px] font-bold text-creme">{c.name}</h2>
            <div className="flex items-center gap-3 mt-1 text-[12px] text-creme-mute flex-wrap">
              <span className="inline-flex items-center gap-1"><Phone size={11} />{c.phone}</span>
              {c.email && <span className="inline-flex items-center gap-1"><Mail size={11} />{c.email}</span>}
              <span className="inline-flex items-center gap-1"><MapPin size={11} />{c.city}</span>
            </div>
            <div className="flex items-center gap-1.5 mt-2 flex-wrap">
              <span className={clsx('text-[11px] font-mono px-2 py-0.5 rounded-full', STAGE_LABEL[c.stage].color)}>{STAGE_LABEL[c.stage].label}</span>
              <span className={clsx('text-[11px] font-mono px-2 py-0.5 rounded-full inline-flex items-center gap-1 bg-surface-3', Temp.color)}>
                <Temp.Icon size={10} /> {c.temperature}
              </span>
              {c.ownerAgentName && (
                <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-brand/15 text-brand-bright inline-flex items-center gap-1">
                  <Bot size={10} /> {c.ownerAgentName}
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-5 gap-2 mt-4">
          <StatPill label="Score" value={c.score.toString()} />
          <StatPill label="LTV est." value={`R$ ${(c.ltv / 1000).toFixed(1)}k`} />
          <StatPill label="Gasto total" value={`R$ ${c.totalSpent.toLocaleString('pt-BR')}`} />
          <StatPill label="Sentimento" value={`${c.sentimentTrend > 0 ? '+' : ''}${c.sentimentTrend.toFixed(2)}`} trend={trendUp ? 'up' : trendDown ? 'down' : 'flat'} />
          <StatPill label="Interações" value={interactions.length.toString()} />
        </div>

        <div className="flex items-center gap-1 mt-3 flex-wrap">
          {c.tags.map((t) => (
            <span key={t} className="text-[10.5px] font-mono px-1.5 py-px rounded-full bg-surface-3 text-creme-dim inline-flex items-center gap-1">
              <Tag size={9} /> {t}
            </span>
          ))}
        </div>
      </div>

      <div className="flex-1 grid grid-cols-3 overflow-hidden">
        <Section icon={<Sparkles size={12} />} title="Fatos memorizados">
          {facts.length === 0 ? (
            <Empty>Sem fatos capturados ainda.</Empty>
          ) : facts.map((f) => (
            <div key={f.id} className="p-2 bg-surface-1 rounded-md border border-default">
              <p className="text-[12px] text-creme-mute leading-snug">{f.fact}</p>
              <div className="text-[10px] font-mono text-creme-faint mt-1 flex items-center gap-2">
                <span className="px-1 py-px rounded bg-surface-3 text-creme-dim">{f.category}</span>
                <span>por {f.capturedBy}</span>
                <span>· {(f.confidence * 100).toFixed(0)}%</span>
              </div>
            </div>
          ))}
        </Section>

        <Section icon={<MessageSquare size={12} />} title="Interações">
          {interactions.map((i) => (
            <div key={i.id} className="p-2 bg-surface-1 rounded-md border border-default">
              <div className="flex items-center justify-between gap-2 mb-1">
                <span className="text-[10.5px] font-mono uppercase tracking-wider text-creme-faint">{i.channel}</span>
                <span className={clsx(
                  'text-[10.5px] font-mono',
                  i.sentiment > 0.3 ? 'text-semantic-green' : i.sentiment < -0.2 ? 'text-semantic-red' : 'text-creme-faint',
                )}>
                  {i.sentiment > 0 ? '+' : ''}{i.sentiment.toFixed(1)}
                </span>
              </div>
              <p className="text-[12px] text-creme-mute leading-snug">{i.summary}</p>
              <div className="text-[10px] font-mono text-creme-faint mt-1">
                {i.agentName ?? '—'} · {new Date(i.timestamp).toLocaleString('pt-BR')}
              </div>
            </div>
          ))}
        </Section>

        <Section icon={<FileText size={12} />} title="Contratos">
          {contracts.length === 0 ? (
            <Empty>Sem contratos ativos.</Empty>
          ) : contracts.map((co) => (
            <div key={co.id} className="p-2 bg-surface-1 rounded-md border border-default">
              <div className="flex items-center justify-between gap-2 mb-1">
                <span className="text-[12.5px] font-semibold text-creme">{co.product}</span>
                <span className={clsx(
                  'text-[10.5px] font-mono px-1.5 py-px rounded-full',
                  co.status === 'ativo' ? 'bg-semantic-green/15 text-semantic-green' :
                  co.status === 'pendente' ? 'bg-semantic-amber/15 text-semantic-amber' :
                  'bg-semantic-red/15 text-semantic-red',
                )}>
                  {co.status}
                </span>
              </div>
              <div className="text-[12px] text-creme-mute flex items-center gap-1.5">
                <DollarSign size={10} className="text-brand-bright" />
                R$ {co.mrr.toFixed(2)}/mês
              </div>
              <div className="text-[10px] font-mono text-creme-faint mt-0.5">
                desde {new Date(co.startedAt).toLocaleDateString('pt-BR')}
              </div>
            </div>
          ))}
        </Section>
      </div>
    </>
  );
}

function Section({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div className="border-r border-default last:border-r-0 overflow-hidden flex flex-col">
      <div className="p-3 border-b border-default flex items-center gap-1.5">
        <span className="text-creme-mute">{icon}</span>
        <h4 className="text-[11.5px] font-bold uppercase tracking-wider text-creme-dim">{title}</h4>
      </div>
      <div className="flex-1 p-2 overflow-y-auto space-y-1.5">{children}</div>
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="text-[11.5px] text-creme-faint italic p-2">{children}</p>;
}

function StatPill({ label, value, trend }: { label: string; value: string; trend?: 'up' | 'down' | 'flat' }) {
  return (
    <div className="bg-surface-1 rounded-md p-2 border border-default">
      <div className="text-[10px] uppercase tracking-wider font-bold text-creme-faint">{label}</div>
      <div className="flex items-baseline gap-1 mt-0.5">
        <span className="text-[14px] font-bold font-mono text-creme">{value}</span>
        {trend === 'up' && <TrendingUp size={10} className="text-semantic-green" />}
        {trend === 'down' && <TrendingDown size={10} className="text-semantic-red" />}
      </div>
    </div>
  );
}
