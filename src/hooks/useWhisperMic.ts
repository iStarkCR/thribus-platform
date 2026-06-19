import { useCallback, useRef, useState } from 'react';
import { transcribeBlob } from '@/services/voiceSkill';

/* eslint-disable @typescript-eslint/no-explicit-any */
const SR: any = typeof window !== 'undefined' ? (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition : null;

// O Whisper "alucina" frases-padrão quando o áudio é silêncio/ruído. Descarta.
function isWhisperNoise(t: string): boolean {
  const s = t.toLowerCase().trim();
  if (s.length < 2) return true;
  return /amara\.org|legendas?\s+(pela|by)|subtitles?\s+by|obrigad[oa] por (assistir|ver)|^muito obrigad|♪|\[(música|musica|aplausos|risos)\]/i.test(s);
}

/**
 * Captura de voz: grava com MediaRecorder e usa o SpeechRecognition do navegador
 * SÓ como detector de fala (VAD) — ele acerta bem QUANDO há fala e quando ela
 * termina. O áudio gravado vai pro Whisper (transcrição precisa). Se o navegador
 * não confirmar fala, NADA é enviado (sem alucinação). Sem SpeechRecognition,
 * cai num timer simples.
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
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      const rec = new MediaRecorder(stream);
      const chunks: BlobPart[] = [];
      rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };

      let heardSpeech = false, done = false;
      let recog: any = null;
      let maxTimer: ReturnType<typeof setTimeout> | null = null;

      const finish = () => {
        if (done) return;
        done = true;
        if (maxTimer) clearTimeout(maxTimer);
        stopRef.current = null;
        try { recog?.stop(); } catch { /* noop */ }
        try { rec.stop(); } catch { /* noop */ }
      };
      stopRef.current = finish;

      rec.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        setRecording(false);
        if (!heardSpeech || chunks.length === 0) { onText(''); return; } // sem fala confirmada → não alucina
        setTranscribing(true);
        const blob = new Blob(chunks, { type: rec.mimeType || 'audio/webm' });
        const text = (await transcribeBlob(agentId, blob).catch(() => null) ?? '').trim();
        setTranscribing(false);
        onText(isWhisperNoise(text) ? '' : text);
      };

      // SpeechRecognition = detector de fala (não usamos o texto dele, só o sinal).
      if (SR) {
        recog = new SR();
        recog.lang = 'pt-BR';
        recog.continuous = false;
        recog.interimResults = true;
        recog.onresult = () => { heardSpeech = true; }; // captou voz
        recog.onend = () => finish();                    // parou de falar → encerra
        // 'no-speech' = silêncio real (descarta). Outro erro (conflito de mic)
        // → não confia no VAD: assume fala pra não perder o áudio gravado.
        recog.onerror = (e: any) => { if (e?.error && e.error !== 'no-speech') heardSpeech = true; finish(); };
        try { recog.start(); } catch { /* noop */ }
      } else {
        // sem SpeechRecognition: assume fala e corta em 6s
        heardSpeech = true;
        maxTimer = setTimeout(finish, 6000);
      }
      // teto de segurança (caso o onend nunca venha)
      maxTimer = setTimeout(finish, 15000);

      rec.start();
      setRecording(true);
    } catch {
      stopRef.current = null;
      setRecording(false);
      onText('');
    }
  }, [agentId]);

  return { recording, transcribing, capture, cancel };
}
