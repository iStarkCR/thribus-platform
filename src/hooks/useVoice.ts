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
      const recog = new SR();
      recog.lang = 'pt-BR';
      recog.interimResults = false;
      recog.continuous = false;
      recog.maxAlternatives = 1;
      recog.onresult = (e: any) => {
        const text = Array.from(e.results)
          .map((r: any) => r[0].transcript)
          .join(' ')
          .trim();
        if (text) onResult(text);
      };
      recog.onend = () => setListening(false);
      recog.onerror = () => setListening(false);
      recogRef.current = recog;
      setListening(true);
      recog.start();
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
    (text: string) => {
      if (!ttsSupported || !text) return;
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = 'pt-BR';
      const v = pickVoice();
      if (v) u.voice = v;
      u.rate = 1.02;
      u.pitch = 1;
      u.onstart = () => setSpeaking(true);
      u.onend = () => setSpeaking(false);
      u.onerror = () => setSpeaking(false);
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
