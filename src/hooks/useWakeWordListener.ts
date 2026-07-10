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

// Variações de STT pra "Bukowiski" (português erra muito nome próprio).
// Bem permissivo: b + u/o + c/k + (vogal) + (w/v) + (i) + sk → cobre quase todo
// jeito que o reconhecimento escreve o nome, em uma palavra ou separado.
// O Chrome frequentemente troca o "B" inicial por "M" (ou "P"): "mucovisk",
// "muco", "pucovisk". Por isso aceitamos [bmp] no começo.
const WAKE_PATTERNS = [
  /[bmpv][uo][ck][oae]?[wv]?[ií]?sk/i, // bukowisk, mucovisk, bucovisk, bukosk, vucovisk…
  /[bmpv][uo][ck][oae]?\s*[wv][ií]?sk/i, // "buco visk", "muco visk"
  /[bmpv][uo][ck]o?[wv][ií]s\b/i, // bucovis, mucovis (corta o "k")
  /[bmpv][uo][ck][oae]?[wv][ií]/i, // bukowi, mucovi, bucovi — casa ANTES do "sk"
  /\b[bmp]uk[oae]?w?ski?\b/i, // bukowski, mukowski
  /book.{0,4}sk/i, // mishear "book of ski"
  /[bmp][uo][ck][oae]?\s*(u[ií]s|w?[uí]?[ií]sq|wh?isk)/i, // "buco uísque", "buko whisky"
];

function normalize(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function matchesWake(text: string): boolean {
  const t = normalize(text);
  return WAKE_PATTERNS.some((re) => re.test(t));
}

/**
 * Extrai o COMANDO dito junto com a wake word ("Bukowiski, me dá o status" →
 * "me da o status"). Devolve '' se a pessoa só chamou o nome. Trabalha no texto
 * normalizado (sem acento) — suficiente pro modelo entender.
 */
export function extractWakeCommand(transcript: string): string {
  const t = normalize(transcript);
  for (const re of WAKE_PATTERNS) {
    const m = re.exec(t);
    if (!m) continue;
    // pula o resto do "nome" (chars colados na wake word) até o 1º separador
    let i = m.index + m[0].length;
    while (i < t.length && !/[\s,.!?;:]/.test(t[i])) i++;
    return t
      .slice(i)
      .replace(/^[\s,.!?;:]+/, '')
      .replace(/^(ai|entao|por favor|faz favor|escuta|olha)[\s,]+/i, '')
      .trim();
  }
  return '';
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
    let freshTimer: ReturnType<typeof setTimeout> | null = null;
    let lastWakeAt = 0;
    const FRESH_MS = 11000; // reinicia o reconhecimento periodicamente → fica "fresco" e entende melhor

    const start = () => {
      if (stopped) return;
      try {
        recog = new SR();
        recog.lang = lang;
        recog.continuous = true;
        recog.interimResults = true;
        recog.maxAlternatives = 4;

        recog.onresult = (e: any) => {
          for (let i = e.resultIndex; i < e.results.length; i++) {
            // Varre TODAS as alternativas do STT — "Bukowiski" é nome próprio e
            // muitas vezes só aparece na 2ª/3ª hipótese do reconhecedor.
            const res = e.results[i];
            for (let j = 0; j < (res?.length ?? 0); j++) {
              const transcript = String(res[j]?.transcript ?? '');
              if (!matchesWake(transcript)) continue;
              const now = Date.now();
              if (now - lastWakeAt < 3000) return; // debounce 3s
              lastWakeAt = now;
              onWakeRef.current(transcript.trim());
              return;
            }
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
          if (freshTimer) { clearTimeout(freshTimer); freshTimer = null; }
          // Navegador encerra o reconhecimento sozinho — reinicia.
          if (stopped) return;
          restartTimer = setTimeout(start, 120);
        };

        recog.start();
        // Recicla periodicamente pra não acumular um transcript gigante (degrada a precisão).
        freshTimer = setTimeout(() => { try { recog.stop(); } catch { /* noop */ } }, FRESH_MS);
      } catch {
        if (!stopped) restartTimer = setTimeout(start, 600);
      }
    };

    start();

    return () => {
      stopped = true;
      if (restartTimer) clearTimeout(restartTimer);
      if (freshTimer) clearTimeout(freshTimer);
      try { recog?.stop(); } catch { /* noop */ }
    };
  }, [enabled, lang]);
}
