/**
 * Seed — Canal de Voz (Vapi / ElevenLabs).
 *
 * Agente atendendo por telefone — mesmo prompt + tools, agora com STT/TTS.
 */

export type VoiceCallStatus = 'ringing' | 'in_progress' | 'completed' | 'failed' | 'voicemail';
export type VoiceDirection = 'inbound' | 'outbound';

export interface VoiceProvider {
  id: string;
  name: string;
  ttsModel: string;
  sttModel: string;
  voiceId: string;
  voiceName: string;
  language: string;
  latencyMs: number;
}

export interface VoiceCall {
  id: string;
  workspaceId: string;
  agentId: string;
  agentName: string;
  direction: VoiceDirection;
  status: VoiceCallStatus;
  customerName?: string;
  customerPhone: string;
  durationSec: number;
  cost: number;
  recordingUrl?: string;
  transcriptAvailable: boolean;
  sentiment: number;
  toolsCalled: string[];
  outcome: 'venda' | 'follow_up' | 'sem_interesse' | 'escalado' | 'caixa_postal' | 'tecnico';
  startedAt: string;
  endedAt?: string;
}

export interface VoiceConfig {
  workspaceId: string;
  providerId: string;
  providerName: string;
  inboundNumber: string;
  outboundFromNumber: string;
  greetingMessage: string;
  fallbackToHuman: boolean;
  maxDurationMin: number;
  recordCalls: boolean;
  transcribeCalls: boolean;
}

export const SEED_VOICE_PROVIDERS: VoiceProvider[] = [
  { id: 'vp_1', name: 'ElevenLabs · Maria (PT-BR)', ttsModel: 'eleven_turbo_v2_5', sttModel: 'whisper-large-v3', voiceId: 'pt-br-maria-warm', voiceName: 'Maria — calorosa, regional sul', language: 'pt-BR', latencyMs: 420 },
  { id: 'vp_2', name: 'Vapi · Camila (PT-BR)', ttsModel: 'azure-neural', sttModel: 'deepgram-nova-2', voiceId: 'pt-br-camila', voiceName: 'Camila — neutra, corporativa', language: 'pt-BR', latencyMs: 380 },
];

export const SEED_VOICE_CONFIG: VoiceConfig = {
  workspaceId: 'ws_texnet',
  providerId: 'vp_1',
  providerName: 'ElevenLabs · Maria (PT-BR)',
  inboundNumber: '+55 53 3000-1234',
  outboundFromNumber: '+55 53 3000-1234',
  greetingMessage: 'TexNet, fala a Bianca. Em que posso te ajudar?',
  fallbackToHuman: true,
  maxDurationMin: 12,
  recordCalls: true,
  transcribeCalls: true,
};

export const SEED_VOICE_CALLS: VoiceCall[] = [
  { id: 'vc_1', workspaceId: 'ws_texnet', agentId: 'agent_bianca', agentName: 'Bianca', direction: 'inbound', status: 'completed', customerName: 'Joana Pires', customerPhone: '+5553988112233', durationSec: 248, cost: 0.94, recordingUrl: '#rec-1', transcriptAvailable: true, sentiment: 0.7, toolsCalled: ['consultar_viabilidade', 'rag.query'], outcome: 'venda', startedAt: '2026-05-16T11:32:00Z', endedAt: '2026-05-16T11:36:08Z' },
  { id: 'vc_2', workspaceId: 'ws_texnet', agentId: 'agent_renata', agentName: 'Renata', direction: 'inbound', status: 'completed', customerName: 'Roberto Lima', customerPhone: '+5553966554433', durationSec: 240, cost: 0.91, recordingUrl: '#rec-2', transcriptAvailable: true, sentiment: 0.5, toolsCalled: ['ixc_consulta_cliente', 'ixc_incidentes_regiao'], outcome: 'tecnico', startedAt: '2026-05-15T16:44:00Z', endedAt: '2026-05-15T16:48:00Z' },
  { id: 'vc_3', workspaceId: 'ws_texnet', agentId: 'agent_marcos', agentName: 'Marcos', direction: 'outbound', status: 'completed', customerName: 'Aline Souza', customerPhone: '+5553977665544', durationSec: 182, cost: 0.69, transcriptAvailable: true, sentiment: -0.2, toolsCalled: ['ixc_segunda_via'], outcome: 'follow_up', startedAt: '2026-05-15T14:20:00Z', endedAt: '2026-05-15T14:23:02Z' },
  { id: 'vc_4', workspaceId: 'ws_texnet', agentId: 'agent_bianca', agentName: 'Bianca', direction: 'outbound', status: 'voicemail', customerName: 'Marcos Antônio', customerPhone: '+5553999887766', durationSec: 38, cost: 0.14, transcriptAvailable: false, sentiment: 0, toolsCalled: [], outcome: 'caixa_postal', startedAt: '2026-05-15T11:00:00Z', endedAt: '2026-05-15T11:00:38Z' },
  { id: 'vc_5', workspaceId: 'ws_texnet', agentId: 'agent_bianca', agentName: 'Bianca', direction: 'inbound', status: 'completed', customerName: 'Pedro Henrique', customerPhone: '+5553944112200', durationSec: 412, cost: 1.56, recordingUrl: '#rec-5', transcriptAvailable: true, sentiment: 0.4, toolsCalled: ['consultar_viabilidade'], outcome: 'sem_interesse', startedAt: '2026-05-14T18:14:00Z', endedAt: '2026-05-14T18:20:52Z' },
  { id: 'vc_6', workspaceId: 'ws_texnet', agentId: 'agent_renata', agentName: 'Renata', direction: 'inbound', status: 'completed', customerName: 'Beatriz Lima', customerPhone: '+5553911223344', durationSec: 521, cost: 1.97, recordingUrl: '#rec-6', transcriptAvailable: true, sentiment: 0.6, toolsCalled: ['ixc_consulta_cliente', 'ixc_agendar_visita'], outcome: 'escalado', startedAt: '2026-05-14T10:00:00Z', endedAt: '2026-05-14T10:08:41Z' },
];
