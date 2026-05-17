/**
 * BrandLogo — renderiza logo oficial de marcas conhecidas.
 *
 * Usa simpleicons.org CDN pra marcas internacionais.
 * Pras brasileiras sem icon oficial, gera badge colorido com iniciais.
 *
 * Uso:
 *   <BrandLogo slug="stripe" size={24} />
 *   <BrandLogo slug="asaas" size={20} />  // fallback custom
 *   <BrandLogo slug="unknown" size={20} fallbackEmoji="🔌" />
 */

import { clsx } from 'clsx';

const SIMPLEICONS = new Set([
  'stripe', 'hubspot', 'slack', 'googlesheets', 'gmail', 'whatsapp',
  'pipedrive', 'amplitude', 'clickup', 'chatwoot', 'zoho', 'notion',
  'supabase', 'mercadopago', 'googledrive', 'box', 'github', 'discord',
  'twilio', 'sendgrid', 'mailchimp', 'instagram', 'meta', 'openai',
  'anthropic', 'elevenlabs',
]);

// Brand colors oficiais (use no parâmetro do CDN pra força a cor)
const BRAND_COLOR: Record<string, string> = {
  stripe: '635BFF',
  hubspot: 'FF7A59',
  slack: '4A154B',
  googlesheets: '34A853',
  gmail: 'EA4335',
  whatsapp: '25D366',
  pipedrive: '24292F',
  amplitude: '1E61F0',
  clickup: '7B68EE',
  chatwoot: '1F93FF',
  zoho: 'C8202F',
  notion: '000000',
  supabase: '3FCF8E',
  mercadopago: '00B1EA',
  openai: '412991',
  anthropic: 'CC785C',
  elevenlabs: '000000',
};

// Customs (brasileiros sem icon oficial)
const CUSTOM: Record<string, { bg: string; fg: string; label: string }> = {
  asaas: { bg: '#1FA653', fg: '#FFFFFF', label: 'a' },
  ixc: { bg: '#0066CC', fg: '#FFFFFF', label: 'IX' },
  geogrid: { bg: '#F59E0B', fg: '#1F2937', label: 'GG' },
  pagarme: { bg: '#65A30D', fg: '#FFFFFF', label: 'P.' },
  iugu: { bg: '#1E40AF', fg: '#FFFFFF', label: 'iu' },
  efi: { bg: '#F97316', fg: '#FFFFFF', label: 'efí' },
  cobrefacil: { bg: '#7C2D12', fg: '#FFFFFF', label: 'CF' },
  '360dialog': { bg: '#25D366', fg: '#FFFFFF', label: '360' },
  texnet: { bg: '#0066CC', fg: '#FFFFFF', label: 'TX' },
  thribus: { bg: '#6B8F5E', fg: '#F5EFE0', label: 'Tt' },
  aionics: { bg: '#7C3AED', fg: '#FFFFFF', label: 'Ai' },
  brisanet: { bg: '#1E40AF', fg: '#FFFFFF', label: 'Br' },
};

interface Props {
  slug: string;
  size?: number;
  fallbackEmoji?: string;
  className?: string;
}

export function BrandLogo({ slug, size = 20, fallbackEmoji, className }: Props) {
  const key = slug.toLowerCase();

  // 1. simpleicons CDN
  if (SIMPLEICONS.has(key)) {
    const color = BRAND_COLOR[key];
    const url = color ? `https://cdn.simpleicons.org/${key}/${color}` : `https://cdn.simpleicons.org/${key}`;
    return (
      <img
        src={url}
        alt={slug}
        width={size}
        height={size}
        className={clsx('object-contain shrink-0', className)}
        loading="lazy"
        onError={(e) => {
          // Falhou CDN — esconde img, mostra emoji fallback
          (e.currentTarget as HTMLImageElement).style.display = 'none';
        }}
      />
    );
  }

  // 2. Custom badge
  if (CUSTOM[key]) {
    const c = CUSTOM[key];
    return (
      <span
        className={clsx('inline-flex items-center justify-center rounded font-bold shrink-0', className)}
        style={{
          width: size,
          height: size,
          background: c.bg,
          color: c.fg,
          fontSize: size * 0.42,
          lineHeight: 1,
          fontFamily: 'system-ui, sans-serif',
        }}
        title={slug}
      >
        {c.label}
      </span>
    );
  }

  // 3. Fallback emoji
  return (
    <span className={clsx('inline-flex items-center justify-center shrink-0', className)} style={{ fontSize: size * 0.9, width: size, height: size, lineHeight: 1 }}>
      {fallbackEmoji ?? '🔌'}
    </span>
  );
}
