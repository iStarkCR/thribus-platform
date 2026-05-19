/**
 * Voice — chamadas inbound/outbound + config Vapi/ElevenLabs.
 */
import { supabase } from '@/lib/supabase';
import type { VoiceCall, VoiceConfig } from '@/lib/seed-voice';

export const voiceConfigured = Boolean(import.meta.env.VITE_SUPABASE_URL);

interface CallRow {
  id: string; workspace_id: string; agent_id: string | null;
  direction: 'inbound' | 'outbound'; status: VoiceCall['status'];
  customer_name: string | null; customer_phone: string;
  duration_sec: number; cost_usd: number; recording_url: string | null;
  transcript: string | null; sentiment: number; tools_called: string[];
  outcome: VoiceCall['outcome']; started_at: string; ended_at: string | null;
}

export async function listVoiceCalls(workspaceId: string, limit = 100): Promise<VoiceCall[]> {
  if (!supabase) throw new Error('Supabase não configurado');
  const { data, error } = await supabase
    .from('voice_calls')
    .select('*')
    .eq('workspace_id', workspaceId)
    .order('started_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []).map((r) => {
    const row = r as CallRow;
    return {
      id: row.id, workspaceId: row.workspace_id, agentId: row.agent_id ?? '',
      agentName: '', direction: row.direction, status: row.status,
      customerName: row.customer_name ?? undefined, customerPhone: row.customer_phone,
      durationSec: row.duration_sec, cost: Number(row.cost_usd),
      recordingUrl: row.recording_url ?? undefined,
      transcriptAvailable: Boolean(row.transcript),
      sentiment: Number(row.sentiment), toolsCalled: row.tools_called ?? [],
      outcome: row.outcome ?? 'follow_up',
      startedAt: row.started_at, endedAt: row.ended_at ?? undefined,
    };
  });
}

export async function getVoiceConfig(workspaceId: string): Promise<VoiceConfig | null> {
  if (!supabase) return null;
  const { data } = await supabase
    .from('voice_providers_config')
    .select('*')
    .eq('workspace_id', workspaceId)
    .maybeSingle();
  if (!data) return null;
  const r = data as Record<string, unknown>;
  return {
    workspaceId: r.workspace_id as string,
    providerId: r.provider as string,
    providerName: `${r.provider} · ${r.voice_name}`,
    inboundNumber: (r.inbound_number as string) ?? '',
    outboundFromNumber: (r.outbound_from as string) ?? '',
    greetingMessage: r.greeting as string,
    fallbackToHuman: r.fallback_to_human as boolean,
    maxDurationMin: r.max_duration_min as number,
    recordCalls: r.record_calls as boolean,
    transcribeCalls: r.transcribe_calls as boolean,
  };
}
