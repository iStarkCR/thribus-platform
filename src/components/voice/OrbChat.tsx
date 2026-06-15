import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { X, Send, Mic, Loader2, AudioLines } from 'lucide-react';
import { useSession } from '@/hooks/useSession';
import { useVoice } from '@/hooks/useVoice';
import { useAppStore } from '@/hooks/useAppStore';
import { NeuralSphere } from '@/components/visual/NeuralSphere';
import { listMessages, sendMessage, subscribeChat, type ChatMessage } from '@/services/collaboratorChat';
import { listSessions, createSession, touchSession } from '@/services/chatSessions';
import { getVoiceConfig, ttsBlob, type VoiceConfig } from '@/services/voiceSkill';

const BUKOWISKI_ID = 'bukowiski-thribus';
const PANEL_W = 360;
const PANEL_H = 460;

/** Para o modo voz: "Bukowiski chega" (ou só "chega"). */
function isStopPhrase(text: string): boolean {
  const t = text.trim().toLowerCase().replace(/[.,!?]/g, '');
  return /^(ok\s+|ei\s+)?buk?o?[wv]isk\w*\s+chega\b/.test(t) || /^chega$/.test(t) || /\bbuk?o?[wv]isk\w*\s+chega\b/.test(t);
}

/**
 * Conversa direta com o Bukowiski ancorada no orbe. Texto + voz. Quando ativado
 * por voz (wake word), ele responde falando; "Bukowiski chega" encerra.
 */
