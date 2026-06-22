-- ============================================================================
-- Cortex Brain — teto de contexto configurável (rotação/reset de conversa)
-- ============================================================================
-- Quanto uma conversa do time pode acumular (tokens do turno: input + cache)
-- antes de rotacionar/resetar a sessão do Claude. O daemon (WhatsApp/Telegram) e
-- a ponte (painel) leem este valor de scope='global' e aplicam no corte.
--
-- Menor  → reseta cedo: mais barato e responde melhor (janela enxuta), mas perde
--          contexto contínuo antes.
-- Maior  → segura a conversa por mais tempo: mais memória, porém mais cara.
--
-- Default 250k (piso). O painel ajusta até 1M (janela máxima do cérebro Max).
-- ============================================================================

alter table public.cortex_brain_config
  add column if not exists context_limit_tokens integer not null default 250000
    check (context_limit_tokens between 250000 and 1000000);
