import { useCallback, useRef, useState } from 'react';
import { transcribeBlob } from '@/services/voiceSkill';

// O Whisper "alucina" frases-padrão quando o áudio é silêncio/ruído. Descarta.
function isWhisperNoise(t: string): boolean {
  const s = t.toLowerCase().trim();
  if (s.length < 2) return true;
  return /amara\.org|legendas?\s+(pela|by)|subtitles?\s+by|obrigad[oa] por (assistir|ver)|^muito obrigad|♪|\[(música|musica|aplausos|risos)\]/i.test(s);
}

/**
 * Captura de voz por gravação + Whisper (STT do backend).
 *
 * O gravador (MediaRecorder) liga DESDE o início (não perde o começo da fala).
 * Um AnalyserNode mede a energia: acumula tempo de fala e só encerra após 1.5s
 * de silêncio REAL — assim tolera pausas no meio da frase (não corta cedo).
 * Só envia pro Whisper se houve fala sustentada (>=450ms) — sem isso o Whisper
 * inventaria frase ("Muito obrigada"). Transcrição precisa em pt-BR.
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
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
      });
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

      let silenceStart = 0, raf = 0, done = false, speechMs = 0, lastT = 0;
      const t0 = performance.now();
      const THRESH = 0.012;       // limiar de fala
      const SILENCE_MS = 1500;    // silêncio real pra encerrar (tolera pausas)
      const MIN_SPEECH_MS = 450;  // fala acumulada mínima pra valer (evita ruído)
      const MAX_MS = 15000;       // teto

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
        if (speechMs < MIN_SPEECH_MS || chunks.length === 0) { onText(''); return; }
        setTranscribing(true);
        const blob = new Blob(chunks, { type: rec.mimeType || 'audio/webm' });
        const text = (await transcribeBlob(agentId, blob).catch(() => null) ?? '').trim();
        setTranscribing(false);
        onText(isWhisperNoise(text) ? '' : text);
      };

      const tick = () => {
        analyser.getByteTimeDomainData(buf);
        let sum = 0;
        for (let i = 0; i < buf.length; i++) { const v = (buf[i] - 128) / 128; sum += v * v; }
        const rms = Math.sqrt(sum / buf.length);
        const now = performance.now();
        const dt = lastT ? now - lastT : 16; lastT = now;
        if (rms > THRESH) { speechMs += dt; silenceStart = 0; }
        else if (speechMs > 0) { // só conta silêncio depois de ter ouvido fala
          if (!silenceStart) silenceStart = now;
          else if (now - silenceStart > SILENCE_MS) { finish(); return; }
        }
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
