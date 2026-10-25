-- Adiciona 'pocket-tts' (voz local "rafael", custo zero) como provider
-- válido em agent_voice_config. Não afeta linhas existentes.
alter table public.agent_voice_config
  drop constraint if exists agent_voice_config_provider_check;

alter table public.agent_voice_config
  add constraint agent_voice_config_provider_check
  check (provider in ('browser', 'elevenlabs', 'openai', 'pocket-tts'));
