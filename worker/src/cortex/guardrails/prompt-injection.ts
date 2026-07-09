/**
 * Prompt Injection Detection — Fase 3 (heurística/regex).
 *
 * Detecta tentativas de manipular o system prompt do agente via mensagem
 * do usuário: override de instruções, extração de prompt, role hijacking,
 * delimitadores falsos e jailbreaks conhecidos (PT-BR + EN).
 *
 * Score-based: cada padrão tem um peso. Score >= BLOCK_THRESHOLD → bloqueia
 * (comportamento default, desligável via CORTEX_INJECTION_BLOCK=false —
 * nesse modo só flagra em details/audit).
 */

export interface InjectionMatch {
  category:
    | 'instruction_override'
    | 'prompt_extraction'
    | 'role_hijack'
    | 'delimiter_injection'
    | 'jailbreak'
    | 'obfuscation';
  pattern: string;
  weight: number;
}

export interface InjectionResult {
  detected: boolean;
  /** Soma dos pesos dos padrões encontrados. */
  score: number;
  /** score >= threshold → recomendação de bloqueio. */
  shouldBlock: boolean;
  matches: InjectionMatch[];
}

const BLOCK_THRESHOLD = 3;

const RULES: Array<{ category: InjectionMatch['category']; regex: RegExp; weight: number }> = [
  // ── Override de instruções ────────────────────────────────────────────────
  {
    category: 'instruction_override',
    regex: /\b(ignore|esque[çc]a|desconsidere|descarte|apague|sobrescreva)\b[\s\S]{0,40}\b(instru[çc][õo]es?|regras?|prompt|diretrizes?|comandos?|orienta[çc][õo]es?|(instructions?|rules?|guidelines?))\b/i,
    weight: 3,
  },
  {
    category: 'instruction_override',
    regex: /\b(ignore|disregard|forget|override)\b[\s\S]{0,40}\b(previous|prior|above|earlier|all|system)\b[\s\S]{0,20}\b(instructions?|rules?|prompts?|messages?)\b/i,
    weight: 3,
  },
  {
    category: 'instruction_override',
    regex: /\b(novas?\s+instru[çc][õo]es|new\s+instructions?)\b[\s\S]{0,30}(:|\bs[ãa]o\b|\bare\b)/i,
    weight: 2,
  },
  // ── Extração de prompt ────────────────────────────────────────────────────
  {
    category: 'prompt_extraction',
    regex: /\b(mostre|revele|repita|imprima|exiba|transcreva|qual\s+[ée]|me\s+d[êe]|show|reveal|repeat|print|output|display)\b[\s\S]{0,50}\b(system\s*prompt|prompt\s+d[eo]\s+sistema|suas?\s+instru[çc][õo]es|initial\s+instructions?|instru[çc][õo]es\s+iniciais|configura[çc][ãa]o\s+interna)\b/i,
    weight: 3,
  },
  {
    category: 'prompt_extraction',
    regex: /\b(everything|tudo)\b[\s\S]{0,20}\b(above|before|acima|antes)\b[\s\S]{0,30}\b(verbatim|literalmente|palavra por palavra|word for word)\b/i,
    weight: 3,
  },
  // ── Role hijack ───────────────────────────────────────────────────────────
  {
    category: 'role_hijack',
    regex: /\b(you\s+are\s+now|voc[êe]\s+(agora\s+[ée]|[ée]\s+agora)|a\s+partir\s+de\s+agora\s+voc[êe]|from\s+now\s+on\s+you)\b/i,
    weight: 2,
  },
  {
    category: 'role_hijack',
    regex: /\b(finja|aja como se|pretend|act as if|roleplay as)\b[\s\S]{0,60}\b(sem\s+(regras|restri[çc][õo]es|limites)|no\s+(rules|restrictions|limits|guidelines)|unrestricted|irrestrito)\b/i,
    weight: 3,
  },
  {
    category: 'role_hijack',
    regex: /\bmodo\s+(desenvolvedor|developer|admin|root|deus|god)\b|\bdeveloper\s+mode\b/i,
    weight: 2,
  },
  // ── Delimiter injection (fingir turnos/tags do sistema) ──────────────────
  {
    category: 'delimiter_injection',
    regex: /<\/?(system|assistant|instructions?|sys)>|\[\/?(SYSTEM|INST|ADMIN)\]|<<\s*SYS\s*>>/i,
    weight: 3,
  },
  {
    category: 'delimiter_injection',
    regex: /^\s*(system|assistant)\s*:/im,
    weight: 1,
  },
  // ── Jailbreaks conhecidos ────────────────────────────────────────────────
  {
    category: 'jailbreak',
    regex: /\b(DAN|do\s+anything\s+now|jailbreak|dev\s*mode\s+enabled|AIM\s+prompt)\b/i,
    weight: 3,
  },
  // ── Ofuscação (pedido pra decodificar + executar) ────────────────────────
  {
    category: 'obfuscation',
    regex: /\b(decodifique|decode|base64)\b[\s\S]{0,40}\b(e\s+(execute|siga|obede[çc]a)|and\s+(execute|follow|obey))\b/i,
    weight: 2,
  },
];

export function detectPromptInjection(text: string): InjectionResult {
  const matches: InjectionMatch[] = [];
  for (const rule of RULES) {
    rule.regex.lastIndex = 0;
    if (rule.regex.test(text)) {
      matches.push({
        category: rule.category,
        pattern: rule.regex.source.slice(0, 60),
        weight: rule.weight,
      });
    }
  }
  const score = matches.reduce((s, m) => s + m.weight, 0);
  return {
    detected: matches.length > 0,
    score,
    shouldBlock: score >= BLOCK_THRESHOLD,
    matches,
  };
}
