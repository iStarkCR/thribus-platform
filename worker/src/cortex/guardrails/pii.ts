/**
 * PII Detection & Masking — Fase 2 (regex-based).
 *
 * Detecta padrões comuns BR: CPF, CNPJ, RG, telefone, e-mail, cartão de crédito.
 * Mascara ANTES de logar e ANTES de mandar pra LLM (opcional via policy).
 *
 * Fase 3+: detecção via LLM secundário pra casos complexos.
 */

interface PiiMatch {
  type: 'cpf' | 'cnpj' | 'rg' | 'phone' | 'email' | 'credit_card';
  value: string;
  masked: string;
  start: number;
  end: number;
}

const PATTERNS: Array<{ type: PiiMatch['type']; regex: RegExp; mask: (v: string) => string }> = [
  {
    type: 'cpf',
    regex: /\b\d{3}[.\s]?\d{3}[.\s]?\d{3}[-\s]?\d{2}\b/g,
    mask: (v) => `***.***.${v.replace(/\D/g, '').slice(-3, -2)}**-**`,
  },
  {
    type: 'cnpj',
    regex: /\b\d{2}[.\s]?\d{3}[.\s]?\d{3}[/\s]?\d{4}[-\s]?\d{2}\b/g,
    mask: () => `**.***.***/****-**`,
  },
  {
    type: 'credit_card',
    regex: /\b(?:\d[ -]?){13,19}\b/g,
    mask: (v) => `****-****-****-${v.replace(/\D/g, '').slice(-4)}`,
  },
  {
    type: 'email',
    regex: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g,
    mask: (v) => {
      const [local, domain] = v.split('@');
      const visible = local.length <= 2 ? local[0] ?? '' : local.slice(0, 2);
      return `${visible}***@${domain}`;
    },
  },
  {
    type: 'phone',
    // Brasil: (XX) 9XXXX-XXXX, +55 11 9XXXX-XXXX, etc. Bem permissivo.
    regex: /(?:\+?55\s?)?\(?\d{2}\)?\s?9?\d{4}[-\s]?\d{4}\b/g,
    mask: (v) => {
      const digits = v.replace(/\D/g, '');
      if (digits.length < 8) return v;
      return `***-${digits.slice(-4)}`;
    },
  },
  {
    type: 'rg',
    regex: /\b\d{1,2}[.\s]?\d{3}[.\s]?\d{3}[-\s]?[\dxX]\b/g,
    mask: () => `**.***.***-*`,
  },
];

/**
 * Encontra PII no texto. Retorna lista de matches (sem mutar input).
 */
export function detectPii(text: string): PiiMatch[] {
  const matches: PiiMatch[] = [];
  for (const p of PATTERNS) {
    // Reset lastIndex pra cada execução (regex /g é stateful)
    p.regex.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = p.regex.exec(text)) !== null) {
      matches.push({
        type: p.type,
        value: m[0],
        masked: p.mask(m[0]),
        start: m.index,
        end: m.index + m[0].length,
      });
    }
  }
  return matches;
}

/**
 * Substitui PII detectado pela versão mascarada.
 * Aplica do fim pro começo pra não invalidar índices.
 */
export function maskPii(text: string, matches?: PiiMatch[]): string {
  const found = matches ?? detectPii(text);
  if (found.length === 0) return text;
  const sorted = [...found].sort((a, b) => b.start - a.start);
  let result = text;
  for (const m of sorted) {
    result = result.slice(0, m.start) + m.masked + result.slice(m.end);
  }
  return result;
}
