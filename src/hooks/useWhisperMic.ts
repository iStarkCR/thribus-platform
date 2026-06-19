import { useCallback, useRef, useState } from 'react';
import { transcribeBlob } from '@/services/voiceSkill';

/**
 * Captura de voz por gravação + Whisper (STT do backend) — substitui o Web
 * Speech do navegador no modo voz quando o agente usa provider OpenAI.
 *
 * Grava com MediaRecorder e usa um AnalyserNode pra detectar fim de fala
 * (silêncio por ~1.1s). O limiar é CALIBRADO pelo ruído de fundo (não fixo),
 * o AudioContext é forçado a 'running' (Chrome cria 'suspended'), e o áudio
 * vai pro Whisper sempre que houver fala — transcrição precisa em pt-BR.
 */
export function useWhisperMic(agentId: string) {
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const stopRef = useRef<(() => void) | null>(null);

  const cancel = useCallback(() => {
    stopRef.current?.();
    stopRef.current = null;
  }, []);

  const capture = useCallback(async (onText: (t: string) => void) => {
    if (stopRef.current) return; // já há uma captura em andamento
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const ctx = new AudioContext();
      if (ctx.state === 'suspended') { try { await ctx.resume(); } catch { /* noop */ } }
      const src = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      src.connect(analyser);
      const buf = new Uint8Array(analyser.frequencyBinCount);
      const rec = new MediaRecorder(stream);
      const chunks: BlobPart[] = [];
      rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };

      let spoke = false, silenceStart = 0, raf = 0, done = false;
      let noiseSum = 0, noiseN = 0, dynThresh = 0.02, calibrated = false;
      const t0 = performance.now();
      const CALIB_MS = 400;     // mede o ruído de fundo no início
      const SILENCE_MS = 1100;  // silêncio após falar → encerra
      const MAX_MS = 13000;     // teto de duração
      const MIN_REC_MS = 500;   // gravação mínima pra valer

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
        const dur = performance.now() - t0;
        // envia se detectou fala, ou se gravou quase até o teto (fala que o VAD
        // pode ter perdido). Silêncio curto → descarta (re-arma sem custo).
        const worth = chunks.length > 0 && dur >= MIN_REC_MS && (spoke || dur >= MAX_MS - 1500);
        if (!worth) { onText(''); return; }
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
        if (!calibrated) {
          if (now - t0 < CALIB_MS) { noiseSum += rms; noiseN++; raf = requestAnimationFrame(tick); return; }
          const floor = noiseN ? noiseSum / noiseN : 0.01;
          dynThresh = Math.max(0.013, floor * 2.5); // fala = bem acima do ruído medido
          calibrated = true;
        }
        if (rms > dynThresh) { spoke = true; silenceStart = 0; }
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
