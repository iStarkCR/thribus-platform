-- ════════════════════════════════════════════════════════════════════════
-- Clone Bianca prod → thribus_staging (Postgres self-hosted Coolify)
-- ════════════════════════════════════════════════════════════════════════
-- Esse script roda em DUAS etapas:
--
-- ETAPA 1 — No Supabase managed (PROD):
--   - Cole o bloco "EXTRAÇÃO" abaixo no SQL Editor do Supabase
--   - O resultado vai ser uma série de INSERT statements prontos
--   - Copie a saída
--
-- ETAPA 2 — No thribus_staging (self-hosted):
--   - Cole os INSERT statements gerados
--   - Vai popular: workspace, agent (Bianca clone), tools relacionadas
--
-- Por que 2 etapas: não temos link direto entre os dois bancos. O dump-and-load
-- manual é simples e idempotente.
--
-- ⚠️ NÃO copia conversations, messages, executions, escalations — esses são
--    dados operacionais reais que não pertencem a um clone de staging.
--    Staging deve ter dados sintéticos / de teste só.
-- ════════════════════════════════════════════════════════════════════════

-- ──────────────────────────────────────────────────────────────────────────
-- ETAPA 1 — EXTRAÇÃO (rodar no Supabase managed = prod)
-- ──────────────────────────────────────────────────────────────────────────
-- Cole isso no SQL Editor do Supabase prod e copie a coluna `insert_stmt`:

-- 1.1 — Workspace da Bianca (TexNet)
select format(
  $stmt$insert into workspaces (id, name, llm_provider, llm_api_key, crm_provider, crm_base_url, crm_account_id, crm_api_token, texnet_bot_sender_id, talki_required_label, credentials, router_config) values (%L, %L, %L, %L, %L, %L, %L, %L, %L, %L, %L::jsonb, %L::jsonb) on conflict (id) do update set name = excluded.name, llm_provider = excluded.llm_provider, llm_api_key = excluded.llm_api_key, crm_provider = excluded.crm_provider, crm_base_url = excluded.crm_base_url, crm_account_id = excluded.crm_account_id, crm_api_token = excluded.crm_api_token, texnet_bot_sender_id = excluded.texnet_bot_sender_id, talki_required_label = excluded.talki_required_label, credentials = excluded.credentials, router_config = excluded.router_config;$stmt$,
  id, name, llm_provider, llm_api_key, crm_provider, crm_base_url, crm_account_id, crm_api_token, texnet_bot_sender_id, talki_required_label,
  coalesce(credentials::text, '{}'),
  coalesce(router_config::text, 'null')
) as insert_stmt
from workspaces
where id in (select workspace_id from agents where name ilike 'bianca%' limit 1);

-- 1.2 — Agent Bianca
select format(
  $stmt$insert into agents (id, name, client, sector, type, status, model, system_prompt, tools, channel, workspace_id, audio_out_enabled, role) values (%L, %L, %L, %L, %L, %L, %L, %L, %L::text[], %L, %L, %L, %L) on conflict (id) do update set name = excluded.name, client = excluded.client, sector = excluded.sector, type = excluded.type, status = excluded.status, model = excluded.model, system_prompt = excluded.system_prompt, tools = excluded.tools, channel = excluded.channel, workspace_id = excluded.workspace_id, audio_out_enabled = excluded.audio_out_enabled, role = excluded.role;$stmt$,
  id, name, client, sector, type, status, model, system_prompt,
  array_to_string(array(select unnest(tools)), ',', ''), -- coleção como string CSV
  channel, workspace_id, audio_out_enabled, role
) as insert_stmt
from agents
where name ilike 'bianca%';

