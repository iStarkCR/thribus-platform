/**
 * Cortex M3 — SSO OIDC (Google, Microsoft, GitHub).
 *
 * Flow:
 *   1. GET /cortex/auth/oidc/:provider/start?tenant_slug=X
 *      → gera state, redireciona pro IdP
 *   2. GET /cortex/auth/oidc/:provider/callback?code&state
 *      → troca code por token, busca userinfo, cria/atualiza user, emite JWT
 *
 * Providers configurados via env:
 *   OIDC_GOOGLE_CLIENT_ID, OIDC_GOOGLE_CLIENT_SECRET
 *   OIDC_MICROSOFT_CLIENT_ID, OIDC_MICROSOFT_CLIENT_SECRET
 *   OIDC_GITHUB_CLIENT_ID, OIDC_GITHUB_CLIENT_SECRET
 *   OIDC_CALLBACK_BASE (ex: https://cortex.thribus.com.br)
 */

import { randomBytes } from 'node:crypto';
import express, { type Request, type Response, Router } from 'express';
import { supabase } from '../../db/supabase.js';
import { createLogger } from '../observability/logger.js';
import { signJwt } from './sso.js';

const logger = createLogger('cortex.oidc');

interface OidcProvider {
  authorize_url: string;
  token_url: string;
  userinfo_url: string;
  scope: string;
  client_id_env: string;
  client_secret_env: string;
}

const PROVIDERS: Record<string, OidcProvider> = {
  google: {
    authorize_url: 'https://accounts.google.com/o/oauth2/v2/auth',
    token_url: 'https://oauth2.googleapis.com/token',
    userinfo_url: 'https://openidconnect.googleapis.com/v1/userinfo',
    scope: 'openid email profile',
    client_id_env: 'OIDC_GOOGLE_CLIENT_ID',
    client_secret_env: 'OIDC_GOOGLE_CLIENT_SECRET',
  },
  microsoft: {
    authorize_url: 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize',
    token_url: 'https://login.microsoftonline.com/common/oauth2/v2.0/token',
    userinfo_url: 'https://graph.microsoft.com/oidc/userinfo',
    scope: 'openid email profile User.Read',
    client_id_env: 'OIDC_MICROSOFT_CLIENT_ID',
    client_secret_env: 'OIDC_MICROSOFT_CLIENT_SECRET',
  },
  github: {
    authorize_url: 'https://github.com/login/oauth/authorize',
    token_url: 'https://github.com/login/oauth/access_token',
    userinfo_url: 'https://api.github.com/user',
    scope: 'user:email',
    client_id_env: 'OIDC_GITHUB_CLIENT_ID',
    client_secret_env: 'OIDC_GITHUB_CLIENT_SECRET',
  },
};

const CALLBACK_BASE = process.env.OIDC_CALLBACK_BASE ?? 'http://localhost:3200';

function getProviderConfig(name: string): { provider: OidcProvider; client_id: string; client_secret: string } | null {
  const p = PROVIDERS[name];
  if (!p) return null;
  const client_id = process.env[p.client_id_env];
  const client_secret = process.env[p.client_secret_env];
  if (!client_id || !client_secret) return null;
  return { provider: p, client_id, client_secret };
}

interface UserInfo {
  email: string;
  name?: string;
  picture?: string;
  sub?: string;
}

async function fetchUserInfo(provider: OidcProvider, accessToken: string): Promise<UserInfo | null> {
  try {
    const resp = await fetch(provider.userinfo_url, {
      headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
    });
    if (!resp.ok) return null;
    const data = await resp.json() as { email?: string; name?: string; picture?: string; sub?: string };
    return { email: data.email ?? '', name: data.name, picture: data.picture, sub: data.sub };
  } catch (err) {
    logger.warn('userinfo failed', { error: (err as Error).message });
    return null;
  }
}

