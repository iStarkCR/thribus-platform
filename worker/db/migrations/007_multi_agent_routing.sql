-- ══════════════════════════════════════════════════════
-- Migration 007 — Multi-agent Routing (M2)
-- ══════════════════════════════════════════════════════
-- 1 workspace pode ter N agentes especializados (vendas, suporte, financeiro).
-- 1ª mensagem do cliente é classificada por um "roteador" → manda pro agente
-- certo. Durante a conversa, agente pode chamar `transferir_para_agente` pra
-- repassar (ex: vendas → suporte).
--
-- Aplica em produção (schema "public") OU em staging (rodar com SET search_path
-- ou no DB thribus_staging do Postgres self-hosted).
--
-- Idempotente — pode rodar várias vezes.
-- ══════════════════════════════════════════════════════

-- ─── 1. Coluna 'role' nos agentes ─────────────────────────────────────────────
-- Identifica o papel do agente dentro do workspace. Usado pelo roteador
-- pra decidir destino e pela UI pra agrupar visualmente.

alter table agents
  add column if not exists role text;

comment on column agents.role is
  'Papel do agente: sales | support | finance | retention | generic. Usado pelo roteador (M2) pra decidir destino da conversa.';

-- ─── 2. Config do roteador no workspace ───────────────────────────────────────
-- Cada workspace pode ter um roteador habilitado. O config contém:
--   {
--     "enabled": true,
--     "model": "gpt-4o-mini",            // modelo barato/rápido pra classificação
--     "router_prompt": "Classifique...",  // instrução de classificação
--     "intents": {                        // mapeamento intent → agent_id
--       "sales": "agent-id-bianca",
--       "support": "agent-id-renata",
--       "finance": "agent-id-marcos"
--     },
--     "fallback_agent_id": "agent-id-bianca"  // se classificação falhar/ambígua
--   }

alter table workspaces
  add column if not exists router_config jsonb;

comment on column workspaces.router_config is
  'Config do roteador multi-agente (M2). Quando enabled=true, 1ª msg da conversa é classificada por LLM e direcionada pro agent_id apropriado. Schema: {enabled, model, router_prompt, intents{intent→agent_id}, fallback_agent_id}.';

-- ─── 3. Rastreamento de transferências entre agentes ─────────────────────────
-- Quando agente A chama transferir_para_agente(B), gravamos pra debug/analytics.
-- Não é constraint forte — só log estruturado.

alter table conversations
  add column if not exists transferred_from_agent_id text,
  add column if not exists transferred_at timestamptz,
  add column if not exists transfer_reason text;

comment on column conversations.transferred_from_agent_id is
  'Se a conversa foi transferida via transferir_para_agente, guarda agent_id anterior pra trilha de auditoria.';

-- ─── 4. Verificação ───────────────────────────────────────────────────────────
select 'Colunas adicionadas:' as info;
select table_name, column_name, data_type
from information_schema.columns
where table_schema = current_schema()
  and (
    (table_name = 'agents' and column_name = 'role')
    or (table_name = 'workspaces' and column_name = 'router_config')
    or (table_name = 'conversations' and column_name in ('transferred_from_agent_id', 'transferred_at', 'transfer_reason'))
  )
order by table_name, column_name;
