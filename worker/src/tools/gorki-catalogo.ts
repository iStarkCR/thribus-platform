/**
 * consultar_imoveis_gorki — catálogo de imóveis da Gorki Imóveis (read-only).
 *
 * Tool EXCLUSIVA da agente Ana Vitória (workspace `gorki-imoveis`). Busca o
 * JSON público do site da Gorki, cacheia em memória por alguns minutos, filtra
 * pelos parâmetros que o LLM passar e devolve no máximo ~6 resultados RESUMIDOS
 * (nunca o objeto inteiro com 46 características e 29 fotos).
 *
 * É tratada como INTERNAL tool (sem HTTP via dispatcher genérico) porque precisa
 * de lógica própria: fetch + cache + filtro + resumo. O isolamento por agente é
 * garantido no DB: a tool tem scope = "Gorki Imóveis" e só a Ana tem o nome no
 * array agents.tools (ver scripts/sql/gorki-provision.sql).
 *
 * Fonte dos dados confirmada (eng. reversa do site, 2026-10-19):
 *   https://www.gorkiimoveis.com.br/data/imoveis.json
 *   { fonte, geradoEm, total, imoveis: Imovel[] }
 */

const CATALOGO_URL = 'https://www.gorkiimoveis.com.br/data/imoveis.json';
const FETCH_TIMEOUT_MS = 10_000;
const CACHE_TTL_MS = 12 * 60 * 1000; // 12 min — catálogo muda raramente
const MAX_RESULTS = 6;
const DESC_IA_MAX = 320;

export interface ImovelRaw {
  id?: number | string;
  codigo?: string;
  codigoImovel?: number | string;
  ativo?: boolean;
  titulo?: string;
  descricao?: string;
  descricaoIA?: string;
  tipo?: string;
  finalidade?: string;
  destaque?: boolean;
  cidade?: string;
  bairro?: string;
  endereco?: string;
  nomeCondominio?: string;
  quartos?: number;
  suites?: number;
  banheiros?: number;
  vagas?: number;
  area?: number;
  preco?: number;
  condominio?: number;
  iptu?: number;
  caracteristicas?: string[];
  imagens?: string[];
  video?: string;
  tourVirtual?: string;
}

export interface GorkiFiltros {
  cidade?: string;
  bairro?: string;
  tipo?: string;
  quartos_min?: number;
  preco_min?: number;
  preco_max?: number;
}

export interface ImovelResumo {
  codigo: string | null;
  titulo: string | null;
  tipo: string | null;
  finalidade: string | null;
  cidade: string | null;
  bairro: string | null;
  quartos: number | null;
  suites: number | null;
  banheiros: number | null;
  vagas: number | null;
  area_m2: number | null;
  preco: number | null;
  condominio: number | null;
  iptu: number | null;
  resumo: string | null;
  tour_virtual?: string;
  video?: string;
  fotos: number;
}

// ─── Cache em memória ───────────────────────────────────────────────────────

interface CacheEntry {
  at: number;
  imoveis: ImovelRaw[];
}

let cache: CacheEntry | null = null;

/** Zera o cache — usado em testes. */
export function _resetGorkiCache(): void {
  cache = null;
}

/**
 * Busca o catálogo (com cache). Lança em falha de rede/timeout — quem chama
 * trata e devolve erro estruturado pro LLM.
 */
