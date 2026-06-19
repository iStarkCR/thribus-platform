import { useCallback, useEffect, useRef, useState } from 'react';
import { useSession } from '@/hooks/useSession';
import { useAppStore } from '@/hooks/useAppStore';
import { listMessages, sendMessage, subscribeChat, type ChatMessage } from '@/services/collaboratorChat';
import { listSessions, createSession, touchSession } from '@/services/chatSessions';
import { ttsBlob, transcribeBlob } from '@/services/voiceSkill';
import { VoiceController, type VoiceState as RawVoiceState } from '@/lib/voiceMode';

const BUKOWISKI_ID = 'bukowiski-thribus';
const ORB_SESSION_KEY = 'orbSessionId'; // sessão dedicada do orbe (não compartilha c/ o painel)

function norm(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

/** Para o modo voz: "off", "para", "chega", "tchau"… (ou "Bukowiski <comando>"). */
export function isStopPhrase(text: string): boolean {
  const t = norm(text).trim();
  const last = t.split(/\s+/).pop() ?? '';
  if (/^(o+f+|o+fi|o+fe|deslig\w*|par\w*|pare|cheg\w*|tchau|stop|encerr\w*|fech\w*|sai|sair|silencio)$/.test(last)) return true;
  if (/[bmp]uk?[oae]?[wv]i?sk?\w*\s+(o+f|deslig|par|cheg|tchau|stop|encerr|fech|sai|silenci)/.test(t)) return true;
  return false;
}

// Alucinações do Whisper sobre silêncio.
function isNoise(t: string): boolean {
  const s = t.toLowerCase().trim();
  if (s.length < 2) return true;
  return /amara\.org|legendas?\s+(pela|by)|subtitles?\s+by|obrigad[oa] por (assistir|ver)|^muito obrigad|♪|\[(música|musica|aplausos|risos)\]/i.test(s);
}

export type VoiceState = 'idle' | 'listening' | 'thinking' | 'speaking';
const mapState = (s: RawVoiceState): VoiceState =>
  s === 'processing' ? 'thinking' : s === 'playing' ? 'speaking' : s === 'idle' ? 'idle' : 'listening';

/**
 * Conversa única com o Bukowiski (texto + voz). O modo voz usa o VoiceController
 * (motor contínuo, portado do CORTEX): mic aberto o tempo todo, VAD por energia,
 * fala a resposta em frases. O OrbChat é só a view de texto da mesma conversa.
 */
export function useOrbConversation() {
  const { user } = useSession();
  const userId = user?.id ?? null;

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [voiceActive, setVoiceActive] = useState(false);
  const [state, setState] = useState<VoiceState>('idle');

  const sessionRef = useRef<string | null>(null);
  const ctrlRef = useRef<VoiceController | null>(null);
  const inputSinkRef = useRef<((t: string) => void) | null>(null);
  // resolver da resposta atual (turn-based): a próxima msg assistant 'done' resolve.
  const pendingReplyRef = useRef<((s: string) => void) | null>(null);
  useEffect(() => { sessionRef.current = sessionId; }, [sessionId]);

  // ─── Sessão dedicada do orbe (localStorage) + mensagens ─────────────────────
  useEffect(() => {
    if (!userId) return;
    const uid = userId;
    let alive = true;
    (async () => {
      const sessions = await listSessions(BUKOWISKI_ID, uid).catch(() => []);
      const stored = typeof localStorage !== 'undefined' ? localStorage.getItem(ORB_SESSION_KEY) : null;
      let sid: string | null = stored && sessions.some((s) => s.id === stored) ? stored : null;
      if (!sid) {
        const s = await createSession(BUKOWISKI_ID, uid, { title: 'Orbe — conversa rápida' }).catch(() => null);
        sid = s?.id ?? null;
        if (sid && typeof localStorage !== 'undefined') localStorage.setItem(ORB_SESSION_KEY, sid);
      }
      if (!alive) return;
      setSessionId(sid);
      if (sid) setMessages(await listMessages(sid).catch(() => []));
    })();
    return () => { alive = false; };
  }, [userId]);

  const refetch = useCallback(async () => {
    const sid = sessionRef.current;
    if (!sid) return;
    setMessages(await listMessages(sid).catch(() => []));
  }, []);

  useEffect(() => {
    if (!userId) return;
    return subscribeChat(userId, refetch);
  }, [userId, refetch]);

  // Resolve a resposta pendente quando a msg assistant 'done' chega (realtime).
  useEffect(() => {
    if (messages.length === 0 || !pendingReplyRef.current) return;
    const last = messages[messages.length - 1];
    if (last.role === 'assistant' && last.status === 'done') {
      const resolve = pendingReplyRef.current;
      pendingReplyRef.current = null;
      resolve(last.content);
    }
  }, [messages]);

  async function ensureSession(uid: string): Promise<string | null> {
    if (sessionRef.current) return sessionRef.current;
    const s = await createSession(BUKOWISKI_ID, uid, { title: 'Orbe — conversa rápida' }).catch(() => null);
    if (s) {
      setSessionId(s.id);
      sessionRef.current = s.id;
      if (typeof localStorage !== 'undefined') localStorage.setItem(ORB_SESSION_KEY, s.id);
    }
    return sessionRef.current;
  }

  // Envia o texto e RESOLVE com a resposta do daemon (via realtime). Recria a
  // sessão se ela sumiu (FK). Usado pelo modo voz e pelo chat de texto.
  const sendAndAwait = useCallback(async (textArg: string): Promise<string> => {
    const text = textArg.trim();
    if (!text || !userId) return '';
    let sid = await ensureSession(userId);
    if (!sid) return '';
    setMessages((m) => [...m, { id: `tmp-${m.length}`, sessionId: sid as string, agentId: BUKOWISKI_ID, userId, role: 'user', content: text, status: 'pending', channel: 'thribus', error: null, attachments: [], createdAt: '' }]);
    try {
      try {
        await sendMessage(sid, BUKOWISKI_ID, userId, text);
      } catch (e) {
        if (!/foreign key|violates|constraint/i.test((e as Error).message)) throw e;
        setSessionId(null); sessionRef.current = null;
        sid = await ensureSession(userId);
        if (!sid) throw e;
        await sendMessage(sid, BUKOWISKI_ID, userId, text);
      }
      await touchSession(sid);
    } catch (e) {
      setMessages((m) => m.filter((x) => !x.id.startsWith('tmp-')));
      useAppStore.getState().addToast('Falha ao enviar: ' + (e as Error).message, 'red');
      return '';
    }
    // aguarda a resposta do daemon (realtime) — timeout de segurança em 4min
    return await new Promise<string>((resolve) => {
      pendingReplyRef.current = resolve;
      setTimeout(() => { if (pendingReplyRef.current === resolve) { pendingReplyRef.current = null; resolve(''); } }, 240000);
    });
  }, [userId]);

  // ─── Modo voz (VoiceController) ─────────────────────────────────────────────
  const startVoice = useCallback(() => {
    if (ctrlRef.current) return;
    const ctrl = new VoiceController({
      transcribe: async (blob) => (await transcribeBlob(BUKOWISKI_ID, blob)) ?? '',
      tts: (txt) => ttsBlob(BUKOWISKI_ID, txt),
      sendAndAwait,
      isNoise,
      onState: (s) => setState(mapState(s)),
      onTranscript: (t) => { if (isStopPhrase(t)) stopVoice(); },
      onError: (e) => useAppStore.getState().addToast(e.message, 'red'),
    });
    ctrlRef.current = ctrl;
    setVoiceActive(true);
    ctrl.start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sendAndAwait]);

  const stopVoice = useCallback(() => {
    ctrlRef.current?.stop();
    ctrlRef.current = null;
    pendingReplyRef.current = null;
    setVoiceActive(false);
    setState('idle');
  }, []);

  useEffect(() => () => { ctrlRef.current?.stop(); ctrlRef.current = null; }, []);

  // Chat de texto (OrbChat) — envia sem TTS.
  const send = useCallback((textArg: string) => { void sendAndAwait(textArg).then(() => refetch()); }, [sendAndAwait, refetch]);

  const waiting = messages.length > 0 && messages[messages.length - 1].role === 'user' && ['pending', 'processing'].includes(messages[messages.length - 1].status);

  return {
    messages,
    voiceActive,
    state,
    listening: state === 'listening',
    speaking: state === 'speaking',
    waiting,
    sttSupported: typeof navigator !== 'undefined' && !!navigator.mediaDevices,
    send,
    startVoice,
    stopVoice,
    bindInputSink: (fn: ((t: string) => void) | null) => { inputSinkRef.current = fn; },
    listenForInput: () => { /* push-to-talk do input: usa o modo voz */ },
  };
}

export type OrbConversation = ReturnType<typeof useOrbConversation>;
