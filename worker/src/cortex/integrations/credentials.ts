/**
 * Cortex M3 — cifragem de credenciais de integrações.
 *
 * AES-256-GCM com chave derivada de CORTEX_CRED_KEY (sha256 do valor do env).
 * Formato armazenado: gcm:<iv_b64>:<tag_b64>:<cipher_b64>.
 *
 * Tokens legados gravados em claro (antes desta camada) são detectados pela
 * ausência do prefixo `gcm:` e devolvidos como estão — rotacionar via
 * POST /integrations com o token de novo pra cifrar.
 */

import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

const RAW_KEY = process.env.CORTEX_CRED_KEY;

export const credentialsConfigured = Boolean(RAW_KEY);

function key(): Buffer {
  if (!RAW_KEY) throw new Error('CORTEX_CRED_KEY not configured');
  return createHash('sha256').update(RAW_KEY).digest();
}

export function encryptCredential(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key(), iv);
  const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `gcm:${iv.toString('base64')}:${tag.toString('base64')}:${enc.toString('base64')}`;
}

export function decryptCredential(stored: string): string {
  if (!stored.startsWith('gcm:')) return stored; // legado em claro
  const [, ivB64, tagB64, dataB64] = stored.split(':');
  const decipher = createDecipheriv('aes-256-gcm', key(), Buffer.from(ivB64, 'base64'));
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
  return Buffer.concat([
    decipher.update(Buffer.from(dataB64, 'base64')),
    decipher.final(),
  ]).toString('utf8');
}
