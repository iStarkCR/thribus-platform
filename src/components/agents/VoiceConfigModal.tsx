import { useEffect, useState } from 'react';
import { X, Volume2, Loader2, Check, Info } from 'lucide-react';
import {
  getVoiceConfig, saveVoiceConfig, DEFAULT_VOICE_CONFIG,
  OPENAI_VOICES, OPENAI_MODELS, ELEVENLABS_MODELS,
  type VoiceConfig, type VoiceProvider,
} from '@/services/voiceSkill';
import { useAppStore } from '@/hooks/useAppStore';

/**
 * Skill: Voz — config por colaborador. Liga/desliga, escolhe provedor, voz,
 * modelo e API key. Quando ativa, o colaborador responde falando + modo voz.
 */
export function VoiceConfigModal({ agentId, agentName, onClose }: { agentId: string; agentName: string; onClose: () => void }) {
  const [cfg, setCfg] = useState<VoiceConfig>(DEFAULT_VOICE_CONFIG);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getVoiceConfig(agentId)
      .then((c) => { if (c) setCfg(c); })
      .finally(() => setLoading(false));
  }, [agentId]);

  const set = <K extends keyof VoiceConfig>(k: K, v: VoiceConfig[K]) => setCfg((c) => ({ ...c, [k]: v }));

  async function save() {
    setSaving(true);
    try {
      await saveVoiceConfig(agentId, cfg);
      useAppStore.getState().addToast('Skill de voz salva', 'green');
      onClose();
    } catch (e) {
      useAppStore.getState().addToast((e as Error).message, 'red');
    } finally {
      setSaving(false);
    }
  }

  const needsKey = cfg.provider === 'elevenlabs' || cfg.provider === 'openai';

  return (
    <div className="fixed inset-0 bg-black/55 backdrop-blur-sm flex items-center justify-center z-[70] p-4" onClick={onClose}>
      <div className="bg-surface-1 border border-default rounded-2xl w-full max-w-md max-h-[88vh] flex flex-col shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-default">
          <div className="flex items-center gap-2 text-[15px] font-bold text-creme">
            <Volume2 size={16} className="text-brand" /> Skill: Voz — {agentName}
          </div>
          <button onClick={onClose} className="text-creme-faint hover:text-creme"><X size={17} /></button>
        </div>

        {loading ? (
          <div className="p-6 flex items-center gap-2 text-creme-faint text-[13px]"><Loader2 size={14} className="animate-spin" /> Carregando…</div>
        ) : (
          <div className="flex-1 overflow-y-auto p-5 space-y-4">
            {/* Ativar */}
            <label className="flex items-center justify-between gap-3 cursor-pointer">
              <div>
                <div className="text-[13.5px] font-semibold text-creme">Ativar voz</div>
                <div className="text-[12px] text-creme-faint">Quando ligado, ele responde falando e libera o modo voz.</div>
              </div>
              <button onClick={() => set('enabled', !cfg.enabled)} className={`w-11 h-6 rounded-full relative transition-colors shrink-0 ${cfg.enabled ? 'bg-brand' : 'bg-surface-3 border border-default'}`}>
                <span className={`absolute top-[3px] w-[18px] h-[18px] rounded-full bg-white transition-all ${cfg.enabled ? 'left-[calc(100%-21px)]' : 'left-[3px]'}`} />
              </button>
            </label>

            {/* Provedor */}
            <Field label="Provedor de voz">
              <div className="grid grid-cols-3 gap-2">
                {(['browser', 'elevenlabs', 'openai'] as VoiceProvider[]).map((p) => (
                  <button
                    key={p}
                    onClick={() => set('provider', p)}
                    className={`px-2 py-2 rounded-lg border text-[12px] font-semibold capitalize transition-colors ${cfg.provider === p ? 'bg-brand/10 border-brand/40 text-creme' : 'bg-surface-2 border-default text-creme-mute hover:bg-surface-hover'}`}
                  >
                    {p === 'browser' ? 'Navegador' : p === 'elevenlabs' ? 'ElevenLabs' : 'OpenAI'}
                  </button>
                ))}
              </div>
            </Field>

            {cfg.provider === 'browser' && (
              <div className="flex items-start gap-2 px-3 py-2 rounded-lg bg-semantic-blue/10 text-semantic-blue text-[11.5px]">
                <Info size={13} className="shrink-0 mt-0.5" />
                <span>Voz nativa do navegador — grátis, sem chave. Qualidade menor que ElevenLabs/OpenAI.</span>
              </div>
            )}

            {cfg.provider === 'elevenlabs' && (
              <>
                <Field label="Voice ID (ElevenLabs)">
                  <input className="input" value={cfg.voiceId ?? ''} onChange={(e) => set('voiceId', e.target.value)} placeholder="21m00Tcm4TlvDq8ikWAM (Rachel)" />
                </Field>
                <Field label="Modelo">
                  <select className="input" value={cfg.model ?? ELEVENLABS_MODELS[0]} onChange={(e) => set('model', e.target.value)}>
                    {ELEVENLABS_MODELS.map((m) => <option key={m} value={m}>{m}</option>)}
                  </select>
                </Field>
              </>
            )}

            {cfg.provider === 'openai' && (
              <>
                <Field label="Voz">
                  <select className="input" value={cfg.voiceId ?? 'nova'} onChange={(e) => set('voiceId', e.target.value)}>
                    {OPENAI_VOICES.map((v) => <option key={v} value={v}>{v}</option>)}
                  </select>
                </Field>
                <Field label="Modelo">
                  <select className="input" value={cfg.model ?? OPENAI_MODELS[0]} onChange={(e) => set('model', e.target.value)}>
                    {OPENAI_MODELS.map((m) => <option key={m} value={m}>{m}</option>)}
                  </select>
                </Field>
              </>
            )}

            {needsKey && (
              <Field label={`API key (${cfg.provider === 'elevenlabs' ? 'ElevenLabs' : 'OpenAI'})`}>
                <input className="input font-mono" type="password" value={cfg.apiKey ?? ''} onChange={(e) => set('apiKey', e.target.value)} placeholder="cole a chave…" />
                <p className="text-[10.5px] text-creme-faint mt-1">Guardada server-side; só super-admin acessa. Requer deploy das Edge Functions tts/transcribe.</p>
              </Field>
            )}

            <label className="flex items-center justify-between gap-3 cursor-pointer pt-1">
              <div className="text-[13px] text-creme-mute">Transcrição por voz (mic → texto)</div>
              <button onClick={() => set('sttEnabled', !cfg.sttEnabled)} className={`w-9 h-5 rounded-full relative transition-colors shrink-0 ${cfg.sttEnabled ? 'bg-brand/70' : 'bg-surface-3 border border-default'}`}>
                <span className={`absolute top-[3px] w-3 h-3 rounded-full bg-white transition-all ${cfg.sttEnabled ? 'left-[calc(100%-15px)]' : 'left-[3px]'}`} />
              </button>
            </label>
          </div>
        )}

        <div className="px-5 py-3.5 border-t border-default flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 rounded-xl text-[13px] font-semibold text-creme-mute hover:bg-surface-hover transition-colors">Cancelar</button>
          <button onClick={save} disabled={saving || loading} className="flex items-center gap-2 px-4 py-2 rounded-xl text-[13px] font-semibold bg-brand text-white hover:bg-brand-bright disabled:opacity-40 transition-colors">
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} Salvar
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-[11px] font-bold uppercase tracking-wider text-creme-mute mb-1 block">{label}</label>
      {children}
    </div>
  );
}
