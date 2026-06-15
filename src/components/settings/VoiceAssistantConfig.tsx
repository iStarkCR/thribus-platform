import { useEffect, useState } from 'react';
import { Loader2, Check } from 'lucide-react';
import {
  getVoiceConfig, saveVoiceConfig, DEFAULT_VOICE_CONFIG,
  OPENAI_VOICES, OPENAI_MODELS, ELEVENLABS_MODELS,
  type VoiceConfig, type VoiceProvider,
} from '@/services/voiceSkill';
import { useAppStore } from '@/hooks/useAppStore';

const BUKOWISKI_ID = 'bukowiski-thribus';

/**
 * Config da voz do assistente (Bukowiski) — dentro de Configurações, não solta.
 * Só provedores premium: ElevenLabs e OpenAI. Requer deploy das Edge Functions
 * tts/transcribe + chave pra falar.
 */
export function VoiceAssistantConfig() {
  const [cfg, setCfg] = useState<VoiceConfig>({ ...DEFAULT_VOICE_CONFIG, provider: 'elevenlabs' });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getVoiceConfig(BUKOWISKI_ID)
      .then((c) => { if (c) setCfg(c.provider === 'browser' ? { ...c, provider: 'elevenlabs' } : c); })
      .finally(() => setLoading(false));
  }, []);

  const set = <K extends keyof VoiceConfig>(k: K, v: VoiceConfig[K]) => setCfg((c) => ({ ...c, [k]: v }));

  async function save() {
    setSaving(true);
    try {
      await saveVoiceConfig(BUKOWISKI_ID, cfg);
      useAppStore.getState().addToast('Voz do assistente salva', 'green');
    } catch (e) {
      useAppStore.getState().addToast((e as Error).message, 'red');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <div className="flex items-center gap-2 text-creme-faint text-[12.5px] pt-3 mt-3 border-t border-default"><Loader2 size={13} className="animate-spin" /> Carregando voz…</div>;
  }

  return (
    <div className="pt-3 mt-1 border-t border-default space-y-3 max-w-xl">
      <div className="flex items-center justify-between">
        <div className="text-[12px] font-bold uppercase tracking-wider text-creme-mute">Voz do assistente</div>
        <label className="flex items-center gap-2 cursor-pointer">
          <span className="text-[12px] text-creme-mute">Falar respostas</span>
          <button onClick={() => set('enabled', !cfg.enabled)} className={`w-11 h-6 rounded-full relative transition-colors shrink-0 ${cfg.enabled ? 'bg-brand' : 'bg-surface-3 border border-default'}`}>
            <span className={`absolute top-[3px] w-[18px] h-[18px] rounded-full bg-white transition-all ${cfg.enabled ? 'left-[calc(100%-21px)]' : 'left-[3px]'}`} />
          </button>
        </label>
      </div>

      {/* Provedor — só premium */}
      <div className="grid grid-cols-2 gap-2">
        {(['elevenlabs', 'openai'] as VoiceProvider[]).map((p) => (
          <button
            key={p}
            onClick={() => set('provider', p)}
            className={`px-2 py-2 rounded-lg border text-[12.5px] font-semibold transition-colors ${cfg.provider === p ? 'bg-brand/10 border-brand/40 text-creme' : 'bg-surface-2 border-default text-creme-mute hover:bg-surface-hover'}`}
          >
            {p === 'elevenlabs' ? 'ElevenLabs' : 'OpenAI'}
          </button>
        ))}
      </div>

      {cfg.provider === 'elevenlabs' && (
        <div className="grid grid-cols-2 gap-2">
          <Field label="Voice ID">
            <input className="input" value={cfg.voiceId ?? ''} onChange={(e) => set('voiceId', e.target.value)} placeholder="21m00Tcm4TlvDq8ikWAM" />
          </Field>
          <Field label="Modelo">
            <select className="input" value={cfg.model ?? ELEVENLABS_MODELS[0]} onChange={(e) => set('model', e.target.value)}>
              {ELEVENLABS_MODELS.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          </Field>
        </div>
      )}

      {cfg.provider === 'openai' && (
        <div className="grid grid-cols-2 gap-2">
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
        </div>
      )}

      <Field label={`API key (${cfg.provider === 'elevenlabs' ? 'ElevenLabs' : 'OpenAI'})`}>
        <input className="input font-mono" type="password" value={cfg.apiKey ?? ''} onChange={(e) => set('apiKey', e.target.value)} placeholder="cole a chave…" />
        <p className="text-[10.5px] text-creme-faint mt-1">Guardada server-side. Requer deploy das Edge Functions tts/transcribe.</p>
      </Field>

      <button onClick={save} disabled={saving} className="flex items-center gap-2 px-4 py-2 rounded-xl text-[13px] font-semibold bg-brand text-white hover:bg-brand-bright disabled:opacity-40 transition-colors">
        {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} Salvar voz
      </button>
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
