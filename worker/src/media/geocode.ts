/**
 * Reverse geocoding — converte lat/lng em endereço usando Nominatim (OSM).
 *
 * Usado quando o cliente manda pin de localização do WhatsApp. Sem isso, o
 * agente tem que pedir endereço por texto (fluxo quebrado, perde lead).
 *
 * Nominatim: free, sem chave, mas:
 *  - 1 req/sec max por User-Agent (https://operations.osmfoundation.org/policies/nominatim/)
 *  - User-Agent obrigatório identificando o app
 *  - Em produção alto-volume, considerar self-host ou outro provider (Google,
 *    Mapbox, HERE). Pra Bianca/Texnet (~80 conv/dia, location é minoria) tá ok.
 *
 * Custo: $0. Sem chave. Sem dep externa.
 */

const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/reverse';
const USER_AGENT = 'thribus-tech-bianca/1.0 (https://thribustech.com)';
const TIMEOUT_MS = Number(process.env.GEOCODE_TIMEOUT_MS ?? 8_000);

interface NominatimResponse {
  address?: {
    road?: string;
    house_number?: string;
    suburb?: string;       // bairro
    neighbourhood?: string; // bairro alternativo
    city?: string;
    town?: string;
    village?: string;
    state?: string;
    postcode?: string;
    country?: string;
  };
  display_name?: string;
  error?: string;
}

export interface ResolvedAddress {
  /** Endereço formatado pt-BR, ex: "Rua X, 123, Aldeota, Fortaleza/CE" */
  formatted: string;
  /** Componentes individuais — útil pra preflight da viabilidade */
  road?: string;
  number?: string;
  neighborhood?: string;
  city?: string;
  state?: string;
  postcode?: string;
}

/**
 * Faz reverse geocoding em lat/lng. Retorna null se falhar ou for ambíguo.
 *
 * Filtra resultados fora do Brasil (Geogrid não cobre, e a Texnet só atende
 * RMF/Fortaleza) — retorna null se vier de outro país.
 */
export async function reverseGeocode(lat: number, lng: number): Promise<ResolvedAddress | null> {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    console.warn(`[geocode] lat/lng inválidos: lat=${lat} lng=${lng}`);
    return null;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const url = `${NOMINATIM_URL}?format=jsonv2&lat=${lat}&lon=${lng}&zoom=18&accept-language=pt-BR`;
    const res = await fetch(url, {
      headers: {
        'User-Agent': USER_AGENT,
        'Accept': 'application/json',
      },
      signal: controller.signal,
    });

    if (!res.ok) {
      console.warn(`[geocode] Nominatim HTTP ${res.status} lat=${lat} lng=${lng}`);
      return null;
    }

    const data = (await res.json()) as NominatimResponse;
    if (!data.address) {
      console.warn(`[geocode] sem campo address na resposta lat=${lat} lng=${lng}`);
      return null;
    }

    // Filtro: só Brasil (Texnet atende RMF/Fortaleza; coordenadas de outros
    // países raramente fazem sentido — se vier, prefiro retornar null e deixar
    // o agente pedir endereço por texto).
    if (data.address.country && data.address.country.toLowerCase() !== 'brasil' &&
        data.address.country.toLowerCase() !== 'brazil') {
      console.warn(`[geocode] coordenada fora do Brasil (${data.address.country}) — ignorando`);
      return null;
    }

    const road = data.address.road;
    const number = data.address.house_number;
    const neighborhood = data.address.suburb ?? data.address.neighbourhood;
    const city = data.address.city ?? data.address.town ?? data.address.village;
    const state = data.address.state;
    const postcode = data.address.postcode;

    // Formata pt-BR: "Rua X, 123, Aldeota, Fortaleza/CE, 60150-000"
    const parts: string[] = [];
    if (road) parts.push(number ? `${road}, ${number}` : road);
    if (neighborhood) parts.push(neighborhood);
    if (city && state) parts.push(`${city}/${state.slice(0, 2).toUpperCase()}`);
    else if (city) parts.push(city);
    if (postcode) parts.push(postcode);

    const formatted = parts.length > 0
      ? parts.join(', ')
      : (data.display_name ?? '');

    if (!formatted) {
      console.warn(`[geocode] resposta sem componentes utilizáveis lat=${lat} lng=${lng}`);
      return null;
    }

    return { formatted, road, number, neighborhood, city, state, postcode };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[geocode] erro lat=${lat} lng=${lng}: ${msg}`);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Extrai lat/lng de payloads de location do WhatsApp em formatos variados:
 *  - String "lat,lon" (Evolution): "-3.7327,-38.5267"
 *  - JSON {"latitude": -3.7, "longitude": -38.5} (360dialog)
 *  - JSON {"lat": -3.7, "lng": -38.5} ou {"lat": -3.7, "lon": -38.5}
 *
 * Retorna null se não conseguir parsear.
 */
export function parseLocationContent(content: unknown): { lat: number; lng: number } | null {
  if (typeof content === 'string') {
    // Tenta parsear como JSON primeiro
    try {
      const json = JSON.parse(content);
      return parseLocationContent(json);
    } catch {
      // Não é JSON. Tenta "lat,lon"
      const match = content.match(/^\s*(-?\d+\.?\d*)\s*,\s*(-?\d+\.?\d*)\s*$/);
      if (match) {
        const lat = parseFloat(match[1]);
        const lng = parseFloat(match[2]);
        if (Number.isFinite(lat) && Number.isFinite(lng)) return { lat, lng };
      }
      return null;
    }
  }
  if (typeof content === 'object' && content !== null) {
    const obj = content as Record<string, unknown>;
    const lat = Number(obj.latitude ?? obj.lat);
    const lng = Number(obj.longitude ?? obj.lng ?? obj.lon);
    if (Number.isFinite(lat) && Number.isFinite(lng)) return { lat, lng };
  }
  return null;
}
