/**
 * Vision support — passar imagens pro LLM como input multimodal.
 *
 * Anthropic e OpenAI ambos aceitam imagens como content blocks.
 * O loop detecta mensagens com URL de imagem e converte pra esses blocos
 * antes de chamar o LLM.
 *
 * Estratégia:
 *   1. Webhook recebe attachment de imagem → URL
 *   2. Loop monta a mensagem como array de blocks: [{type:'image', source}, {type:'text', text}]
 *   3. Provider (Anthropic ou OpenAI) traduz pro formato nativo
 *
 * Não precisamos baixar a imagem nem enviar como base64 (a maioria das URLs
 * é pública direto do CRM/WhatsApp). Mas se a URL estiver atrás de auth,
 * precisamos baixar e mandar como base64.
 */

import type { ImageBlockParam } from '@anthropic-ai/sdk/resources/messages.js';

/**
 * Detecta se o conteúdo de uma mensagem do CRM contém URL de imagem.
 *
 * O webhook do Talki, ao receber attachment de imagem, prefixa o content com:
 *   "[image_url: https://...]"
 * (vide talki/webhook.ts).
 *
 * Esta função extrai a URL e o texto restante (caption).
 */
export function extractImageRefs(content: string): { urls: string[]; text: string } {
  const urls: string[] = [];
  const text = content.replace(/\[image_url:\s*([^\]]+)\]/g, (_match, url) => {
    urls.push(url.trim());
    return '';
  }).trim();
  return { urls, text };
}

/**
 * Converte URL de imagem em ImageBlockParam pro Anthropic.
 * Baixa a imagem e envia como base64 (compatível com versões atuais do SDK
 * e funciona pra URLs privadas).
 *
 * @param url URL da imagem
 * @param downloadHeaders Headers extras pro fetch — usado pra URLs autenticadas
 *                        (ex: TexNet `/api/v1/leads/<id>/messages/<id>/media`
 *                        precisa de `x-api-key`).
 */
export async function urlToAnthropicImageBlock(
  url: string,
  downloadHeaders?: Record<string, string>,
): Promise<ImageBlockParam | null> {
  try {
    const res = await fetch(url, { headers: downloadHeaders });
    if (!res.ok) {
      console.warn(`[vision] download falhou: HTTP ${res.status} url=${url}`);
      return null;
    }
    const arrayBuffer = await res.arrayBuffer();
    const data = Buffer.from(arrayBuffer).toString('base64');
    const contentType = res.headers.get('content-type') ?? 'image/jpeg';
    const mediaType = (contentType.split(';')[0] ?? 'image/jpeg') as
      | 'image/jpeg'
      | 'image/png'
      | 'image/gif'
      | 'image/webp';
    return {
      type: 'image',
      source: {
        type: 'base64',
        media_type: mediaType,
        data,
      },
    };
  } catch (err) {
    console.warn(`[vision] erro processando imagem url=${url}:`, (err as Error).message);
    return null;
  }
}
