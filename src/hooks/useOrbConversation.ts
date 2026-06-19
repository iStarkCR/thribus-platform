import { useCallback, useEffect, useRef, useState } from 'react';
import { useSession } from '@/hooks/useSession';
import { useVoice } from '@/hooks/useVoice';
import { useWhisperMic } from '@/hooks/useWhisperMic';
import { useAppStore } from '@/hooks/useAppStore';
import { listMessages, sendMessage, subscribeChat, type ChatMessage } from '@/services/collaboratorChat';
import { listSessions, createSession, touchSession } from '@/services/chatSessions';
import { getVoiceConfig, ttsBlob, type VoiceConfig } from '@/services/voiceSkill';

const BUKOWISKI_ID = 'bukowiski-thribus';
const ORB_SESSION_KEY = 'orbSessionId'; // sessão dedicada do orbe (não compartilha c/ o painel)
// WAV silencioso — tocado no gesto do clique pra destravar autoplay do <audio>.
const SILENCE = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=';

function norm(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

/** Para o modo voz: "off", "para", "chega", "tchau"… (ou "Bukowiski <comando>"). */
export function isStopPhrase(text: string): boolean {
  const t = norm(text).trim();
  const last = t.split(/\s+/).pop() ?? '';
  // comando solto no fim da fala
  if (/^(o+f+|o+fi|o+fe|deslig\w*|par\w*|pare|cheg\w*|tchau|stop|encerr\w*|fech\w*|sai|sair|silencio)$/.test(last)) return true;
  // "bukowiski <comando>" (nome mal transcrito incluso)
  if (/[bmp]uk?[oae]?[wv]i?sk?\w*\s+(o+f|deslig|par|cheg|tchau|stop|encerr|fech|sai|silenci)/.test(t)) return true;
  return false;
}

export type VoiceState = 'idle' | 'listening' | 'thinking' | 'speaking';

/**
 * Conversa única com o Bukowiski (texto + voz). O orbe usa pra falar por voz
 * (sem UI) e o chat popover é só uma view da mesma conversa.
 */
export function useOrbConversation() {
  const { user } = useSession();
  const userId = user?.id ?? null;
  const voice = useVoice();
  const whisper = useWhisperMic(BUKOWISKI_ID);
  const speakingRef = useRef(false);

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [voiceActive, setVoiceActive] = useState(false);
  const [speakingProvider, setSpeakingProvider] = useState(false);

  const voiceActiveRef = useRef(false);
  const sessionRef = useRef<string | null>(null);
  const waitingRef = useRef(false);
  const spokenRef = useRef<string | null>(null);
  const cfgRef = useRef<VoiceConfig | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  useEffect(() => { voiceActiveRef.current = voiceActive; }, [voiceActive]);
  useEffect(() => { sessionRef.current = sessionId; }, [sessionId]);

  // Sessão (reusa a do Bukowiski ou cria) + config de voz.
  useEffect(() => {
    if (!userId) return;
    const uid = userId;
    let alive = true;
    (async () => {
      const sessions = await listSessions(BUKOWISKI_ID, uid).catch(() => []);
      // Sessão DEDICADA do orbe (guardada no localStorage) — separada das
      // conversas do painel. Reusa se ainda existir; senão cria a do orbe.
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
    getVoiceConfig(BUKOWISKI_ID).then((c) => { cfgRef.current = c; }).catch(() => {});
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

  const speakReply = useCallback(async (text: string, onEnd?: () => void) => {
    const cfg = cfgRef.current;
    if (cfg?.enabled && cfg.provider !== 'browser') {
      try {
        const blob = await ttsBlob(BUKOWISKI_ID, text);
        if (blob) {
          // Reusa o <audio> já destravado no clique (autoplay) em vez de criar um novo.
          const a = audioRef.current ?? (audioRef.current = new Audio());
          a.muted = false;
          a.src = URL.createObjectURL(blob);
          setSpeakingProvider(true);
          const done = () => { setSpeakingProvider(false); onEnd?.(); };
          a.onended = done; a.onerror = done;
          await a.play();
          return;
        }
      } catch { /* cai pro navegador */ }
    }
    voice.speak(text, onEnd);
  }, [voice]);

  // onResult/onIdle/send/startListenOnce referenciam-se; hoisted como function.
  const startListenOnce = useCallback(() => {
    const cfg = cfgRef.current;
    // STT do backend (Whisper) quando o agente é OpenAI — transcrição precisa.
    // Senão, Web Speech do navegador (fallback).
    if (cfg?.provider === 'openai' && cfg.sttEnabled) {
      whisper.capture((t) => { if (t) onResult(t); else onIdle(); });
    } else if (voice.sttSupported) {
      voice.startListening(onResult, onIdle);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [voice, whisper]);

  // STT terminou sem captura (silêncio/timeout): se ainda em modo voz e sem
  // resposta pendente nem falando, re-arma o mic — senão trava em "Ouvindo".
  function onIdle() {
    if (voiceActiveRef.current && !waitingRef.current) {
      setTimeout(() => { if (voiceActiveRef.current && !waitingRef.current && !speakingRef.current) startListenOnce(); }, 350);
    }
  }

  const stopVoice = useCallback(() => {
    setVoiceActive(false);
    voiceActiveRef.current = false;
    whisper.cancel();
    voice.stopListening();
    voice.cancelSpeak();
    audioRef.current?.pause();
    setSpeakingProvider(false);
  }, [voice, whisper]);

  function onResult(text: string) {
    if (!voiceActiveRef.current) { setInputFromVoice(text); return; }
    if (isStopPhrase(text)) { stopVoice(); return; }
    if (waitingRef.current) return; // turn-based: espera a resposta
    send(text);
  }

  // Quando não está em modo voz (transcrição p/ input), o consumidor injeta.
  const inputSinkRef = useRef<((t: string) => void) | null>(null);
  function setInputFromVoice(text: string) { inputSinkRef.current?.(text); }

  const startVoice = useCallback(() => {
    voice.unlock(); // destrava o speechSynthesis (fallback) dentro do gesto do clique
    // destrava autoplay do <audio> do TTS backend tocando um silêncio no gesto
    try {
      const a = audioRef.current ?? (audioRef.current = new Audio());
      a.muted = true;
      a.src = SILENCE;
      a.play().catch(() => {});
    } catch { /* noop */ }
    setVoiceActive(true);
    voiceActiveRef.current = true;
    startListenOnce();
  }, [voice, startListenOnce]);

  // Garante uma sessão do orbe válida (recria se a do localStorage sumiu).
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

  async function send(textArg: string) {
    const text = textArg.trim();
    if (!text || !userId) return;
    let sid = await ensureSession(userId);
    if (!sid) return;
    setMessages((m) => [...m, { id: `tmp-${m.length}`, sessionId: sid as string, agentId: BUKOWISKI_ID, userId, role: 'user', content: text, status: 'pending', channel: 'thribus', error: null, attachments: [], createdAt: '' }]);
    try {
      try {
        await sendMessage(sid, BUKOWISKI_ID, userId, text);
      } catch (e) {
        // sessão sumiu (FK violation) → recria do zero e reenvia
        if (!/foreign key|violates|constraint/i.test((e as Error).message)) throw e;
        setSessionId(null); sessionRef.current = null;
        sid = await ensureSession(userId);
        if (!sid) throw e;
        await sendMessage(sid, BUKOWISKI_ID, userId, text);
      }
      await touchSession(sid);
      await refetch();
    } catch (e) {
      setMessages((m) => m.filter((x) => !x.id.startsWith('tmp-')));
      useAppStore.getState().addToast('Falha ao enviar: ' + (e as Error).message, 'red');
    }
  }

  // Fala a última resposta quando em modo voz; depois volta a ouvir.
  useEffect(() => {
    if (messages.length === 0) return;
    const last = messages[messages.length - 1];
    if (last.role === 'assistant' && last.status === 'done' && last.id !== spokenRef.current) {
      spokenRef.current = last.id;
      if (voiceActiveRef.current) speakReply(last.content, () => { if (voiceActiveRef.current) startListenOnce(); });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages]);

  useEffect(() => () => { voice.stopListening(); voice.cancelSpeak(); audioRef.current?.pause(); }, [voice]);

  const waiting = messages.length > 0 && messages[messages.length - 1].role === 'user' && ['pending', 'processing'].includes(messages[messages.length - 1].status);
  waitingRef.current = waiting;

  const speaking = voice.speaking || speakingProvider;
  speakingRef.current = speaking;
  const state: VoiceState = !voiceActive
    ? 'idle'
    : speaking
      ? 'speaking'
      : (waiting || whisper.transcribing)
        ? 'thinking'
        : 'listening';

  return {
    messages,
    voiceActive,
    state,
    listening: voice.listening || whisper.recording,
    speaking,
    waiting,
    sttSupported: voice.sttSupported,
    send,
    startVoice,
    stopVoice,
    /** Liga a transcrição (mic fora do modo voz) a um setter de input. */
    bindInputSink: (fn: ((t: string) => void) | null) => { inputSinkRef.current = fn; },
    listenForInput: () => { if (voice.listening) voice.stopListening(); else startListenOnce(); },
  };
}

export type OrbConversation = ReturnType<typeof useOrbConversation>;
