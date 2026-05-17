import { useState } from 'react';
import {
  Phone, PhoneIncoming, PhoneOutgoing, PhoneMissed, Play,
  Bot, Volume2, Clock, DollarSign, Settings, FileText,
} from 'lucide-react';
import { clsx } from 'clsx';
import {
  SEED_VOICE_PROVIDERS, SEED_VOICE_CONFIG, SEED_VOICE_CALLS,
  type VoiceCall, type VoiceCallStatus,
} from '@/lib/seed-voice';

const STATUS_LABEL: Record<VoiceCallStatus, { label: string; color: string }> = {
  ringing: { label: 'tocando', color: 'bg-semantic-amber/15 text-semantic-amber' },
  in_progress: { label: 'em atend.', color: 'bg-semantic-green/15 text-semantic-green' },
  completed: { label: 'completa', color: 'bg-brand/15 text-brand-bright' },
  failed: { label: 'falhou', color: 'bg-semantic-red/15 text-semantic-red' },
  voicemail: { label: 'caixa postal', color: 'bg-surface-3 text-creme-mute' },
};

const OUTCOME_COLOR: Record<VoiceCall['outcome'], string> = {
  venda: 'bg-semantic-green/15 text-semantic-green',
  follow_up: 'bg-semantic-amber/15 text-semantic-amber',
  sem_interesse: 'bg-surface-3 text-creme-mute',
  escalado: 'bg-semantic-red/15 text-semantic-red',
  caixa_postal: 'bg-surface-3 text-creme-faint',
  tecnico: 'bg-brand/15 text-brand-bright',
};

export function VoicePage() {
  const [selectedId, setSelectedId] = useState<string>(SEED_VOICE_CALLS[0]?.id ?? '');
  const selected = SEED_VOICE_CALLS.find((c) => c.id === selectedId);

  const stats = {
    total: SEED_VOICE_CALLS.length,
    completed: SEED_VOICE_CALLS.filter((c) => c.status === 'completed').length,
    avgDuration: Math.round(SEED_VOICE_CALLS.reduce((s, c) => s + c.durationSec, 0) / SEED_VOICE_CALLS.length),
    totalCost: SEED_VOICE_CALLS.reduce((s, c) => s + c.cost, 0),
  };

  return (
    <>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2 text-[15px] font-bold text-creme">
          <Phone size={16} className="text-creme-mute" /> Canal de Voz
          <span className="text-[12px] font-mono font-normal text-creme-faint ml-1">
            · ElevenLabs / Vapi · STT + TTS · mesmo agente, agora por telefone
          </span>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-2.5 mb-3">
        <StatCard icon={<Phone size={12} />} label="Chamadas /30d" value={stats.total.toString()} />
        <StatCard icon={<Bot size={12} />} label="Completadas" value={`${stats.completed}/${stats.total}`} />
        <StatCard icon={<Clock size={12} />} label="Duração média" value={`${Math.floor(stats.avgDuration / 60)}:${(stats.avgDuration % 60).toString().padStart(2, '0')}`} />
        <StatCard icon={<DollarSign size={12} />} label="Custo total" value={`US$ ${stats.totalCost.toFixed(2)}`} />
      </div>

      <div className="grid grid-cols-[1fr_360px] gap-3 h-[calc(100vh-260px)] min-h-[480px]">
        <div className="bg-surface-2 border border-default rounded-[10px] flex flex-col overflow-hidden">
          <div className="p-3 border-b border-default flex items-center justify-between">
            <h3 className="text-[13px] font-bold text-creme">Histórico de chamadas</h3>
            <button className="px-2.5 py-1 rounded-md text-[11.5px] font-semibold bg-surface-3 text-creme-mute hover:bg-surface-hover hover:text-creme transition-colors inline-flex items-center gap-1">
              <Phone size={10} /> Ligar manualmente
            </button>
          </div>
          <div className="flex-1 overflow-y-auto">
            {SEED_VOICE_CALLS.map((call) => <CallRow key={call.id} call={call} selected={call.id === selectedId} onClick={() => setSelectedId(call.id)} />)}
          </div>
        </div>

        <div className="space-y-3 overflow-y-auto">
          {selected && <CallDetail call={selected} />}
          <ProviderConfig />
        </div>
      </div>
    </>
  );
}

function StatCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="bg-surface-2 border border-default rounded-[10px] p-3">
      <div className="flex items-center gap-1 text-creme-faint text-[10.5px] uppercase tracking-wider font-bold">
        {icon} {label}
      </div>
      <div className="text-[20px] font-bold font-mono text-creme mt-1">{value}</div>
    </div>
  );
}

