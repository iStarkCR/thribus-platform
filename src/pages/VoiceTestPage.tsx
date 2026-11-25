import { useCallback, useEffect, useRef, useState } from 'react';
import { Mic, MicOff, PhoneOff, Loader2, AlertTriangle } from 'lucide-react';
import { clsx } from 'clsx';
import { isTauri } from '@/lib/native';
import {
  createRealtimeSession,
  realtimeConfigured,
  OPENAI_REALTIME_CALLS_URL,
} from '@/services/realtime';

/**
 * VoiceTestPage — Fase 1 da voz real-time (OpenAI Realtime API via WebRTC).
 *
 * ESCOPO MÍNIMO: provar que dá pra (1) pedir permissão de mic, (2) abrir WebRTC
 * com a OpenAI usando token efêmero do relay, (3) trocar áudio ao vivo.
 * NÃO implementa function-calling pro daemon (Fase 2) — a sessão sobe sem tools.
 *
 * Risco conhecido: getUserMedia dentro do WKWebView (Tauri). No macOS precisa de
 * NSMicrophoneUsageDescription + entitlement de áudio; no iOS, WKWebView só expõe
 * getUserMedia a partir do iOS 14.3 e exige a usage description no Info.plist.
 * Esta tela loga qualquer falha de getUserMedia no console/status pra diagnóstico.
 */

type Status =
  | 'idle'
  | 'requesting-mic'
  | 'fetching-token'
  | 'connecting'
  | 'connected'
  | 'error';

const STATUS_LABEL: Record<Status, string> = {
  idle: 'ocioso',
  'requesting-mic': 'pedindo permissão de mic…',
  'fetching-token': 'obtendo token efêmero…',
  connecting: 'conectando WebRTC…',
  connected: 'conectado — pode falar',
  error: 'erro',
};

