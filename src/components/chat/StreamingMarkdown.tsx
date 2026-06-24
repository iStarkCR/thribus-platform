/**
 * Revela a resposta com efeito máquina de escrever (suave, char a char) na PROSA,
 * mas blocos — cerca ```…``` (código/chart/cards/artifact) e tabelas — aparecem
 * INTEIROS de uma vez (nunca caractere-a-caractere, que fica estranho). Enquanto
 * o texto ainda chega, a barrinha (no TalkPage) fica piscando.
 *
 * A ponte streama em chunks de ~400ms; aqui suavizamos com catch-up: revela mais
 * rápido quando está atrás, em ritmo de digitação quando perto do fim.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Markdown } from '@/components/shared/Markdown';

const isFenceLine = (l: string) => /^\s*```/.test(l);
const isTableRow = (l: string) => /^\s*\|.*\|\s*$/.test(l);
const isTableSep = (l: string) => /-/.test(l) && /^\s*\|?[\s:|-]+\|[\s:|-]*$/.test(l);

// Regiões [início,fim) em caracteres dos blocos (cerca + tabela) — usadas pra
// "saltar" o cursor por cima deles (revelar inteiro), nunca parar no meio.
function blockRegions(text: string): Array<[number, number]> {
  const lines = text.split('\n');
  const start: number[] = [];
  let off = 0;
  for (const l of lines) { start.push(off); off += l.length + 1; }
  const end = text.length;
  const regions: Array<[number, number]> = [];
  let i = 0;
  while (i < lines.length) {
    if (isFenceLine(lines[i])) {
      let j = i + 1;
      while (j < lines.length && !isFenceLine(lines[j])) j++;
      const e = j < lines.length ? start[j] + lines[j].length : end;
      regions.push([start[i], e]);
      i = j + 1;
      continue;
    }
    if (isTableRow(lines[i]) && i + 1 < lines.length && isTableSep(lines[i + 1])) {
      let j = i + 2;
      while (j < lines.length && isTableRow(lines[j])) j++;
      const e = j < lines.length ? start[j] : end;
      regions.push([start[i], e]);
      i = j;
      continue;
    }
    i++;
  }
  return regions;
}

// Posição da última cerca ``` ABERTA (sem fechamento) — corta o bloco incompleto
// pra não piscar JSON/código cru; ele aparece inteiro quando a cerca fecha.
function openFenceStart(text: string): number {
  const lines = text.split('\n');
  let off = 0, openAt = -1, inFence = false;
  for (const l of lines) {
    if (isFenceLine(l)) { inFence = !inFence; openAt = inFence ? off : -1; }
    off += l.length + 1;
  }
  return inFence ? openAt : -1;
}

export function StreamingMarkdown({ text, streaming, onAction, onOpenArtifact }: {
  text: string;
  streaming: boolean;
  onAction?: (t: string) => void;
  onOpenArtifact?: (a: { title: string; type?: string; content: string }) => void;
}) {
  // Alvo: enquanto streama, esconde a cerca incompleta do fim.
  const target = useMemo(() => {
    if (!streaming) return text;
    const of = openFenceStart(text);
    return of >= 0 ? text.slice(0, of) : text;
  }, [text, streaming]);
  const regions = useMemo(() => blockRegions(target), [target]);

  const [n, setN] = useState(streaming ? 0 : text.length);
  const targetRef = useRef(target); targetRef.current = target;
  const regionsRef = useRef(regions); regionsRef.current = regions;

  useEffect(() => {
    if (!streaming) { setN(text.length); return; }
    // respeita "reduzir movimento": sem animação.
    if (typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      setN(targetRef.current.length); return;
    }
    const id = setInterval(() => {
      setN((cur) => {
        const t = targetRef.current;
        if (cur >= t.length) return cur;
        let next = cur + Math.max(2, Math.min(60, Math.ceil((t.length - cur) / 10)));
        for (const [s, e] of regionsRef.current) { if (next > s && next < e) { next = e; break; } } // salta bloco inteiro
        return Math.min(next, t.length);
      });
    }, 30);
    return () => clearInterval(id);
  }, [streaming, text.length]);

  const shown = streaming ? target.slice(0, n) : text;
  return <Markdown text={shown} onAction={onAction} onOpenArtifact={onOpenArtifact} />;
}
