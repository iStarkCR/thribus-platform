/**
 * Skill de Voz — config por colaborador + clients das Edge Functions tts/transcribe.
 * provider='browser' usa voz nativa (sem backend). elevenlabs/openai via edge function.
 */

import { supabase } from '@/lib/supabase';

export type VoiceProvider = 'browser' | 'elevenlabs' | 'openai';

export interface VoiceConfig {
  enabled: boolean;
  provider: VoiceProvider;
  voiceId: string | null;
  model: string | null;
  apiKey: string | null;
  sttEnabled: boolean;
}

export const DEFAULT_VOICE_CONFIG: VoiceConfig = {
  enabled: false,
  provider: 'elevenlabs',
  voiceId: null,
  model: null,
  apiKey: null,
  sttEnabled: true,
};

export const OPENAI_VOICES = ['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer'];
export const OPENAI_MODELS = ['tts-1', 'tts-1-hd'];
export const ELEVENLABS_MODELS = ['eleven_multilingual_v2', 'eleven_turbo_v2_5', 'eleven_flash_v2_5'];

export async function getVoiceConfig(agentId: string): Promise<VoiceConfig | null> {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('agent_voice_config')
    .select('enabled,provider,voice_id,model,api_key,stt_enabled')
    .eq('agent_id', agentId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return {
    enabled: data.enabled,
    provider: data.provider,
    voiceId: data.voice_id,
    model: data.model,
    apiKey: data.api_key,
    sttEnabled: data.stt_enabled,
  };
}

export async function saveVoiceConfig(agentId: string, cfg: VoiceConfig): Promise<void> {
  if (!supabase) throw new Error('Supabase não configurado');
  const { error } = await supabase.from('agent_voice_config').upsert(
    {
      agent_id: agentId,
      enabled: cfg.enabled,
      provider: cfg.provider,
      voice_id: cfg.voiceId,
      model: cfg.model,
      api_key: cfg.apiKey,
      stt_enabled: cfg.sttEnabled,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'agent_id' },
  );
  if (error) throw error;
}

/** TTS via provider configurado. Retorna Blob de áudio, ou null se for navegador. */
export async function ttsBlob(agentId: string, text: string): Promise<Blob | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.functions.invoke('tts', { body: { agentId, text } });
  if (error) throw error;
  if (data instanceof Blob && data.type.includes('audio')) return data;
  return null;
}

/** Transcreve áudio via Whisper (OpenAI). Retorna texto ou null. */
export async function transcribeBlob(agentId: string, audio: Blob): Promise<string | null> {
  if (!supabase) return null;
  const form = new FormData();
  form.append('audio', audio, 'audio.webm');
  form.append('agentId', agentId);
  const { data, error } = await supabase.functions.invoke('transcribe', { body: form });
  if (error) throw error;
  return (data as { text?: string })?.text ?? null;
}