export function OrbChat({ orb, onClose, startVoiceSignal }: { orb: { x: number; y: number; size: number }; onClose: () => void; startVoiceSignal: number }) {
  const { user } = useSession();
  const userId = user?.id ?? null;
  const voice = useVoice();

  const [sessionId, setSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [voiceOn, setVoiceOn] = useState(false);
  const [speakingProvider, setSpeakingProvider] = useState(false);

  const voiceOnRef = useRef(false);
  const sessionRef = useRef<string | null>(null);
  const spokenRef = useRef<string | null>(null);
  const cfgRef = useRef<VoiceConfig | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => { voiceOnRef.current = voiceOn; }, [voiceOn]);
  useEffect(() => { sessionRef.current = sessionId; }, [sessionId]);

  // Posição do painel — ancorado ao orbe, dentro da viewport.
  const style = useMemo(() => {
    const vw = window.innerWidth, vh = window.innerHeight;
    let left = orb.x + orb.size - PANEL_W;
    let top = orb.y - PANEL_H - 10;
    if (top < 12) top = orb.y + orb.size + 10; // sem espaço acima → abre abaixo
    left = Math.min(Math.max(12, left), vw - PANEL_W - 12);
    top = Math.min(Math.max(12, top), vh - PANEL_H - 12);
    return { left, top, width: PANEL_W, height: PANEL_H };
  }, [orb.x, orb.y, orb.size]);

  // Sessão + mensagens + realtime.
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

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  // ─── Voz ─────────────────────────────────────────────────────────────────
  const speakReply = useCallback(async (text: string, onEnd?: () => void) => {
    const cfg = cfgRef.current;
    if (cfg?.enabled && cfg.provider !== 'browser') {
      try {
        const blob = await ttsBlob(BUKOWISKI_ID, text);
        if (blob) {
          const audio = new Audio(URL.createObjectURL(blob));
          audioRef.current = audio;
          setSpeakingProvider(true);
          const done = () => { setSpeakingProvider(false); onEnd?.(); };
          audio.onended = done; audio.onerror = done;
          await audio.play();
          return;
        }
      } catch { /* cai pro navegador */ }
    }
    voice.speak(text, onEnd);
  }, [voice]);

  const startListenOnce = useCallback(() => {
    if (voice.sttSupported) voice.startListening(onVoiceResult);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [voice]);

  const stopVoice = useCallback(() => {
    setVoiceOn(false);
    voiceOnRef.current = false;
    voice.stopListening();
    voice.cancelSpeak();
    audioRef.current?.pause();
    setSpeakingProvider(false);
  }, [voice]);

  const startVoice = useCallback(() => {
    setVoiceOn(true);
    voiceOnRef.current = true;
    startListenOnce();
  }, [startListenOnce]);

  function onVoiceResult(text: string) {
    if (voiceOnRef.current) {
      if (isStopPhrase(text)) { stopVoice(); onClose(); return; }
      send(text);
    } else {
      setInput((cur) => (cur ? `${cur} ${text}` : text));
    }
  }

  // Sinal externo (wake word) → liga o modo voz.
  useEffect(() => {
    if (startVoiceSignal > 0) startVoice();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startVoiceSignal]);

  // Fala a última resposta quando em modo voz; depois volta a ouvir.
  useEffect(() => {
    if (messages.length === 0) return;
    const last = messages[messages.length - 1];
    if (last.role === 'assistant' && last.status === 'done' && last.id !== spokenRef.current) {
      spokenRef.current = last.id;
      if (voiceOnRef.current) speakReply(last.content, () => { if (voiceOnRef.current) startListenOnce(); });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages]);

  useEffect(() => () => { voice.stopListening(); voice.cancelSpeak(); audioRef.current?.pause(); }, [voice]);

  async function send(textArg?: string) {
    const text = (textArg ?? input).trim();
    const sid = sessionRef.current;
    if (!text || !sid || !userId || sending) return;
    setInput('');
    setSending(true);
    setMessages((m) => [...m, { id: `tmp-${m.length}`, sessionId: sid, agentId: BUKOWISKI_ID, userId, role: 'user', content: text, status: 'pending', channel: 'thribus', error: null, createdAt: '' }]);
    try {
      await sendMessage(sid, BUKOWISKI_ID, userId, text);
      await touchSession(sid);
      await refetch();
    } catch (e) {
      setMessages((m) => m.filter((x) => !x.id.startsWith('tmp-')));
      useAppStore.getState().addToast('Falha ao enviar: ' + (e as Error).message, 'red');
    } finally {
      setSending(false);
    }
  }

  const micToggle = () => (voiceOn ? stopVoice() : startVoice());
  const listening = voice.listening;
  const speaking = voice.speaking || speakingProvider;
  const waiting = messages.length > 0 && messages[messages.length - 1].role === 'user' && ['pending', 'processing'].includes(messages[messages.length - 1].status);

  return (
    <div className="fixed z-[61] flex flex-col rounded-2xl border border-default bg-surface-1/95 backdrop-blur-xl shadow-2xl overflow-hidden" style={style}>
      {/* Cabeçalho */}
      <div className="flex items-center justify-between gap-2 px-3.5 py-2.5 border-b border-default shrink-0">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="relative w-8 h-8 rounded-full overflow-hidden border border-brand/40 bg-[#0a0f0b] shrink-0">
            <div className="absolute -inset-[14%]"><NeuralSphere className="absolute inset-0" intensity={voiceOn ? 0.85 : 0.3} speedMultiplier={1.4} interactionMultiplier={0} parallaxMultiplier={0} ambient={false} connectScale={0.55} /></div>
          </div>
          <div className="min-w-0">
            <div className="text-[13.5px] font-bold text-creme leading-tight">Bukowiski</div>
            <div className="text-[10.5px] text-creme-faint leading-tight">
              {speaking ? 'respondendo…' : waiting ? 'pensando…' : listening ? 'ouvindo…' : voiceOn ? 'modo voz' : 'COO · agente principal'}
            </div>
          </div>
        </div>
        <button onClick={() => { stopVoice(); onClose(); }} title="Fechar" className="w-7 h-7 rounded-lg text-creme-faint hover:text-creme hover:bg-surface-hover flex items-center justify-center shrink-0"><X size={15} /></button>
      </div>

      {/* Thread */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-3 space-y-2.5 min-h-0">
        {messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center gap-2 px-3">
            <div className="relative w-16 h-16 rounded-full overflow-hidden border border-brand/30 bg-[#0a0f0b]">
              <div className="absolute -inset-[14%]"><NeuralSphere className="absolute inset-0" intensity={0.3} speedMultiplier={1.3} interactionMultiplier={0} parallaxMultiplier={0} ambient={false} connectScale={0.55} /></div>
            </div>
            <div className="text-[12.5px] text-creme-mute">Fale ou escreva — diga <span className="font-semibold text-creme">"Bukowiski"</span> e ele responde. <span className="font-semibold text-creme">"Bukowiski chega"</span> encerra.</div>
          </div>
        ) : (
          messages.map((m) => (
            <div key={m.id} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[82%] px-3 py-2 rounded-2xl text-[13px] leading-relaxed whitespace-pre-wrap ${m.role === 'user' ? 'bg-brand text-white rounded-br-sm' : 'bg-surface-2 text-creme border border-default rounded-bl-sm'}`}>{m.content}</div>
            </div>
          ))
        )}
        {waiting && (
          <div className="flex justify-start"><div className="px-3 py-2 rounded-2xl bg-surface-2 border border-default text-creme-faint text-[12px] flex items-center gap-1.5"><Loader2 size={12} className="animate-spin" /> Bukowiski está pensando…</div></div>
        )}
      </div>

      {/* Entrada */}
      <div className="px-2.5 py-2.5 border-t border-default shrink-0">
        <div className="flex items-end gap-1.5 bg-surface-2 border border-default rounded-xl px-2 py-1.5">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
            rows={1}
            placeholder={listening ? 'Ouvindo… fale agora' : 'Mensagem para o Bukowiski…'}
            className="flex-1 resize-none bg-transparent px-1 py-1 text-[13px] text-creme placeholder-creme-faint focus:outline-none max-h-28"
          />
          {voice.sttSupported && (
            <button onClick={micToggle} title={voiceOn ? 'Parar modo voz' : 'Modo voz'} className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 transition-colors ${voiceOn ? 'bg-brand/15 text-brand-bright' : listening ? 'bg-semantic-red/15 text-semantic-red animate-pulse' : 'text-creme-faint hover:text-creme hover:bg-surface-hover'}`}>
              {voiceOn ? <AudioLines size={16} className="animate-pulse" /> : <Mic size={16} />}
            </button>
          )}
          <button onClick={() => send()} disabled={sending || !input.trim()} className="w-8 h-8 rounded-lg bg-brand text-white flex items-center justify-center shrink-0 disabled:opacity-40 hover:bg-brand-bright transition-colors">
            {sending ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
          </button>
        </div>
      </div>
    </div>
  );
}