export async function fetchCatalogo(now: number = Date.now()): Promise<ImovelRaw[]> {
  if (cache && now - cache.at < CACHE_TTL_MS) {
    return cache.imoveis;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(CATALOGO_URL, { signal: controller.signal });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status} ao buscar catálogo Gorki`);
    }
    const body = (await res.json()) as unknown;
    const imoveis = extractImoveis(body);
    cache = { at: now, imoveis };
    return imoveis;
  } finally {
    clearTimeout(timer);
  }
}

/** Aceita tanto `{ imoveis: [] }` quanto um array cru, por robustez. */
export function extractImoveis(body: unknown): ImovelRaw[] {
  if (Array.isArray(body)) return body as ImovelRaw[];
  if (body && typeof body === 'object' && Array.isArray((body as { imoveis?: unknown }).imoveis)) {
    return (body as { imoveis: ImovelRaw[] }).imoveis;
  }
  return [];
}

// ─── Filtro (puro) ──────────────────────────────────────────────────────────

function norm(v: unknown): string {
  return String(v ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim();
}

function num(v: unknown): number | null {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * Filtra imóveis ativos pelos parâmetros. Matching de texto é por acento-
 * insensitive + substring nos dois sentidos — assim tipo="casa" casa com
 * "casa duplex"/"casa em condomínio", e tipo="comercial" casa com "sala
 * comercial"/"terreno comercial". Campos ausentes no filtro são ignorados.
 */
export function filterImoveis(imoveis: ImovelRaw[], filtros: GorkiFiltros): ImovelRaw[] {
  const fCidade = filtros.cidade ? norm(filtros.cidade) : null;
  const fBairro = filtros.bairro ? norm(filtros.bairro) : null;
  const fTipo = filtros.tipo ? norm(filtros.tipo) : null;
  const fQuartos = num(filtros.quartos_min);
  const fPrecoMin = num(filtros.preco_min);
  const fPrecoMax = num(filtros.preco_max);

  return imoveis.filter((im) => {
    if (im.ativo === false) return false;

    if (fCidade && !norm(im.cidade).includes(fCidade)) return false;
    if (fBairro && !norm(im.bairro).includes(fBairro)) return false;

    if (fTipo) {
      const t = norm(im.tipo);
      // substring em qualquer sentido: "casa" casa com "casa duplex";
      // "sala comercial" casa com filtro "comercial".
      if (!t.includes(fTipo) && !fTipo.includes(t)) return false;
    }

    if (fQuartos !== null) {
      const q = num(im.quartos);
      if (q === null || q < fQuartos) return false;
    }

    const preco = num(im.preco);
    if (fPrecoMin !== null && (preco === null || preco < fPrecoMin)) return false;
    if (fPrecoMax !== null && (preco === null || preco > fPrecoMax)) return false;

    return true;
  });
}

/** Destaque primeiro, depois preço ascendente (nulos por último). */
function ordenar(a: ImovelRaw, b: ImovelRaw): number {
  if (!!a.destaque !== !!b.destaque) return a.destaque ? -1 : 1;
  const pa = num(a.preco);
  const pb = num(b.preco);
  if (pa === null && pb === null) return 0;
  if (pa === null) return 1;
  if (pb === null) return -1;
  return pa - pb;
}

// ─── Resumo (puro) ──────────────────────────────────────────────────────────

export function resumirImovel(im: ImovelRaw): ImovelResumo {
  const resumoTexto = (im.descricaoIA || im.descricao || '').trim();
  const out: ImovelResumo = {
    codigo: im.codigo ?? (im.codigoImovel != null ? String(im.codigoImovel) : null),
    titulo: im.titulo ?? null,
    tipo: im.tipo ?? null,
    finalidade: im.finalidade ?? null,
    cidade: im.cidade || null,
    bairro: im.bairro || null,
    quartos: num(im.quartos),
    suites: num(im.suites),
    banheiros: num(im.banheiros),
    vagas: num(im.vagas),
    area_m2: num(im.area),
    preco: num(im.preco),
    condominio: num(im.condominio),
    iptu: num(im.iptu),
    resumo: resumoTexto
      ? resumoTexto.length > DESC_IA_MAX
        ? `${resumoTexto.slice(0, DESC_IA_MAX).trimEnd()}…`
        : resumoTexto
      : null,
    fotos: Array.isArray(im.imagens) ? im.imagens.length : 0,
  };
  if (im.tourVirtual && im.tourVirtual.trim()) out.tour_virtual = im.tourVirtual.trim();
  if (im.video && im.video.trim()) out.video = im.video.trim();
  return out;
}

// ─── Entry point (usado pela internal tool) ─────────────────────────────────

export interface ConsultaResultado {
  sucesso: boolean;
  total_no_catalogo?: number;
  total_compativel?: number;
  exibindo?: number;
  filtros_aplicados?: GorkiFiltros;
  imoveis?: ImovelResumo[];
  info_pro_llm?: string;
  erro?: string;
}

/** Sanitiza o input bruto do LLM pros filtros tipados. */
export function parseFiltros(input: Record<string, unknown>): GorkiFiltros {
  const str = (v: unknown): string | undefined => {
    const s = typeof v === 'string' ? v.trim() : v != null ? String(v).trim() : '';
    return s ? s : undefined;
  };
  const n = (v: unknown): number | undefined => {
    if (v === undefined || v === null || v === '') return undefined;
    const x = Number(v);
    return Number.isFinite(x) ? x : undefined;
  };
  return {
    cidade: str(input.cidade),
    bairro: str(input.bairro),
    tipo: str(input.tipo),
    quartos_min: n(input.quartos_min),
    preco_min: n(input.preco_min),
    preco_max: n(input.preco_max),
  };
}

export async function consultarImoveisGorki(
  input: Record<string, unknown>,
): Promise<ConsultaResultado> {
  const filtros = parseFiltros(input);

  let catalogo: ImovelRaw[];
  try {
    catalogo = await fetchCatalogo();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      sucesso: false,
      erro: `Não consegui acessar o catálogo da Gorki agora (${msg}). Peça desculpas ao cliente e ofereça encaminhar a um corretor, ou tente de novo em instantes.`,
    };
  }

  const ativos = catalogo.filter((im) => im.ativo !== false);
  const compativeis = filterImoveis(catalogo, filtros).sort(ordenar);
  const exibidos = compativeis.slice(0, MAX_RESULTS).map(resumirImovel);

  return {
    sucesso: true,
    total_no_catalogo: ativos.length,
    total_compativel: compativeis.length,
    exibindo: exibidos.length,
    filtros_aplicados: filtros,
    imoveis: exibidos,
    info_pro_llm:
      exibidos.length === 0
        ? 'Nenhum imóvel ativo bate com esses filtros. NÃO invente opções — diga ao cliente que não há disponível no momento com esse perfil, ofereça ajustar critérios (bairro, faixa de preço, tipo) ou encaminhar a um corretor.'
        : `${compativeis.length} imóvel(is) compatível(is); mostrando os ${exibidos.length} primeiros (destaques e menor preço primeiro). Apresente no MÁXIMO 2 a 4 por vez. Só afirme preço/característica que está aqui — nunca invente. Valores em BRL.`,
  };
}