-- 1.3 — Tools que a Bianca usa (escopo global ou cliente da Bianca)
select format(
  $stmt$insert into tools (id, name, description, endpoint, method, scope, active, auth_type, auth_credentials, extra_headers) values (%L, %L, %L, %L, %L, %L, %L, %L, %L::jsonb, %L::jsonb) on conflict (id) do update set name = excluded.name, description = excluded.description, endpoint = excluded.endpoint, method = excluded.method, scope = excluded.scope, active = excluded.active, auth_type = excluded.auth_type, auth_credentials = excluded.auth_credentials, extra_headers = excluded.extra_headers;$stmt$,
  id, name, description, endpoint, method, scope, active, auth_type,
  coalesce(auth_credentials::text, 'null'),
  coalesce(extra_headers::text, 'null')
) as insert_stmt
from tools
where active = true
  and (
    scope = 'global'
    or scope ilike (select client from agents where name ilike 'bianca%' limit 1)
  )
  and name = any (
    (select tools from agents where name ilike 'bianca%' limit 1)
  );

-- ──────────────────────────────────────────────────────────────────────────
-- ETAPA 2 — APLICAÇÃO (rodar no thribus_staging via thribus-pg)
-- ──────────────────────────────────────────────────────────────────────────
-- Cole os INSERT statements gerados pela etapa 1, na ordem:
--   1. workspace (precisa existir antes do agent)
--   2. tools (não tem FK pro agent, mas estão referenciadas em agent.tools)
--   3. agent (FK pra workspace)
--
-- ⚠️ Importante: o array `tools` no INSERT do agent vem como CSV string.
--    Pra rodar no thribus_staging, é preciso converter de volta:
--    Substituir `'tool1,tool2,tool3'::text[]` por
--               `array['tool1', 'tool2', 'tool3']::text[]`
--    Ou usar `string_to_array('tool1,tool2,tool3', ',')`.
--
-- Comando completo:
--
-- ssh -i ~/.ssh/thribus_vps root@147.93.131.93 \
--   "docker exec -i usicyqipyjfjxap7kgvkw261 psql -U postgres -d thribus_staging" \
--   <<EOF
-- begin;
--
-- -- COLE AQUI os INSERTs gerados na ETAPA 1 (workspace, tools, agent)
--
-- commit;
--
-- -- Verificação:
-- select 'workspaces:' as t, count(*) from workspaces
-- union all select 'agents:', count(*) from agents
-- union all select 'tools:', count(*) from tools;
-- EOF
--
-- ──────────────────────────────────────────────────────────────────────────
-- ETAPA 3 — Instalar skill na Bianca staging (já vem das seeds do thribus_staging)
-- ──────────────────────────────────────────────────────────────────────────

-- Roda no thribus_staging:
--
-- insert into agent_skills (agent_id, skill_id, enabled)
-- select a.id, s.id, true
-- from agents a, skills s
-- where a.name ilike 'bianca%'
--   and s.slug = 'consulta-viabilidade-isp'
-- on conflict (agent_id, skill_id) do update set enabled = true;
--
-- ──────────────────────────────────────────────────────────────────────────
-- ETAPA 4 — Subir worker staging apontando pra thribus_staging
-- ──────────────────────────────────────────────────────────────────────────
--
-- No Coolify, criar novo Service pro worker staging com:
--
--   SUPABASE_URL=https://pg-staging.thribustech.com         (PostgREST self-hosted)
--   SUPABASE_SERVICE_ROLE_KEY=<service_role JWT do bootstrap.sh>
--   SUPABASE_SCHEMA=public
--   M3_SKILLS_ENABLED=true
--   OPENAI_API_KEY=<copia do worker prod, ou usa key separada de dev>
--   ANTHROPIC_API_KEY=<idem>
--   TEXNET_BASE_URL=https://texcrm.texnet.com.br/api/v1
--   TEXNET_API_KEY=<key separada pra staging — NÃO reutilizar prod, e marcar
--                   no TexNet como "bot staging" pra evitar confusão>
--   POLL_ENABLED=false                  ← IMPORTANTE: não pollar TexNet em staging
--                                          (senão vai responder leads reais)
--   POLL_PHONE_WHITELIST=<seu número>   ← se for testar polling, só seu telefone
--
-- O worker staging deve atender:
--   - Mensagens enviadas pra um número de WhatsApp DIFERENTE do prod
--   - OU mensagens com header X-Test=true (se tiver lógica de teste)
--   - Idealmente: workspace.channel = "texnet-duall-staging" (canal separado)
--
-- ──────────────────────────────────────────────────────────────────────────
