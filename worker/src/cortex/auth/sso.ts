/**
 * Cortex Enterprise — SSO básico.
 *
 * Auth via email+password com JWT HMAC-SHA256 (stateless).
 * Provedores externos (Google, Microsoft) ficam pra próxima iteração.
 *
 * Endpoints (em /cortex/auth):
 *   POST /signup          → cria user (e opcionalmente vincula a tenant via inviteToken)
 *   POST /signin          → email+password → JWT
 *   GET  /me              → valida JWT e devolve user + tenants
 *
 * Token é Bearer JWT. Frontend guarda em localStorage e envia em
 * Authorization: Bearer <jwt>.
 */

import { createHash, createHmac, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import express, { type Request, type Response, Router } from 'express';
import { supabase } from '../../db/supabase.js';
import { createLogger } from '../observability/logger.js';

const logger = createLogger('cortex.auth.sso');

const JWT_SECRET = process.env.CORTEX_JWT_SECRET ?? '';
const JWT_TTL_SECONDS = Number(process.env.CORTEX_JWT_TTL_SECONDS ?? 60 * 60 * 24 * 7); // 7d

if (!JWT_SECRET && process.env.NODE_ENV !== 'test') {
  logger.warn('CORTEX_JWT_SECRET ausente — SSO desabilitado até configurar');
}

// ─── JWT (HS256) ──────────────────────────────────────────────────────────

function base64url(buf: Buffer | string): string {
  const b = typeof buf === 'string' ? Buffer.from(buf) : buf;
  return b.toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

function base64urlDecode(s: string): Buffer {
  s = s.replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) s += '=';
  return Buffer.from(s, 'base64');
}

export interface JwtPayload {
  sub: string;          // user_id
  email: string;
  name?: string;
  iat: number;
  exp: number;
}

export function signJwt(payload: Omit<JwtPayload, 'iat' | 'exp'>): string {
  if (!JWT_SECRET) throw new Error('JWT_SECRET not configured');
  const header = base64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const now = Math.floor(Date.now() / 1000);
  const fullPayload: JwtPayload = {
    ...payload,
    iat: now,
    exp: now + JWT_TTL_SECONDS,
  };
  const body = base64url(JSON.stringify(fullPayload));
  const sig = base64url(
    createHmac('sha256', JWT_SECRET).update(`${header}.${body}`).digest(),
  );
  return `${header}.${body}.${sig}`;
}

export function verifyJwt(token: string): JwtPayload | null {
  if (!JWT_SECRET) return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [header, body, sig] = parts;
  const expected = base64url(
    createHmac('sha256', JWT_SECRET).update(`${header}.${body}`).digest(),
  );
  // timing-safe compare
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(base64urlDecode(body).toString('utf8')) as JwtPayload;
    if (typeof payload.exp !== 'number' || payload.exp < Math.floor(Date.now() / 1000)) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}

// ─── Password hashing (scrypt) ────────────────────────────────────────────

function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const derived = scryptSync(password, salt, 64);
  return `scrypt:${salt.toString('hex')}:${derived.toString('hex')}`;
}

function verifyPassword(password: string, stored: string): boolean {
  const parts = stored.split(':');
  if (parts.length !== 3 || parts[0] !== 'scrypt') return false;
  const salt = Buffer.from(parts[1], 'hex');
  const expected = Buffer.from(parts[2], 'hex');
  const derived = scryptSync(password, salt, 64);
  return derived.length === expected.length && timingSafeEqual(derived, expected);
}

function emailLower(email: string): string {
  return email.trim().toLowerCase();
}

// ─── Router ───────────────────────────────────────────────────────────────

