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

/** Tira markdown/símbolos pra fala soar natural (sem "asterisco", "pipe"…). */
function ttsClean(s: string): string {
  return (s || '')
    .replace(/```[\s\S]*?```/g, ' (código) ')          // blocos de código
    .replace(/`([^`]+)`/g, '$1')                        // inline code
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')               // imagens
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')            // links → só o texto
    .replace(/^\s*\|.*\|\s*$/gm, '')                    // linhas de tabela
    .replace(/^[\s>#-]*[-*+]\s+/gm, '')                 // bullets
    .replace(/[*_#>~|]+/g, ' ')                          // símbolos soltos
    .replace(/:\w+:/g, '')                              // shortcodes de emoji
    .replace(/\n{2,}/g, '. ')
    .replace(/\n/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

export function useVoice() {
  const [listening, setListening] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const recogRef = useRef<any>(null);

  const sttSupported = Boolean(SR);
  const ttsSupported = typeof window !== 'undefined' && 'speechSynthesis' in window;

  // ─── STT ──────────────────────────────────────────────────────────────────
  const startListening = useCallback(
    (onResult: (text: string) => void, onIdle?: () => void) => {
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
          else onIdle?.(); // terminou sem captura (silêncio/timeout) → re-armar
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

  const keepAliveRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const speak = useCallback(
    (text: string, onEnd?: () => void) => {
      const clean = ttsClean(text);
      if (!ttsSupported || !clean) { onEnd?.(); return; }
      const synth = window.speechSynthesis;
      synth.cancel();

      const run = () => {
        const u = new SpeechSynthesisUtterance(clean.slice(0, 4500));
        u.lang = 'pt-BR';
        const v = pickVoice();
        if (v) u.voice = v;
        u.rate = 1.02;
        u.pitch = 1;
        const stop = () => {
          setSpeaking(false);
          if (keepAliveRef.current) { clearInterval(keepAliveRef.current); keepAliveRef.current = null; }
        };
        u.onstart = () => {
          setSpeaking(true);
          // Chrome corta falas longas (~15s) — resume periódico mantém vivo.
          if (keepAliveRef.current) clearInterval(keepAliveRef.current);
          keepAliveRef.current = setInterval(() => synth.resume(), 7000);
        };
        u.onend = () => { stop(); onEnd?.(); };
        u.onerror = () => { stop(); onEnd?.(); };
        synth.speak(u);
      };

      // No Chrome getVoices() vem vazio até carregar — espera o evento na 1ª vez.
      if (synth.getVoices().length === 0) {
        let fired = false;
        const go = () => { if (fired) return; fired = true; synth.onvoiceschanged = null; run(); };
        synth.onvoiceschanged = go;
        setTimeout(go, 600);
      } else {
        run();
      }
    },
    [ttsSupported],
  );

  const cancelSpeak = useCallback(() => {
    if (keepAliveRef.current) { clearInterval(keepAliveRef.current); keepAliveRef.current = null; }
    if (ttsSupported) window.speechSynthesis.cancel();
    setSpeaking(false);
  }, [ttsSupported]);

  // Destrava o TTS DENTRO de um gesto do usuário (clique). O Chrome bloqueia
  // speechSynthesis quando o speak() real vem segundos depois, fora de gesto —
  // um utterance mudo aqui "aquece" o sintetizador pra falar a resposta depois.
  const unlock = useCallback(() => {
    if (!ttsSupported) return;
    try {
      const synth = window.speechSynthesis;
      synth.resume();
      const u = new SpeechSynthesisUtterance(' ');
      u.volume = 0;
      synth.speak(u);
    } catch { /* noop */ }
  }, [ttsSupported]);

  useEffect(() => {
    return () => {
      recogRef.current?.stop();
      if (ttsSupported) window.speechSynthesis.cancel();
    };
  }, [ttsSupported]);

  return { listening, speaking, sttSupported, ttsSupported, startListening, stopListening, speak, cancelSpeak, unlock };
}
