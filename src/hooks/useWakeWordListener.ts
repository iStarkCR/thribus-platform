import { useEffect, useRef } from 'react';

/**
 * Escuta em background a wake word "Bukowiski" (SpeechRecognition contínuo, pt-BR).
 * Ao detectar, dispara onWake. Roda só enquanto `enabled` for true.
 *
 * Pausar o reconhecedor enquanto o modo voz roda é responsabilidade do chamador
 * (passar enabled=false) — dois reconhecedores disputando o mic quebra na maioria
 * dos navegadores.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
const SR: any =
  typeof window !== 'undefined' ? (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition : null;

export function isWakeWordSupported(): boolean {
  return Boolean(SR);
}

// Variações de STT pra "Bukowiski" (português costuma errar nomes próprios).
const WAKE_PATTERNS = [
  /buko?w?isk/i, // bukowiski, bukowski, bukowisk
  /buko?v?isk/i, // bukovisk, bukoviski
  /bucov?isk/i, // bucovisk, bucoviski
  /bukowsk/i, // bukowski
  /buco?w?isk/i, // bucowisk
];

function matchesWake(text: string): boolean {
  return WAKE_PATTERNS.some((re) => re.test(text));
}

export function useWakeWordListener({
  enabled,
  onWake,
  onError,
  lang = 'pt-BR',
}: {
  enabled: boolean;
  onWake: (transcript: string) => void;
  onError?: (err: string) => void;
  lang?: string;
}) {
  const onWakeRef = useRef(onWake);
  const onErrorRef = useRef(onError);
  useEffect(() => { onWakeRef.current = onWake; }, [onWake]);
  useEffect(() => { onErrorRef.current = onError; }, [onError]);

  useEffect(() => {
    if (!enabled || !SR) return;

    let recog: any = null;
    let stopped = false;
    let restartTimer: ReturnType<typeof setTimeout> | null = null;
    let lastWakeAt = 0;

    const start = () => {
      if (stopped) return;
      try {
        recog = new SR();
        recog.lang = lang;
        recog.continuous = true;
        recog.interimResults = true;
        recog.maxAlternatives = 1;

        recog.onresult = (e: any) => {
          for (let i = e.resultIndex; i < e.results.length; i++) {
            const transcript = String(e.results[i][0]?.transcript ?? '');
            if (!matchesWake(transcript)) continue;
            const now = Date.now();
            if (now - lastWakeAt < 3000) return; // debounce 3s
            lastWakeAt = now;
            onWakeRef.current(transcript.trim());
            return;
          }
        };

        recog.onerror = (e: any) => {
          if (e?.error === 'not-allowed' || e?.error === 'service-not-allowed') {
            stopped = true; // permissão negada — para de tentar
            onErrorRef.current?.('mic-denied');
          }
          // 'no-speech' / 'aborted' são normais; o onend reinicia.
        };

        recog.onend = () => {
          // Navegador encerra o reconhecimento sozinho — reinicia.
          if (stopped) return;
          restartTimer = setTimeout(start, 250);
        };

        recog.start();
      } catch {
        if (!stopped) restartTimer = setTimeout(start, 600);
      }
    };

    start();

    return () => {
      stopped = true;
      if (restartTimer) clearTimeout(restartTimer);
      try { recog?.stop(); } catch { /* noop */ }
    };
  }, [enabled, lang]);
}