export function VoiceTestPage() {
  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState<string>('');
  const [level, setLevel] = useState(0); // 0..1 nível do mic
  const [log, setLog] = useState<string[]>([]);

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const audioElRef = useRef<HTMLAudioElement | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const rafRef = useRef<number | null>(null);

  const addLog = useCallback((line: string) => {
    // eslint-disable-next-line no-console
    console.log('[voice-test]', line);
    setLog((l) => [`${new Date().toLocaleTimeString('pt-BR')}  ${line}`, ...l].slice(0, 40));
  }, []);

  const cleanup = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    audioCtxRef.current?.close().catch(() => {});
    audioCtxRef.current = null;
    micStreamRef.current?.getTracks().forEach((t) => t.stop());
    micStreamRef.current = null;
    pcRef.current?.close();
    pcRef.current = null;
    setLevel(0);
  }, []);

  useEffect(() => cleanup, [cleanup]);

  // Medidor de nível de áudio do mic (RMS via AnalyserNode).
  const startMeter = useCallback((stream: MediaStream) => {
    const ctx = new AudioContext();
    audioCtxRef.current = ctx;
    const src = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 512;
    src.connect(analyser);
    const buf = new Uint8Array(analyser.frequencyBinCount);
    const tick = () => {
      analyser.getByteTimeDomainData(buf);
      let sum = 0;
      for (let i = 0; i < buf.length; i++) {
        const v = (buf[i] - 128) / 128;
        sum += v * v;
      }
      setLevel(Math.min(1, Math.sqrt(sum / buf.length) * 3));
      rafRef.current = requestAnimationFrame(tick);
    };
    tick();
  }, []);

  const connect = useCallback(async () => {
    setError('');
    try {
      // 1) Permissão de mic — o ponto de risco no WKWebView.
      setStatus('requesting-mic');
      addLog(`contexto: ${isTauri() ? 'Tauri/WKWebView nativo' : 'browser'}`);
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error(
          'navigator.mediaDevices.getUserMedia indisponível neste runtime ' +
            '(provável bloqueio do WKWebView / falta de permissão no Info.plist).',
        );
      }
      const mic = await navigator.mediaDevices.getUserMedia({ audio: true });
      micStreamRef.current = mic;
      addLog('getUserMedia OK — mic capturando');
      startMeter(mic);

      // 2) Token efêmero via edge function realtime-session.
      setStatus('fetching-token');
      const session = await createRealtimeSession({ voice: 'verse' });
      addLog(`token efêmero OK (model=${session.model}, exp=${session.expires_at})`);

      // 3) WebRTC com a OpenAI.
      setStatus('connecting');
      const pc = new RTCPeerConnection();
      pcRef.current = pc;

      pc.oniceconnectionstatechange = () => addLog(`ICE: ${pc.iceConnectionState}`);
      pc.onconnectionstatechange = () => {
        addLog(`PC: ${pc.connectionState}`);
        if (pc.connectionState === 'failed') {
          setStatus('error');
          setError('conexão failed');
          cleanup();
        }
      };

      // Áudio remoto (voz do modelo) → <audio>.
      pc.ontrack = (e) => {
        if (audioElRef.current) audioElRef.current.srcObject = e.streams[0];
        addLog('track remoto recebido (áudio do modelo)');
      };

      // Canal de eventos (server events). Na Fase 2 é por aqui que entram as
      // function-calls pro daemon; aqui só logamos pra provar o canal.
      const dc = pc.createDataChannel('oai-events');
      dc.onopen = () => addLog('data channel aberto');
      dc.onmessage = (ev) => {
        try {
          const evt = JSON.parse(ev.data);
          if (evt.type) addLog(`evt: ${evt.type}`);
        } catch {
          /* ignore */
        }
      };

      mic.getTracks().forEach((t) => pc.addTrack(t, mic));

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      const sdpResp = await fetch(`${OPENAI_REALTIME_CALLS_URL}?model=${encodeURIComponent(session.model)}`, {
        method: 'POST',
        body: offer.sdp,
        headers: {
          Authorization: `Bearer ${session.value}`,
          'Content-Type': 'application/sdp',
        },
      });
      if (!sdpResp.ok) {
        const t = await sdpResp.text().catch(() => '');
        throw new Error(`SDP exchange ${sdpResp.status}: ${t.slice(0, 160)}`);
      }
      const answer = await sdpResp.text();
      await pc.setRemoteDescription({ type: 'answer', sdp: answer });
      addLog('SDP answer aplicado — negociação completa');
      setStatus('connected');
    } catch (e) {
      const msg = (e as Error).message;
      addLog(`ERRO: ${msg}`);
      setError(msg);
      setStatus('error');
      cleanup();
    }
  }, [addLog, cleanup, startMeter]);

  const hangup = useCallback(() => {
    cleanup();
    setStatus('idle');
    addLog('encerrado');
  }, [addLog, cleanup]);

  const busy = status === 'requesting-mic' || status === 'fetching-token' || status === 'connecting';
  const live = status === 'connected';

  return (
    <div className="max-w-2xl">
      <div className="flex items-center gap-2 text-[15px] font-bold text-creme mb-1">
        <Mic size={16} className="text-brand-bright" /> Voz real-time — teste (Fase 1)
      </div>
      <p className="text-[12.5px] text-creme-mute mb-4">
        Diagnóstico de captura de mic + conexão WebRTC com a OpenAI Realtime API.
        O modo voz real fica no chat (botão Voz → Tempo real).
      </p>

      {!realtimeConfigured && (
        <div className="flex items-start gap-2 rounded-lg bg-semantic-amber/10 text-semantic-amber p-3 mb-4 text-[12.5px]">
          <AlertTriangle size={15} className="mt-0.5 shrink-0" />
          <span>
            Supabase não configurado — o token efêmero vem da edge function
            <code> realtime-session</code>.
          </span>
        </div>
      )}

      {/* Nível de mic */}
      <div className="rounded-xl bg-surface-2 p-4 mb-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[12.5px] text-creme-mute">status</span>
          <span
            className={clsx(
              'text-[12.5px] font-mono px-2 py-0.5 rounded',
              live && 'bg-semantic-green/15 text-semantic-green',
              status === 'error' && 'bg-semantic-red/15 text-semantic-red',
              !live && status !== 'error' && 'bg-surface-3 text-creme-mute',
            )}
          >
            {STATUS_LABEL[status]}
          </span>
        </div>
        <div className="h-3 rounded-full bg-surface-3 overflow-hidden">
          <div
            className="h-full bg-brand-bright transition-[width] duration-75"
            style={{ width: `${Math.round(level * 100)}%` }}
          />
        </div>
        <div className="text-[11px] text-creme-faint mt-1 font-mono">
          nível mic: {(level * 100).toFixed(0)}%
        </div>
      </div>

      {error && (
        <div className="rounded-lg bg-semantic-red/10 text-semantic-red p-3 mb-4 text-[12.5px] font-mono break-words">
          {error}
        </div>
      )}

      <div className="flex gap-2 mb-4">
        {!live ? (
          <button
            onClick={connect}
            disabled={busy || !realtimeConfigured}
            className="flex items-center gap-2 rounded-lg bg-brand px-4 py-2 text-[13px] font-semibold text-white disabled:opacity-50"
          >
            {busy ? <Loader2 size={15} className="animate-spin" /> : <Mic size={15} />}
            {busy ? STATUS_LABEL[status] : 'Conectar e falar'}
          </button>
        ) : (
          <button
            onClick={hangup}
            className="flex items-center gap-2 rounded-lg bg-semantic-red px-4 py-2 text-[13px] font-semibold text-white"
          >
            <PhoneOff size={15} /> Encerrar
          </button>
        )}
        {live && (
          <span className="flex items-center gap-1 text-[12.5px] text-semantic-green">
            <MicOff size={14} className="opacity-0" /> ao vivo
          </span>
        )}
      </div>

      {/* Áudio remoto do modelo */}
      <audio ref={audioElRef} autoPlay />

      {/* Log de diagnóstico (útil pra ver falha de getUserMedia no WKWebView) */}
      <div className="rounded-xl bg-surface-1 border border-surface-3 p-3">
        <div className="text-[11px] text-creme-faint mb-1 font-mono">log</div>
        <div className="max-h-56 overflow-auto font-mono text-[11px] text-creme-mute space-y-0.5">
          {log.length === 0 ? (
            <div className="text-creme-faint">— sem eventos ainda —</div>
          ) : (
            log.map((l, i) => <div key={i}>{l}</div>)
          )}
        </div>
      </div>
    </div>
  );
}
