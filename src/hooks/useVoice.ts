import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Voz no navegador (sem backend):
 *  - STT via Web Speech (SpeechRecognition) — pt-BR, fala → texto.
 *  - TTS via speechSynthesis — pt-BR, texto → fala.
 *
 * Upgrade futuro: trocar por Edge Functions (Whisper + ElevenLabs) pra qualidade.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
const SR: any =
  typeof window !== 'undefined' ? (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition : null;

export function useVoice() {
  const [listening, setListening] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const recogRef = useRef<any>(null);

  const sttSupported = Boolean(SR);
  const ttsSupported = typeof window !== 'undefined' && 'speechSynthesis' in window;

  // ─── STT ──────────────────────────────────────────────────────────────────
  const startListening = useCallback(
    (onResult: (text: string) => void) => {
      if (!SR) return;
      recogRef.current?.stop(); // nunca deixa dois reconhecimentos rodando juntos
      const recog = new SR();
      recog.lang = 'pt-BR';
      recog.interimResults = false;
      recog.continuous = false;
      recog.maxAlternatives = 1;
      // Entrega o transcript UMA vez, no fim da fala (onend) — não a cada segmento.
      // Sem isso o Chrome dispara onresult várias vezes numa fala contínua e cada
      // disparo virava uma mensagem (flood "alô alô alô…").
      let finalText = '';
      let delivered = false;
      recog.onresult = (e: any) => {
        finalText = Array.from(e.results)
          .filter((r: any) => r.isFinal)
          .map((r: any) => r[0].transcript)
          .join(' ');
      };
      recog.onend = () => {
        setListening(false);
        if (!delivered) {
          delivered = true;
          const t = finalText.trim();
          if (t) onResult(t);
        }
      };
      recog.onerror = () => setListening(false);
      recogRef.current = recog;
      setListening(true);
      // start() pode lançar se o mic ainda está sendo liberado por outro
      // reconhecedor (ex: wake word) — tenta de novo uma vez antes de desistir.
      try {
        recog.start();
      } catch {
        setTimeout(() => { try { recog.start(); } catch { setListening(false); } }, 250);
      }
    },
    [],
  );

  const stopListening = useCallback(() => {
    recogRef.current?.stop();
    setListening(false);
  }, []);

  // ─── TTS ──────────────────────────────────────────────────────────────────
  function pickVoice(): SpeechSynthesisVoice | null {
    const voices = window.speechSynthesis.getVoices();
    return (
      voices.find((v) => v.lang === 'pt-BR') ||
      voices.find((v) => v.lang.startsWith('pt')) ||
      null
    );
  }

  const speak = useCallback(
    (text: string, onEnd?: () => void) => {
      if (!ttsSupported || !text) { onEnd?.(); return; }
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = 'pt-BR';
      const v = pickVoice();
      if (v) u.voice = v;
      u.rate = 1.02;
      u.pitch = 1;
      u.onstart = () => setSpeaking(true);
      u.onend = () => { setSpeaking(false); onEnd?.(); };
      u.onerror = () => { setSpeaking(false); onEnd?.(); };
      window.speechSynthesis.speak(u);
    },
    [ttsSupported],
  );

  const cancelSpeak = useCallback(() => {
    if (ttsSupported) window.speechSynthesis.cancel();
    setSpeaking(false);
  }, [ttsSupported]);

  useEffect(() => {
    return () => {
      recogRef.current?.stop();
      if (ttsSupported) window.speechSynthesis.cancel();
    };
  }, [ttsSupported]);

  return { listening, speaking, sttSupported, ttsSupported, startListening, stopListening, speak, cancelSpeak };
}
