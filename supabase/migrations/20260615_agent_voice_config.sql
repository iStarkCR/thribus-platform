-- ============================================================================
-- Skill de Voz — config por colaborador (TTS + STT)
-- ============================================================================
-- Quando enabled, o colaborador responde falando (TTS) e o modo voz fica
-- disponível. Provider 'browser' usa voz nativa (sem backend/chave).
-- 'elevenlabs'/'openai' usam Edge Functions (tts/transcribe) que leem esta
-- config via service role.
--
-- SEGURANÇA: api_key fica server-side; RLS só super-admin lê/escreve. (Pra
-- produção real, mover a chave pro vault/secret — flag de melhoria.)
-- ============================================================================

create table if not exists public.agent_voice_config (
  agent_id     text primary key references public.agents(id) on delete cascade,
  enabled      boolean not null default false,
  provider     text not null default 'browser' check (provider in ('browser', 'elevenlabs', 'openai')),
  voice_id     text,
  model        text,
  api_key      text,
  stt_enabled  boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

alter table public.agent_voice_config enable row level security;

create policy "voicecfg_admin_all" on public.agent_voice_config
  for all
  using (public.is_super_admin())
  with check (public.is_super_admin());
