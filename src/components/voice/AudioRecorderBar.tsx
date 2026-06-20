import { useEffect, useRef, useState } from 'react';
import { X, Check, Loader2 } from 'lucide-react';
import { transcribeBlob } from '@/services/voiceSkill';

const BARS = 44;
const FLOOR = 0.06;

/**
 * Barra de gravação com waveform ao vivo (estilo WhatsApp): grava o mic, mostra
 * as ondas reagindo, timer, X pra cancelar e ✓ pra mandar pra transcrição.
 */
export function AudioRecorderBar({ agentId, onResult, onCancel }: { agentId: string; onResult: (text: string) => void; onCancel: () => void }) {
  const [levels, setLevels] = useState<number[]>(() => Array(BARS).fill(FLOOR));
  const [seconds, setSeconds] = useState(0);
  const [transcribing, setTranscribing] = useState(false);

  const streamRef = useRef<MediaStream | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const recRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const rafRef = useRef(0);
  const levelsRef = useRef<number[]>(Array(BARS).fill(FLOOR));

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
        if (!alive) { stream.getTracks().forEach((t) => t.stop()); return; }
        streamRef.current = stream;
        const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        const ctx = new Ctx(); ctxRef.current = ctx;
        const src = ctx.createMediaStreamSource(stream);
        const an = ctx.createAnalyser(); an.fftSize = 512; an.smoothingTimeConstant = 0.5; src.connect(an);
        const buf = new Uint8Array(an.fftSize);
        const tick = () => {
          an.getByteTimeDomainData(buf);
          let sum = 0; for (let i = 0; i < buf.length; i++) { const v = (buf[i] - 128) / 128; sum += v * v; }
          const lv = Math.max(FLOOR, Math.min(1, Math.sqrt(sum / buf.length) * 3.4));
          const arr = levelsRef.current.slice(1); arr.push(lv); levelsRef.current = arr;
          setLevels(arr);
          rafRef.current = requestAnimationFrame(tick);
        };
        rafRef.current = requestAnimationFrame(tick);
        const mime = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : '';
        const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
        rec.ondataavailable = (e) => { if (e.data && e.data.size > 0) chunksRef.current.push(e.data); };
        rec.start(); recRef.current = rec;
      } catch { onCancel(); }
    })();
    const tm = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => { alive = false; clearInterval(tm); cleanup(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function cleanup() {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    try { recRef.current?.state !== 'inactive' && recRef.current?.stop(); } catch { /* noop */ }
    streamRef.current?.getTracks().forEach((t) => t.stop());
    if (ctxRef.current && ctxRef.current.state !== 'closed') ctxRef.current.close().catch(() => { /* noop */ });
  }

  async function confirm() {
    const rec = recRef.current;
    if (!rec) { onCancel(); return; }
    setTranscribing(true);
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    const blob = await new Promise<Blob | null>((res) => {
      if (rec.state === 'inactive') { res(null); return; }
      rec.onstop = () => res(chunksRef.current.length ? new Blob(chunksRef.current, { type: rec.mimeType || 'audio/webm' }) : null);
      try { rec.stop(); } catch { res(null); }
    });
    streamRef.current?.getTracks().forEach((t) => t.stop());
    if (ctxRef.current && ctxRef.current.state !== 'closed') ctxRef.current.close().catch(() => { /* noop */ });
    if (!blob) { onCancel(); return; }
    try { onResult(((await transcribeBlob(agentId, blob)) ?? '').trim()); }
    catch { onResult(''); }
  }

  const mmss = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;

  return (
    <div className="flex items-center gap-3 px-3 py-2 rounded-2xl bg-surface-2 border border-default">
      {transcribing ? (
        <div className="flex-1 flex items-center gap-2 text-[13px] text-creme-mute"><Loader2 size={16} className="animate-spin text-brand-bright" /> Transcrevendo…</div>
      ) : (
        <>
          <span className="w-2.5 h-2.5 rounded-full bg-semantic-red animate-pulse shrink-0" />
          <div className="flex-1 flex items-center gap-[2px] h-8 overflow-hidden">
            {levels.map((lv, i) => (
              <span key={i} className="flex-1 rounded-full" style={{ height: `${Math.round(lv * 100)}%`, minHeight: 2, background: '#ff6b4a', opacity: 0.55 + lv * 0.45 }} />
            ))}
          </div>
          <span className="text-[12px] tabular-nums text-creme-mute shrink-0 w-9 text-right">{mmss}</span>
        </>
      )}
      <button onClick={() => { cleanup(); onCancel(); }} title="Cancelar" className="w-8 h-8 rounded-full bg-surface-1 text-creme-mute hover:text-creme flex items-center justify-center shrink-0 transition-colors"><X size={16} /></button>
      <button onClick={confirm} disabled={transcribing} title="Enviar pra transcrição" className="w-9 h-9 rounded-full bg-brand text-white hover:bg-brand-bright flex items-center justify-center shrink-0 disabled:opacity-50 transition-colors"><Check size={17} /></button>
    </div>
  );
}
