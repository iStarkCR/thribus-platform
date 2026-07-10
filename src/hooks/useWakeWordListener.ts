import { useEffect, useRef } from 'react';

/**
 * Escuta em background a wake word "Bukowiski" (SpeechRecognition contínuo, pt-BR).
 * Ao detectar, dispara onWake. Roda só enquanto `enabled` for true.
 *
 * Portado do padrão do CORTEX (useWakeWordListener.js, que funciona estável):
 *   - pede permissão de mic via getUserMedia ANTES de criar o SpeechRecognition
 *     (sem isso o reconhecedor morre em silêncio quando o site não tem permissão);
 *   - SEM reciclagem periódica — reinicia só no onend natural do navegador
 *     (reciclar a cada Ns derrubava falas no meio);
 *   - loga o ciclo de vida no console ([wake] …) pra diagnóstico.
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

// Debug ao vivo: localStorage.setItem('wakeDebug','1') → loga no console TUDO
// que o reconhecedor entende (cada alternativa de cada fala).
const wakeDebug = (): boolean => {
  try { return localStorage.getItem('wakeDebug') === '1'; } catch { return false; }
};

// Variações de STT pra "Bukowiski" (português erra muito nome próprio).
// Bem permissivo: b + u/o + c/k + (vogal) + (w/v) + (i) + sk → cobre quase todo
// jeito que o reconhecimento escreve o nome, em uma palavra ou separado.
// O Chrome frequentemente troca o "B" inicial por "M", "P" ou "V": "mucovisk",
// "pucovisk", "vucovisk". Por isso aceitamos [bmpv] no começo.
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
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
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
    if (!enabled) return;
    if (!SR) {
      console.warn('[wake] SpeechRecognition não suportado neste navegador');
      onErrorRef.current?.('unsupported');
      return;
    }

    let cancelled = false;
    let recognition: any = null;
    let restartTimer: ReturnType<typeof setTimeout> | null = null;
    let lastWakeAt = 0;
    let started = false;

    (async () => {
      // Permissão de mic PRIMEIRO (padrão CORTEX): sem isso o SpeechRecognition
      // falha com 'not-allowed' sem nunca mostrar prompt. O stream é fechado na
      // hora — o reconhecedor abre o próprio stream interno.
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        stream.getTracks().forEach((t) => t.stop());
      } catch {
        console.warn('[wake] permissão de microfone negada');
        onErrorRef.current?.('mic-denied');
        return;
      }
      if (cancelled) return;

      recognition = new SR();
      recognition.lang = lang;
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.maxAlternatives = 4;

      recognition.onstart = () => {
        if (!started) { started = true; console.log('[wake] escutando… (diga "Bukowiski")'); }
        else if (wakeDebug()) console.log('[wake] reiniciado, escutando…');
      };

      recognition.onresult = (e: any) => {
        for (let i = e.resultIndex; i < e.results.length; i++) {
          // Varre TODAS as alternativas do STT — "Bukowiski" é nome próprio e
          // muitas vezes só aparece na 2ª/3ª hipótese do reconhecedor.
          const res = e.results[i];
          for (let j = 0; j < (res?.length ?? 0); j++) {
            const transcript = String(res[j]?.transcript ?? '');
            if (wakeDebug() && transcript.trim()) console.log('[wake] ouvi (alt ' + j + (res.isFinal ? ', final' : '') + '): "' + transcript.trim() + '"');
            if (!matchesWake(transcript)) continue;
            const now = Date.now();
            if (now - lastWakeAt < 3000) return; // debounce 3s
            lastWakeAt = now;
            console.log('[wake] ACIONOU com: "' + transcript.trim() + '"');
            onWakeRef.current(transcript.trim());
            return;
          }
        }
      };

      recognition.onerror = (e: any) => {
        if (e?.error === 'not-allowed' || e?.error === 'service-not-allowed') {
          console.warn('[wake] microfone bloqueado (not-allowed)');
          cancelled = true; // para de tentar
          onErrorRef.current?.('mic-denied');
          return;
        }
        // 'no-speech' / 'aborted' são o ciclo normal; o resto vale registrar.
        if (e?.error && e.error !== 'no-speech' && e.error !== 'aborted') {
          console.warn('[wake] erro:', e.error);
        }
      };

      recognition.onend = () => {
        // Navegador encerra o reconhecimento sozinho — reinicia (sem reciclagem
        // forçada: parar no meio de uma fala derruba a wake word).
        if (cancelled) return;
        if (restartTimer) clearTimeout(restartTimer);
        restartTimer = setTimeout(() => {
          if (cancelled) return;
          try { recognition.start(); } catch (err) {
            if (!String((err as Error)?.message).includes('already started')) {
              console.warn('[wake] restart falhou:', (err as Error)?.message);
            }
          }
        }, 200);
      };

      try {
        recognition.start();
      } catch (err) {
        console.warn('[wake] start falhou:', (err as Error)?.message);
        onErrorRef.current?.((err as Error)?.message || 'start-failed');
      }
    })();

    return () => {
      cancelled = true;
      if (restartTimer) clearTimeout(restartTimer);
      try { recognition?.abort(); } catch { /* noop */ }
      recognition = null;
    };
  }, [enabled, lang]);
}
