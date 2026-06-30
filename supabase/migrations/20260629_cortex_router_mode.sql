-- ============================================================================
-- Cortex Router · Fase 3 — modo auto/manual + auditoria do roteamento
-- ============================================================================
-- Liga o Cortex Router (src/services/cortex-router.ts) no fluxo da ponte:
--
--   • cortex_brain_config.mode  → 'auto'   : a ponte chama route() por mensagem
--                                            de chat (profile 'painel') e aplica
--                                            o modelo/esforço decididos.
--                                 'manual' : comportamento fixo (modelo/esforço
--                                            do próprio config vencem — override).
--     Default 'auto': APLICAR esta migration + reiniciar a ponte = ATIVAR o auto
--     (a ponte trata coluna ausente como 'manual', então nada muda até aqui).
--
--   • cortex_usage.tier/reason  → o que o router escolheu por execução, pro badge
--                                 do chat ("roteado: opus · high — sinal pesado")
--                                 e pra auditoria. NULL = execução em modo manual.
--
-- RLS/policies das duas tabelas já existem (20260617_cortex_brain.sql) e não
-- mudam — isto só adiciona colunas. Idempotente (add column if not exists).
-- ============================================================================

-- ─── cortex_brain_config.mode ───────────────────────────────────────────────
alter table public.cortex_brain_config
  add column if not exists mode text not null default 'auto';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.cortex_brain_config'::regclass
      and conname = 'cortex_brain_config_mode_check'
  ) then
    alter table public.cortex_brain_config
      add constraint cortex_brain_config_mode_check check (mode in ('auto','manual'));
  end if;
end $$;

-- ─── cortex_usage.tier / cortex_usage.reason ────────────────────────────────
alter table public.cortex_usage
  add column if not exists tier text;
alter table public.cortex_usage
  add column if not exists reason text;
