/**
 * Tool preflight — validação rápida dos args antes de bater no endpoint HTTP.
 *
 * Razão: o prompt do agent é instrução "soft" — o LLM pode (e às vezes vai)
 * ignorar regras quando o cliente pressiona ("coloca aí e pesquisa"). Pra
 * tools que dependem de input bem-formado pra funcionar (ex:
 * `consultar_viabilidade` precisa de rua + número, senão Geogrid quebra),
 * vale uma checagem determinística no worker — assim o LLM recebe um erro
 * estruturado em vez do dispatcher fazer uma chamada que sabemos que vai
 * falhar.
 *
 * O retorno em caso de bloqueio NÃO é uma exception — é um output estruturado
 * que o LLM consegue interpretar e usar pra pedir mais dados ao cliente.
 */

export interface PreflightResult {
  ok: boolean;
  /** Output já pronto pra retornar ao LLM (formato igual ao output normal da tool). */
  output?: string;
  /** Marker pra logs. */
  reason?: string;
}

/**
 * Detecta se o cliente forneceu endereço de condomínio.
 * Quando é condomínio, a regra "precisa de número da rua" não se aplica —
 * o número está no bloco/apto, não na rua. Geogrid não cobre esse caso bem
 * de qualquer jeito, mas tentamos uma vez antes de escalar.
 */
const CONDOMINIO_HINTS = /\b(bloco|apt[oô]?|condom[ií]nio|edif[ií]cio|residencial|torre)\b/i;

/**
 * Procura número de rua dentro de uma string de endereço.
 *
 * Critério: número que NÃO é CEP (CEP tem 8 dígitos, com ou sem hífen).
 * Aceita formatos comuns: "123", "123A", "123-B", "n° 123", "nº 123".
 */
function hasStreetNumber(query: string): boolean {
  // Remove CEPs primeiro pra não confundir o detector de número
  const withoutCep = query.replace(/\b\d{5}-?\d{3}\b/g, ' ');
  // Procura sequência de 1-5 dígitos (com possível letra/dígito-letra final)
  // O limite de 5 dígitos exclui anos e CEPs sem hífen residuais
  return /\b\d{1,5}[A-Za-z]?\b/.test(withoutCep);
}

/** Procura uma referência de via (rua, av, travessa, etc) na query. */
function hasStreetName(query: string): boolean {
  return /\b(rua|r\.?|avenida|av\.?|travessa|tv\.?|alameda|al\.?|estrada|rod\.?|rodovia|praça|pra[çc]a|via)\b/i.test(query);
}

/** Procura referência geográfica (cidade/bairro). */
function hasCityOrNeighborhood(query: string): boolean {
  // Heurística: pelo menos 2 palavras com inicial maiúscula que não sejam tipo de via
  // OU presença de vírgula seguida de palavra (geralmente cidade/bairro vem após vírgula)
  const parts = query.split(/[,;]/).map((s) => s.trim()).filter(Boolean);
  return parts.length >= 2;
}

/** Procura CEP de 8 dígitos. */
function hasCep(query: string): boolean {
  return /\b\d{5}-?\d{3}\b/.test(query);
}

/**
 * Validação específica do `consultar_viabilidade`.
 *
 * Geogrid funciona com qualquer combinação razoável de endereço. O bloqueio
 * mais útil aqui é: se a query é claramente insuficiente (ex: só CEP, ou só
 * "Maracanaú"), retornar erro estruturado pro LLM pedir mais dados em vez
 * de mandar pro Geogrid e receber `Error in workflow`.
 *
 * Combinações ACEITAS (deixa passar):
 *  - rua + número + cidade
 *  - rua + número + CEP
 *  - rua + número + bairro + cidade
 *  - condomínio (mesmo sem número de rua — o LLM vai escalar se falhar)
 *
 * Combinações BLOQUEADAS (retorna erro):
 *  - só CEP
 *  - só nome de cidade ("Maracanaú", "Fortaleza")
 *  - rua sem número (ambíguo demais)
 */