export function createSsoRouter(): Router {
  const router = Router();
  router.use(express.json({ limit: '128kb' }));

  router.post('/signup', async (req: Request, res: Response) => {
    if (!supabase) {
      res.status(503).json({ error: 'supabase not configured' });
      return;
    }
    if (!JWT_SECRET) {
      res.status(503).json({ error: 'sso not configured — set CORTEX_JWT_SECRET' });
      return;
    }
    const body = req.body as {
      email?: string;
      password?: string;
      display_name?: string;
      tenant_slug?: string;
      tenant_invite_role?: string;
    };
    const email = emailLower(body.email ?? '');
    if (!email || !body.password || body.password.length < 8) {
      res.status(400).json({ error: 'email + password (>=8 chars) obrigatórios' });
      return;
    }

    const { data: existing } = await supabase
      .from('cortex_users')
      .select('id')
      .eq('email', email)
      .maybeSingle();
    if (existing) {
      res.status(409).json({ error: 'email_already_used' });
      return;
    }

    const passwordHash = hashPassword(body.password);
    const { data: user, error } = await supabase
      .from('cortex_users')
      .insert({
        email,
        password_hash: passwordHash,
        display_name: body.display_name ?? null,
        status: 'active',
        email_verified: false,
      })
      .select('id, email, display_name')
      .maybeSingle();
    if (error || !user) {
      res.status(500).json({ error: error?.message ?? 'create_user_failed' });
      return;
    }

    // Vínculo opcional a tenant via slug
    if (body.tenant_slug) {
      const { data: tenant } = await supabase
        .from('cortex_tenants')
        .select('id')
        .eq('slug', body.tenant_slug)
        .maybeSingle();
      if (tenant) {
        await supabase.from('cortex_user_tenants').insert({
          user_id: user.id,
          tenant_id: tenant.id,
          role: body.tenant_invite_role ?? 'member',
        });
      }
    }

    const token = signJwt({
      sub: user.id,
      email: user.email,
      name: user.display_name ?? undefined,
    });
    res.status(201).json({ user, token });
  });

  router.post('/signin', async (req: Request, res: Response) => {
    if (!supabase) {
      res.status(503).json({ error: 'supabase not configured' });
      return;
    }
    if (!JWT_SECRET) {
      res.status(503).json({ error: 'sso not configured' });
      return;
    }
    const body = req.body as { email?: string; password?: string };
    const email = emailLower(body.email ?? '');
    if (!email || !body.password) {
      res.status(400).json({ error: 'email e password obrigatórios' });
      return;
    }
    const { data: user, error } = await supabase
      .from('cortex_users')
      .select('id, email, password_hash, display_name, status')
      .eq('email', email)
      .maybeSingle();
    if (error || !user || !user.password_hash) {
      res.status(401).json({ error: 'invalid_credentials' });
      return;
    }
    if (user.status !== 'active') {
      res.status(403).json({ error: 'account_disabled' });
      return;
    }
    if (!verifyPassword(body.password, user.password_hash)) {
      res.status(401).json({ error: 'invalid_credentials' });
      return;
    }

    // Update last_login_at em background
    void supabase
      .from('cortex_users')
      .update({ last_login_at: new Date().toISOString() })
      .eq('id', user.id);

    const token = signJwt({
      sub: user.id,
      email: user.email,
      name: user.display_name ?? undefined,
    });
    res.json({
      user: { id: user.id, email: user.email, display_name: user.display_name },
      token,
    });
  });

  router.get('/me', async (req: Request, res: Response) => {
    const header = req.headers.authorization;
    const token = header?.startsWith('Bearer ') ? header.slice(7).trim() : null;
    if (!token) {
      res.status(401).json({ error: 'no_token' });
      return;
    }
    const payload = verifyJwt(token);
    if (!payload) {
      res.status(401).json({ error: 'invalid_token' });
      return;
    }
    if (!supabase) {
      res.json({ user: { id: payload.sub, email: payload.email }, tenants: [] });
      return;
    }
    const { data: tenants } = await supabase
      .from('cortex_user_tenants')
      .select('tenant_id, role, cortex_tenants(id, name, slug, plan, status)')
      .eq('user_id', payload.sub);
    res.json({
      user: { id: payload.sub, email: payload.email, name: payload.name },
      tenants: (tenants ?? []).map((t) => ({
        role: t.role,
        ...(Array.isArray(t.cortex_tenants) ? t.cortex_tenants[0] : t.cortex_tenants),
      })),
    });
  });

  return router;
}

export const passwordUtils = { hashPassword, verifyPassword };
// Hash digest export pra debug — não usar pra auth
export function sha256Hex(s: string): string {
  return createHash('sha256').update(s).digest('hex');
}
