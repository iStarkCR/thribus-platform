import {
  Beaker, Plus, Clock, CheckCircle2, MessageSquare, Bot, TrendingUp,
  Sparkles, Mail, Building2,
} from 'lucide-react';
import { clsx } from 'clsx';
import { SEED_TRIALS, type SandboxTrial } from '@/lib/seed-final';

export function SandboxPage() {
  const totalTrials = SEED_TRIALS.length;
  const converted = SEED_TRIALS.filter((t) => t.convertedToPaid).length;
  const conversionRate = (converted / totalTrials * 100).toFixed(0);

  return (
    <>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2 text-[15px] font-bold text-creme">
          <Beaker size={16} className="text-creme-mute" /> Sandbox / Trial
          <span className="text-[12px] font-mono font-normal text-creme-faint ml-1">
            · workspaces isolados com dados sintéticos · cliente testa antes de pagar
          </span>
        </div>
        <button className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-brand-dim border border-brand text-creme hover:bg-brand inline-flex items-center gap-1">
          <Plus size={11} /> Convidar pra trial
        </button>
      </div>

      <div className="grid grid-cols-4 gap-2.5 mb-4">
        <Stat icon={<Beaker size={12} />} label="Trials ativos" value={totalTrials.toString()} />
        <Stat icon={<CheckCircle2 size={12} />} label="Convertidos" value={converted.toString()} color="green" />
        <Stat icon={<TrendingUp size={12} />} label="Conversão" value={`${conversionRate}%`} color="brand" />
        <Stat icon={<Sparkles size={12} />} label="Synthetic data" value={SEED_TRIALS.filter((t) => t.syntheticDataLoaded).length.toString()} />
      </div>

      <div className="bg-brand/5 border border-brand/20 rounded-[10px] p-4 mb-4">
        <div className="flex items-start gap-3">
          <Sparkles size={16} className="text-brand-bright shrink-0 mt-0.5" />
          <div>
            <h3 className="text-[13.5px] font-bold text-creme">Como funciona</h3>
            <p className="text-[12.5px] text-creme-mute mt-1 leading-relaxed">
              Lead potencial recebe link de trial → workspace isolado é criado com dados sintéticos da vertical dele
              (ISP, e-commerce, clínica) → testa Bianca/Renata/Marcos com conversas mock realistas → se gostar, converte
              em <b className="text-creme">1 clique</b> mantendo configurações. Histórico médio de conversão: <b className="text-brand-bright">3-5x maior</b> vs.
              demo agendada.
            </p>
          </div>
        </div>
      </div>

      <h3 className="text-[12.5px] font-bold uppercase tracking-wider text-creme-dim mb-2">Trials ativos</h3>
      <div className="space-y-2.5">
        {SEED_TRIALS.map((t) => <TrialCard key={t.id} trial={t} />)}
      </div>
    </>
  );
}

function TrialCard({ trial: t }: { trial: SandboxTrial }) {
  const urgent = t.daysLeft <= 7 && !t.convertedToPaid;
  return (
    <div className={clsx(
      'bg-surface-2 border rounded-[10px] p-4',
      urgent ? 'border-semantic-amber/40' : t.convertedToPaid ? 'border-semantic-green/30' : 'border-default',
    )}>
      <div className="flex items-start gap-3">
        <div className="w-11 h-11 rounded-lg bg-surface-1 border border-default flex items-center justify-center shrink-0">
          <Building2 size={16} className="text-creme-mute" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h4 className="text-[14px] font-bold text-creme">{t.companyName}</h4>
            {t.convertedToPaid ? (
              <span className="text-[10.5px] font-mono px-1.5 py-px rounded-full bg-semantic-green/15 text-semantic-green inline-flex items-center gap-1">
                <CheckCircle2 size={9} /> convertido
              </span>
            ) : urgent ? (
              <span className="text-[10.5px] font-mono px-1.5 py-px rounded-full bg-semantic-amber/15 text-semantic-amber inline-flex items-center gap-1">
                <Clock size={9} /> {t.daysLeft}d restantes
              </span>
            ) : (
              <span className="text-[10.5px] font-mono px-1.5 py-px rounded-full bg-brand/15 text-brand-bright">
                {t.daysLeft}d restantes
              </span>
            )}
            <span className="text-[10.5px] font-mono px-1.5 py-px rounded-full bg-surface-3 text-creme-mute">{t.industry}</span>
          </div>
          <div className="text-[11.5px] text-creme-faint mt-1 font-mono inline-flex items-center gap-1.5">
            <Mail size={10} /> {t.ownerEmail}
          </div>
        </div>
        {!t.convertedToPaid && (
          <button className="px-3 py-1.5 rounded-md bg-brand-dim border border-brand text-creme text-[12px] font-semibold inline-flex items-center gap-1 shrink-0">
            Converter em 1-clique
          </button>
        )}
      </div>

      <div className="grid grid-cols-4 gap-3 mt-4 pt-4 border-t border-default">
        <Mini icon={<MessageSquare size={11} />} label="Conversas testadas" value={t.conversationsTested.toString()} />
        <Mini icon={<Bot size={11} />} label="Agentes criados" value={t.agentsCreated.toString()} />
        <Mini icon={<Sparkles size={11} />} label="Synthetic data" value={t.syntheticDataLoaded ? 'carregada' : 'pendente'} />
        <Mini icon={<Clock size={11} />} label="Expira em" value={new Date(t.expiresAt).toLocaleDateString('pt-BR')} />
      </div>
    </div>
  );
}

function Stat({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: string; color?: 'green' | 'brand' }) {
  return (
    <div className="bg-surface-2 border border-default rounded-[10px] p-3">
      <div className="flex items-center gap-1 text-creme-faint text-[10.5px] uppercase tracking-wider font-bold">{icon} {label}</div>
      <div className={clsx('text-[20px] font-bold font-mono mt-1', color === 'green' ? 'text-semantic-green' : color === 'brand' ? 'text-brand-bright' : 'text-creme')}>{value}</div>
    </div>
  );
}

function Mini({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="bg-surface-1 border border-default rounded-md p-2">
      <div className="flex items-center gap-1 text-[10px] uppercase tracking-wider font-bold text-creme-faint">{icon} {label}</div>
      <div className="text-[12.5px] font-bold font-mono text-creme mt-0.5">{value}</div>
    </div>
  );
}