function CallRow({ call: c, selected, onClick }: { call: VoiceCall; selected: boolean; onClick: () => void }) {
  const DirIcon = c.direction === 'inbound' ? PhoneIncoming : c.status === 'voicemail' ? PhoneMissed : PhoneOutgoing;
  return (
    <button
      onClick={onClick}
      className={clsx(
        'w-full text-left px-4 py-2.5 border-b border-default transition-all flex items-center gap-3',
        selected ? 'bg-brand/10' : 'hover:bg-surface-hover/30',
      )}
    >
      <DirIcon size={14} className={clsx(
        'shrink-0',
        c.direction === 'inbound' ? 'text-semantic-green' : c.status === 'voicemail' ? 'text-semantic-red' : 'text-brand-bright',
      )} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[13px] font-semibold text-creme truncate">{c.customerName ?? c.customerPhone}</span>
          <span className={clsx('text-[10px] font-mono px-1.5 py-px rounded-full', STATUS_LABEL[c.status].color)}>
            {STATUS_LABEL[c.status].label}
          </span>
        </div>
        <div className="text-[10.5px] text-creme-faint font-mono mt-0.5 flex items-center gap-2">
          <Bot size={9} /> {c.agentName}
          <span>·</span>
          <span>{Math.floor(c.durationSec / 60)}:{(c.durationSec % 60).toString().padStart(2, '0')}</span>
          <span>·</span>
          <span>US$ {c.cost.toFixed(2)}</span>
        </div>
      </div>
      <span className={clsx('text-[10.5px] font-mono px-1.5 py-px rounded-full shrink-0', OUTCOME_COLOR[c.outcome])}>
        {c.outcome.replace('_', ' ')}
      </span>
      <span className="text-[10.5px] text-creme-faint font-mono shrink-0 w-[80px] text-right">
        {new Date(c.startedAt).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
      </span>
    </button>
  );
}

function CallDetail({ call: c }: { call: VoiceCall }) {
  return (
    <div className="bg-surface-2 border border-default rounded-[10px] p-4">
      <h4 className="text-[13px] font-bold text-creme mb-3 flex items-center gap-2">
        <Volume2 size={13} className="text-brand-bright" /> Detalhe da chamada
      </h4>
      <div className="space-y-3">
        <div>
          <div className="text-[10.5px] uppercase tracking-wider font-bold text-creme-faint mb-1">Cliente</div>
          <div className="text-[13px] font-semibold text-creme">{c.customerName ?? '—'}</div>
          <div className="text-[11px] font-mono text-creme-faint">{c.customerPhone}</div>
        </div>

        {c.recordingUrl && (
          <div className="bg-surface-1 border border-default rounded-md p-2.5 flex items-center gap-2">
            <button className="w-8 h-8 rounded-full bg-brand-dim border border-brand text-creme flex items-center justify-center hover:bg-brand transition-all">
              <Play size={12} />
            </button>
            <div className="flex-1">
              <div className="text-[11.5px] text-creme font-semibold">Gravação</div>
              <div className="h-1 bg-surface-3 rounded-full mt-1.5"><div className="h-full bg-brand rounded-full w-[0%]" /></div>
            </div>
            <span className="text-[10.5px] font-mono text-creme-faint">
              {Math.floor(c.durationSec / 60)}:{(c.durationSec % 60).toString().padStart(2, '0')}
            </span>
          </div>
        )}

        <div>
          <div className="text-[10.5px] uppercase tracking-wider font-bold text-creme-faint mb-1">Sentimento</div>
          <div className={clsx(
            'text-[18px] font-bold font-mono',
            c.sentiment > 0.3 ? 'text-semantic-green' : c.sentiment < -0.2 ? 'text-semantic-red' : 'text-creme-mute',
          )}>
            {c.sentiment > 0 ? '+' : ''}{c.sentiment.toFixed(2)}
          </div>
        </div>

        <div>
          <div className="text-[10.5px] uppercase tracking-wider font-bold text-creme-faint mb-1">Tools chamadas</div>
          {c.toolsCalled.length === 0 ? (
            <p className="text-[11.5px] text-creme-faint italic">Nenhuma</p>
          ) : (
            <div className="flex flex-wrap gap-1">
              {c.toolsCalled.map((t) => (
                <code key={t} className="text-[10.5px] font-mono px-1.5 py-px rounded bg-surface-3 text-creme-dim">{t}</code>
              ))}
            </div>
          )}
        </div>

        {c.transcriptAvailable && (
          <button className="w-full py-1.5 rounded-md bg-surface-3 text-creme-mute hover:bg-surface-hover hover:text-creme text-[12px] font-semibold inline-flex items-center justify-center gap-1.5">
            <FileText size={11} /> Ver transcrição
          </button>
        )}
      </div>
    </div>
  );
}

function ProviderConfig() {
  const cfg = SEED_VOICE_CONFIG;
  const provider = SEED_VOICE_PROVIDERS.find((p) => p.id === cfg.providerId)!;
  return (
    <div className="bg-surface-2 border border-default rounded-[10px] p-4">
      <h4 className="text-[13px] font-bold text-creme mb-3 flex items-center gap-2">
        <Settings size={13} className="text-brand-bright" /> Configuração de voz
      </h4>
      <div className="space-y-2.5 text-[12px]">
        <Row label="Provider" value={provider.name} />
        <Row label="Voz" value={provider.voiceName} />
        <Row label="TTS" value={provider.ttsModel} mono />
        <Row label="STT" value={provider.sttModel} mono />
        <Row label="Latência" value={`${provider.latencyMs}ms`} mono />
        <div className="pt-2 border-t border-default" />
        <Row label="Nº inbound" value={cfg.inboundNumber} mono />
        <Row label="Greeting" value={cfg.greetingMessage} />
        <Row label="Max duração" value={`${cfg.maxDurationMin}min`} mono />
        <Row label="Gravação" value={cfg.recordCalls ? 'ativa' : 'off'} mono />
      </div>
    </div>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <span className="text-creme-faint text-[10.5px] uppercase tracking-wider font-bold shrink-0">{label}</span>
      <span className={clsx('text-creme text-right', mono && 'font-mono')}>{value}</span>
    </div>
  );
}
