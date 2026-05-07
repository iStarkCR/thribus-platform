-- 004_audio_out_enabled.sql
-- ─────────────────────────────────────────────────────────────────────────────
-- Adiciona flag pra agentes responderem em áudio (TTS) opcionalmente.
--
-- Quando true E o cliente envia áudio, o agente pode responder com áudio
-- gerado via OpenAI TTS. Default false (responde só texto).
--
-- O agente decide caso a caso se vai usar áudio (nem toda resposta faz
-- sentido em áudio — ex: lista de planos com emojis fica esquisita falada).
-- ─────────────────────────────────────────────────────────────────────────────

alter table agents
  add column if not exists audio_out_enabled boolean default false;
