/**
 * Content Filtering — Fase 3 (regex-based, conservador).
 *
 * Bloqueia categorias claramente fora de escopo pra agentes de atendimento
 * B2B: instrução de atividade ilegal, malware/intrusão, autolesão e
 * conteúdo sexual envolvendo menores. Propositalmente estreito — falso
 * positivo em atendimento real é pior que deixar o LLM recusar sozinho.
 *
 * Desligável via CORTEX_CONTENT_FILTER=false (só flagra, não bloqueia).
 */

export interface ContentFilterResult {
  flagged: boolean;
  categories: string[];
}

const RULES: Array<{ category: string; regex: RegExp }> = [
  {
    category: 'illegal_activity',
    regex: /\b(como|me ensin[ae]|tutorial|passo a passo|how to)\b[\s\S]{0,50}\b(fabricar|montar|fazer|make|build)\b[\s\S]{0,30}\b(bomba|explosivo|arma\s+caseira|drogas?\s+sint[ée]ticas?|metanfetamina|explosives?|bomb)\b/i,
  },
  {
    category: 'malware_intrusion',
    regex: /\b(crie|escreva|gere|write|create)\b[\s\S]{0,40}\b(ransomware|keylogger|malware|v[íi]rus\s+de\s+computador|exploit\s+0.?day|botnet)\b/i,
  },
  {
    category: 'credential_theft',
    regex: /\b(roubar|capturar|phishing|clonar|steal)\b[\s\S]{0,40}\b(senhas?|credenciais|cart[ãa]o\s+de\s+cr[ée]dito|passwords?|credentials)\b/i,
  },
  {
    category: 'self_harm',
    regex: /\b(como|melhor\s+(jeito|forma)|maneira)\b[\s\S]{0,30}\b(me\s+(matar|machucar)|suicidar|tirar\s+a\s+(minha|pr[óo]pria)\s+vida|kill\s+myself)\b/i,
  },
  {
    category: 'csam',
    regex: /\b(sexual|nud[ea]s?|er[óo]tic[oa]|porn)\w*\b[\s\S]{0,40}\b(crian[çc]as?|menor(es)?\s+de\s+idade|adolescentes?|minors?|children)\b/i,
  },
];

export function filterContent(text: string): ContentFilterResult {
  const categories: string[] = [];
  for (const rule of RULES) {
    rule.regex.lastIndex = 0;
    if (rule.regex.test(text)) categories.push(rule.category);
  }
  return { flagged: categories.length > 0, categories };
}
