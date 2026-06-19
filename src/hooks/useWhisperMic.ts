import { useCallback, useRef, useState } from 'react';
import { transcribeBlob } from '@/services/voiceSkill';

/**
 * Captura de voz por gravação + Whisper (STT do backend) — substitui o Web
 * Speech do navegador no modo voz quando o agente usa provider OpenAI.
 *
 * Grava com MediaRecorder e usa um AnalyserNode pra detectar fim de fala
 * (silêncio por ~1.3s) — aí para, manda o áudio pro Whisper e devolve o texto.
 * Transcrição muito mais precisa em pt-BR que o SpeechRecognition do browser.
 */
export function useWhisperMic(agentId: string) {
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const stopRef = useRef<(() => void) | null>(null);

  const cancel = useCallback(() => {
    stopRef.current?.();
    stopRef.current = null;
  }, []);

  /** Grava até o silêncio, transcreve via Whisper. onText('') se nada captado. */
  const capture = useCallback(async (onText: (t: string) => void) => {
    if (stopRef.current) return; // já há uma captura em andamento
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const ctx = new AudioContext();
      const src = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      src.connect(analyser);
      const buf = new Uint8Array(analyser.frequencyBinCount);
      const rec = new MediaRecorder(stream);
      const chunks: BlobPart[] = [];
      rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };

      let spoke = false, silenceStart = 0, speakStart = 0, raf = 0, done = false;
      const t0 = performance.now();
      const THRESH = 0.02;      // volume RMS pra considerar "fala"
      const SILENCE_MS = 1300;  // silêncio após falar → encerra
      const MAX_MS = 14000;     // teto de duração
      const MIN_MS = 300;       // fala mínima pra valer (evita ruído curto)

      const finish = () => {
        if (done) return;
        done = true;
        cancelAnimationFrame(raf);
        stopRef.current = null;
        try { rec.stop(); } catch { /* noop */ }
      };
      stopRef.current = finish;

      rec.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        ctx.close().catch(() => { /* noop */ });
        setRecording(false);
        const spokeMs = speakStart ? performance.now() - speakStart : 0;
        if (!spoke || spokeMs < MIN_MS) { onText(''); return; }
        setTranscribing(true);
        const blob = new Blob(chunks, { type: rec.mimeType || 'audio/webm' });
        const text = await transcribeBlob(agentId, blob).catch(() => null);
        setTranscribing(false);
        onText((text ?? '').trim());
      };

      const tick = () => {
        analyser.getByteTimeDomainData(buf);
        let sum = 0;
        for (let i = 0; i < buf.length; i++) { const v = (buf[i] - 128) / 128; sum += v * v; }
        const rms = Math.sqrt(sum / buf.length);
        const now = performance.now();
        if (rms > THRESH) { if (!spoke) speakStart = now; spoke = true; silenceStart = 0; }
        else if (spoke && !silenceStart) silenceStart = now;
        else if (spoke && silenceStart && now - silenceStart > SILENCE_MS) { finish(); return; }
        if (now - t0 > MAX_MS) { finish(); return; }
        raf = requestAnimationFrame(tick);
      };

      rec.start();
      setRecording(true);
      raf = requestAnimationFrame(tick);
    } catch {
      stopRef.current = null;
      setRecording(false);
      onText('');
    }
  }, [agentId]);

  return { recording, transcribing, capture, cancel };
}