function validateConsultarViabilidade(input: Record<string, unknown>): PreflightResult {
  const query = String(input.query ?? '').trim();

  if (query.length < 5) {
    return {
      ok: false,
      reason: 'query_too_short',
      output: JSON.stringify({
        erro: 'missing_address',
        mensagem: 'Preciso do endereço completo pra consultar viabilidade. Peça ao cliente: rua, número e cidade (CEP é opcional se já tem cidade).',
      }),
    };
  }

  // Caso especial: condomínio. Deixa passar mesmo sem número de rua —
  // o prompt manda escalar se Geogrid falhar (rota explícita).
  if (CONDOMINIO_HINTS.test(query)) {
    return { ok: true };
  }

  const hasStreet = hasStreetName(query);
  const hasNumber = hasStreetNumber(query);
  const hasCepInQuery = hasCep(query);
  const hasCity = hasCityOrNeighborhood(query);

  // Combinação válida 1: rua + número + (cidade ou CEP)
  if (hasStreet && hasNumber && (hasCity || hasCepInQuery)) {
    return { ok: true };
  }

  // Combinação válida 2: tem CEP e número e algum nome de via
  if (hasCepInQuery && hasNumber && hasStreet) {
    return { ok: true };
  }

  // Caso ambíguo mas plausível: tem rua e número, mas sem cidade nem CEP
  // (ex: "Rua das Flores, 100"). Deixa passar — Geogrid pode resolver
  // se o bairro/cidade for inferível do contexto.
  if (hasStreet && hasNumber) {
    return { ok: true };
  }

  // Bloqueia: dados insuficientes
  const missing: string[] = [];
  if (!hasStreet) missing.push('rua/avenida');
  if (!hasNumber) missing.push('número');
  if (!hasCity && !hasCepInQuery) missing.push('cidade ou CEP');

  return {
    ok: false,
    reason: 'incomplete_address',
    output: JSON.stringify({
      erro: 'incomplete_address',
      faltam: missing,
      mensagem: `Endereço incompleto. Falta(m): ${missing.join(', ')}. Peça ao cliente o que falta antes de chamar consultar_viabilidade novamente. Não chame essa tool sem ter pelo menos rua + número + (cidade ou CEP).`,
      query_recebida: query,
    }),
  };
}

// ─── Validators de data (consultar_agenda + criar_os_agendamento) ───────────
//
// Bug reportado em 2026-05-11: Bianca às vezes agenda em data muito futura
// (cliente diz "13/05" mas vai parar em novembro). Hipótese: LLM inverte
// dia↔mês ao gerar o JSON do tool call.
//
// Defesa em profundidade: preflight valida que data_desejada/data_reservada:
//   1. Está no formato YYYY-MM-DD (ANO-MES-DIA)
//   2. É uma data parseável
//   3. Mês entre 01-12 e dia entre 01-31 (catch o swap óbvio)
//   4. Está entre HOJE-1 e HOJE+90 dias (sanidade — agendamento futuro razoável)
//
// Se inválida, retorna erro estruturado pro LLM com instrução pra corrigir.

interface DateValidation {
  ok: boolean;
  parsed?: Date;
  error?: string;
  /** Sugestão se detectou swap óbvio (dia > 12 em campo de mês) */
  suggested?: string;
}

const DATE_ISO_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

