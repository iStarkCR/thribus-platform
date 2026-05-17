import {
  Handshake, Crown, Award, Medal, Plus, Users, DollarSign,
  TrendingUp, CheckCircle2, ChevronRight,
} from 'lucide-react';
import { clsx } from 'clsx';
import { SEED_PARTNERS, SEED_PARTNER_LEADS, type Partner, type PartnerLead } from '@/lib/seed-extras2';

const TIER_META = {
  silver: { label: 'Silver', color: 'bg-creme-faint/15 text-creme-mute', Icon: Medal },
  gold: { label: 'Gold', color: 'bg-semantic-amber/15 text-semantic-amber', Icon: Award },
  platinum: { label: 'Platinum', color: 'bg-brand/15 text-brand-bright', Icon: Crown },
};

const STATUS_META = {
  new: { label: 'novo', color: 'bg-surface-3 text-creme-dim' },
  qualified: { label: 'qualificado', color: 'bg-brand/15 text-brand-bright' },
  demo: { label: 'demo', color: 'bg-semantic-amber/15 text-semantic-amber' },
  proposal: { label: 'proposta', color: 'bg-semantic-amber/15 text-semantic-amber' },
  won: { label: 'fechado', color: 'bg-semantic-green/15 text-semantic-green' },
  lost: { label: 'perdido', color: 'bg-semantic-red/15 text-semantic-red' },
};

export function PartnerPage() {
  const totalMrr = SEED_PARTNERS.reduce((s, p) => s + p.mrrAttributed, 0);
  const totalClients = SEED_PARTNERS.reduce((s, p) => s + p.activeClients, 0);
  const totalPayouts = SEED_PARTNERS.reduce((s, p) => s + p.payoutsYTD, 0);

  return (
    <>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2 text-[15px] font-bold text-creme">
          <Handshake size={16} className="text-creme-mute" /> Partner Portal
          <span className="text-[12px] font-mono font-normal text-creme-faint ml-1">
            · revendedores · affiliate · leads atribuídos · comissão
          </span>
        </div>
        <button className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-brand-dim border border-brand text-creme hover:bg-brand transition-all flex items-center gap-1">
          <Plus size={11} /> Convidar parceiro
        </button>
      </div>

      <div className="grid grid-cols-4 gap-2.5 mb-4">
        <StatCard icon={<Users size={12} />} label="Parceiros ativos" value={SEED_PARTNERS.length.toString()} />
        <StatCard icon={<CheckCircle2 size={12} />} label="Clientes atribuídos" value={totalClients.toString()} />
        <StatCard icon={<DollarSign size={12} />} label="MRR via partners" value={`R$ ${totalMrr.toLocaleString('pt-BR')}`} />
        <StatCard icon={<TrendingUp size={12} />} label="Payouts YTD" value={`R$ ${(totalPayouts / 1000).toFixed(1)}k`} />
      </div>

      <div className="grid grid-cols-[1fr_360px] gap-3">
        <div>
          <h3 className="text-[12.5px] font-bold uppercase tracking-wider text-creme-dim mb-2">Parceiros</h3>
          <div className="space-y-2.5">
            {SEED_PARTNERS.map((p) => <PartnerCard key={p.id} partner={p} />)}
          </div>
        </div>
        <div>
          <h3 className="text-[12.5px] font-bold uppercase tracking-wider text-creme-dim mb-2">Pipeline de leads</h3>
          <div className="space-y-2">
            {SEED_PARTNER_LEADS.map((l) => <LeadCard key={l.id} lead={l} />)}
          </div>
        </div>
      </div>
    </>
  );
}

function StatCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="bg-surface-2 border border-default rounded-[10px] p-3">
      <div className="flex items-center gap-1 text-creme-faint text-[10.5px] uppercase tracking-wider font-bold">{icon} {label}</div>
      <div className="text-[20px] font-bold font-mono text-creme mt-1">{value}</div>
    </div>
  );
}

function PartnerCard({ partner: p }: { partner: Partner }) {
  const tier = TIER_META[p.tier];
  const TierIcon = tier.Icon;
  return (
    <div className="bg-surface-2 border border-default rounded-[10px] p-4">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h4 className="text-[14px] font-bold text-creme">{p.name}</h4>
            <span className={clsx('inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10.5px] font-bold uppercase tracking-wider', tier.color)}>
              <TierIcon size={10} /> {tier.label}
            </span>
            <span className="text-[10.5px] font-mono text-creme-faint">{(p.commissionRate * 100).toFixed(0)}% comissão</span>
          </div>
          <div className="text-[11px] text-creme-faint mt-0.5 font-mono">
            parceiro desde {new Date(p.joinedAt).toLocaleDateString('pt-BR')}
          </div>
        </div>
        <button className="px-2.5 py-1 rounded-md text-[11.5px] font-semibold bg-surface-3 text-creme-mute hover:bg-surface-hover hover:text-creme inline-flex items-center gap-1">
          Detalhe <ChevronRight size={11} />
        </button>
      </div>

      <div className="grid grid-cols-4 gap-2">
        <Stat label="Referrals" value={p.totalReferrals.toString()} />
        <Stat label="Clientes ativos" value={p.activeClients.toString()} />
        <Stat label="MRR atribuído" value={`R$ ${p.mrrAttributed.toLocaleString('pt-BR')}`} highlight />
        <Stat label="Payouts YTD" value={`R$ ${(p.payoutsYTD / 1000).toFixed(1)}k`} />
      </div>
    </div>
  );
}

function Stat({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="bg-surface-1 border border-default rounded-md p-2">
      <div className="text-[10px] uppercase tracking-wider font-bold text-creme-faint">{label}</div>
      <div className={clsx('text-[13px] font-bold font-mono mt-0.5', highlight ? 'text-brand-bright' : 'text-creme')}>{value}</div>
    </div>
  );
}

function LeadCard({ lead: l }: { lead: PartnerLead }) {
  return (
    <div className="bg-surface-2 border border-default rounded-[10px] p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="text-[13px] font-semibold text-creme truncate">{l.leadName}</div>
          <div className="text-[10.5px] text-creme-faint font-mono truncate">via {l.partnerName}</div>
        </div>
        <span className={clsx('text-[10px] font-mono px-1.5 py-px rounded-full', STATUS_META[l.status].color)}>
          {STATUS_META[l.status].label}
        </span>
      </div>
      <div className="flex items-center justify-between mt-2 pt-2 border-t border-default">
        <span className="text-[11px] font-mono text-creme-faint">
          {new Date(l.createdAt).toLocaleDateString('pt-BR')}
        </span>
        <span className="text-[12px] font-bold font-mono text-brand-bright">R$ {l.estimatedMrr.toLocaleString('pt-BR')}/mês</span>
      </div>
    </div>
  );
}
