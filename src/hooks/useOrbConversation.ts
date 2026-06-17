import { useCallback, useEffect, useRef, useState } from 'react';
import { useSession } from '@/hooks/useSession';
import { useVoice } from '@/hooks/useVoice';
import { useAppStore } from '@/hooks/useAppStore';
import { listMessages, sendMessage, subscribeChat, type ChatMessage } from '@/services/collaboratorChat';
import { listSessions, createSession, touchSession } from '@/services/chatSessions';
import { getVoiceConfig, ttsBlob, type VoiceConfig } from '@/services/voiceSkill';

const BUKOWISKI_ID = 'bukowiski-thribus';

function norm(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

/** Para o modo voz: "Bukowiski off" (ou só "off"/"desliga" no fim da fala). */
export function isStopPhrase(text: string): boolean {
  const t = norm(text).trim();
  const last = t.split(/\s+/).pop() ?? '';
  if (/^(off|ofi|ofe|of|ofis?|desliga|desligar|para|parar)$/.test(last)) return true;
  if (/[bmp]uk?[oae]?[wv]isk\w*\s+(o+f|deslig|par)/.test(t)) return true;
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
      let sid: string | null = sessions[0]?.id ?? null;
      if (!sid) {
        const s = await createSession(BUKOWISKI_ID, uid, { title: 'Conversa rápida' }).catch(() => null);
        sid = s?.id ?? null;
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
          const a = new Audio(URL.createObjectURL(blob));
          audioRef.current = a;
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

  // onResult/send/startListenOnce referenciam-se; declarados como function (hoisted).
  const startListenOnce = useCallback(() => {
    if (voice.sttSupported) voice.startListening(onResult);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [voice]);

  const stopVoice = useCallback(() => {
    setVoiceActive(false);
    voiceActiveRef.current = false;
    voice.stopListening();
    voice.cancelSpeak();
    audioRef.current?.pause();
    setSpeakingProvider(false);
  }, [voice]);

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
    setVoiceActive(true);
    voiceActiveRef.current = true;
    startListenOnce();
  }, [startListenOnce]);

  async function send(textArg: string) {
    const text = textArg.trim();
    const sid = sessionRef.current;
    if (!text || !sid || !userId) return;
    setMessages((m) => [...m, { id: `tmp-${m.length}`, sessionId: sid, agentId: BUKOWISKI_ID, userId, role: 'user', content: text, status: 'pending', channel: 'thribus', error: null, attachments: [], createdAt: '' }]);
    try {
      await sendMessage(sid, BUKOWISKI_ID, userId, text);
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
  const state: VoiceState = !voiceActive ? 'idle' : speaking ? 'speaking' : waiting ? 'thinking' : 'listening';

  return {
    messages,
    voiceActive,
    state,
    listening: voice.listening,
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