export function createOidcRouter(): Router {
  const router = Router();

  // Start: redireciona pro IdP
  router.get('/:provider/start', async (req: Request, res: Response) => {
    const cfg = getProviderConfig(req.params.provider);
    if (!cfg) {
      res.status(503).json({ error: `provider ${req.params.provider} not configured` });
      return;
    }

    const state = randomBytes(24).toString('hex');
    const tenant_slug = typeof req.query.tenant_slug === 'string' ? req.query.tenant_slug : undefined;
    const redirect_after = typeof req.query.redirect === 'string' ? req.query.redirect : undefined;

    if (supabase) {
      let tenant_id: string | null = null;
      if (tenant_slug) {
        const { data } = await supabase.from('cortex_tenants').select('id').eq('slug', tenant_slug).maybeSingle();
        tenant_id = (data?.id as string) ?? null;
      }
      await supabase.from('cortex_sso_states').insert({
        state,
        tenant_id,
        provider: req.params.provider,
        redirect_after: redirect_after ?? null,
        expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
      });
    }

    const url = new URL(cfg.provider.authorize_url);
    url.searchParams.set('client_id', cfg.client_id);
    url.searchParams.set('redirect_uri', `${CALLBACK_BASE}/cortex/auth/oidc/${req.params.provider}/callback`);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('scope', cfg.provider.scope);
    url.searchParams.set('state', state);
    res.redirect(url.toString());
  });

  // Callback: troca code por token + JWT
  router.get('/:provider/callback', async (req: Request, res: Response) => {
    const cfg = getProviderConfig(req.params.provider);
    if (!cfg) return void res.status(503).send('provider not configured');
    const { code, state } = req.query;
    if (typeof code !== 'string' || typeof state !== 'string') return void res.status(400).send('missing_code_or_state');

    // Valida state
    let stateRecord: { tenant_id: string | null; provider: string; redirect_after: string | null } | null = null;
    if (supabase) {
      const { data } = await supabase
        .from('cortex_sso_states')
        .select('tenant_id, provider, redirect_after, expires_at')
        .eq('state', state)
        .maybeSingle();
      if (!data || new Date(data.expires_at as string) < new Date()) return void res.status(400).send('invalid_or_expired_state');
      stateRecord = { tenant_id: data.tenant_id as string | null, provider: data.provider as string, redirect_after: data.redirect_after as string | null };
      await supabase.from('cortex_sso_states').delete().eq('state', state);
    }

    // Troca code por access_token
    let accessToken: string;
    try {
      const tokenResp = await fetch(cfg.provider.token_url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
        body: new URLSearchParams({
          code,
          client_id: cfg.client_id,
          client_secret: cfg.client_secret,
          redirect_uri: `${CALLBACK_BASE}/cortex/auth/oidc/${req.params.provider}/callback`,
          grant_type: 'authorization_code',
        }).toString(),
      });
      if (!tokenResp.ok) return void res.status(400).send(`token_exchange_failed: ${await tokenResp.text()}`);
      const tokenData = await tokenResp.json() as { access_token?: string };
      if (!tokenData.access_token) return void res.status(400).send('no_access_token');
      accessToken = tokenData.access_token;
    } catch (err) {
      return void res.status(500).send(`token_error: ${(err as Error).message}`);
    }

    const userInfo = await fetchUserInfo(cfg.provider, accessToken);
    if (!userInfo?.email) return void res.status(400).send('no_userinfo');

    // Cria/atualiza user
    if (!supabase) return void res.status(503).send('supabase not configured');
    const email = userInfo.email.toLowerCase();
    let userId: string;
    const { data: existing } = await supabase.from('cortex_users').select('id').eq('email', email).maybeSingle();
    if (existing) {
      userId = existing.id as string;
      await supabase.from('cortex_users').update({
        sso_provider: req.params.provider,
        sso_external_id: userInfo.sub ?? null,
        last_login_at: new Date().toISOString(),
        email_verified: true,
      }).eq('id', userId);
    } else {
      const { data: created } = await supabase.from('cortex_users').insert({
        email,
        display_name: userInfo.name ?? null,
        sso_provider: req.params.provider,
        sso_external_id: userInfo.sub ?? null,
        email_verified: true,
        status: 'active',
      }).select('id').maybeSingle();
      userId = created!.id as string;
    }

    // Vincula a tenant se veio state
    if (stateRecord?.tenant_id) {
      await supabase.from('cortex_user_tenants').upsert({
        user_id: userId,
        tenant_id: stateRecord.tenant_id,
        role: 'member',
      }, { onConflict: 'user_id,tenant_id' });
    }

    const token = signJwt({ sub: userId, email, name: userInfo.name });
    const redirect = stateRecord?.redirect_after ?? `${CALLBACK_BASE}/?jwt=${token}`;
    res.redirect(`${redirect}${redirect.includes('?') ? '&' : '?'}jwt=${token}`);
  });

  return router;
}