function validateScheduleDate(raw: string, fieldName: string): DateValidation {
  const v = String(raw ?? '').trim();
  if (!v) return { ok: false, error: `${fieldName} vazio` };

  const m = v.match(DATE_ISO_RE);
  if (!m) {
    return { ok: false, error: `${fieldName} deve estar no formato YYYY-MM-DD (ex: 2026-05-13 para 13 de maio de 2026), recebido: "${v}"` };
  }

  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);

  // Mês inválido — pega o caso clássico "2026-13-05" (dia 13 virou mês)
  if (month < 1 || month > 12) {
    const fixed = `${m[1]}-${m[3]}-${m[2]}`;
    return {
      ok: false,
      error: `${fieldName} tem mês inválido (${month}). Você inverteu dia/mês? Formato é YYYY-MM-DD = ANO-MES-DIA. Talvez você quis dizer "${fixed}".`,
      suggested: fixed,
    };
  }

  // Dia inválido pro mês
  if (day < 1 || day > 31) {
    return { ok: false, error: `${fieldName} tem dia inválido (${day})` };
  }

  // Parse + valida que a data existe (ex: 31 de fevereiro não existe)
  const parsed = new Date(year, month - 1, day);
  if (
    parsed.getFullYear() !== year ||
    parsed.getMonth() !== month - 1 ||
    parsed.getDate() !== day
  ) {
    return { ok: false, error: `${fieldName} "${v}" não é uma data real (ex: 31 de fevereiro)` };
  }

  // Sanidade — data plausível pra agendamento (entre ontem e 90 dias no futuro)
  const now = new Date();
  const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
  const ninetyDaysAhead = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 90);

  if (parsed < yesterday) {
    return { ok: false, error: `${fieldName} "${v}" está no passado (${parsed.toISOString().slice(0, 10)} < ${yesterday.toISOString().slice(0, 10)}). Use data futura.` };
  }

  if (parsed > ninetyDaysAhead) {
    // Se passou de 90 dias e dia/mês são swappáveis (ex: month=11 day=05 quando hoje é maio),
    // sugere o swap como hipótese mais provável
    const swapped = `${year}-${String(day).padStart(2, '0')}-${String(month).padStart(2, '0')}`;
    const swapMonth = day;
    const swapDay = month;
    const looksLikeSwap = swapMonth >= 1 && swapMonth <= 12 && swapDay >= 1 && swapDay <= 31;
    return {
      ok: false,
      error: `${fieldName} "${v}" está muito longe (${Math.round((parsed.getTime() - now.getTime()) / 86400000)} dias). Agendamentos são no máximo 90 dias à frente.${looksLikeSwap ? ` Você inverteu dia/mês? Tente "${swapped}".` : ''}`,
      suggested: looksLikeSwap ? swapped : undefined,
    };
  }

  return { ok: true, parsed };
}

function validateConsultarAgenda(input: Record<string, unknown>): PreflightResult {
  const v = validateScheduleDate(String(input.data_desejada ?? ''), 'data_desejada');
  if (v.ok) return { ok: true };
  return {
    ok: false,
    reason: 'invalid_date',
    output: JSON.stringify({
      erro: 'data_invalida',
      mensagem: v.error,
      sugestao: v.suggested,
      instrucao_pro_llm: 'Reformate data_desejada no formato YYYY-MM-DD (ANO-MES-DIA). Mês é 01-12, dia é 01-31. Se cliente disse "13 de maio", passe "2026-05-13" — NÃO inverta dia/mês.',
    }),
  };
}

function validateCriarOsAgendamento(input: Record<string, unknown>): PreflightResult {
  const v = validateScheduleDate(String(input.data_reservada ?? ''), 'data_reservada');
  if (v.ok) return { ok: true };
  return {
    ok: false,
    reason: 'invalid_date',
    output: JSON.stringify({
      erro: 'data_invalida',
      mensagem: v.error,
      sugestao: v.suggested,
      instrucao_pro_llm: 'Reformate data_reservada no formato YYYY-MM-DD. Use o data_disponivel exato que veio de consultar_agenda — NÃO reformate manualmente.',
    }),
  };
}

// ─── Registry ────────────────────────────────────────────────────────────────

/**
 * Mapa de tool → validator. Tools sem entrada aqui passam direto.
 * Adicione validators conforme tools novas exigirem regras de input.
 */
const VALIDATORS: Record<string, (input: Record<string, unknown>) => PreflightResult> = {
  consultar_viabilidade: validateConsultarViabilidade,
  consultar_agenda: validateConsultarAgenda,
  criar_os_agendamento: validateCriarOsAgendamento,
};

/**
 * Roda preflight pra uma tool. Retorna `{ ok: true }` se não há validator
 * ou se passou; senão retorna `{ ok: false, output, reason }` pronto pra
 * ser devolvido ao LLM.
 */
export function preflightCheck(toolName: string, input: Record<string, unknown>): PreflightResult {
  const validator = VALIDATORS[toolName];
  if (!validator) return { ok: true };
  return validator(input);
}
