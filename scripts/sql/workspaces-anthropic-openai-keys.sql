-- ══════════════════════════════════════════════════════
-- Workspaces — chaves separadas Anthropic + OpenAI
-- ══════════════════════════════════════════════════════
-- Antes: 1 campo `llm_api_key` servia pros 2 providers — trocar modelo
-- (ex: claude-* → gpt-*) com chave do provider errado dava 401.
-- Depois: 2 colunas dedicadas (`anthropic_api_key`, `openai_api_key`).
-- O worker escolhe a chave certa baseado no prefixo do model do agente
-- (claude-* → anthropic, gpt-*/o1-/o3- → openai). Fallback: env vars.
--
-- Backfill: o valor existente em `llm_api_key` migra pra coluna do
-- provider declarado em `llm_provider` (preserva config atual sem
-- exigir re-cadastro). `llm_api_key` fica como deprecated (legacy).
--
-- Idempotente — pode rodar várias vezes sem efeito colateral.
-- ══════════════════════════════════════════════════════

-- ─── 1. Adiciona colunas ──────────────────────────────────────────────────────
alter table workspaces
  add column if not exists anthropic_api_key text,
  add column if not exists openai_api_key text;

comment on column workspaces.anthropic_api_key is
  'API key Anthropic — usada quando agent.model começa com "claude-". Fallback: env ANTHROPIC_API_KEY.';
comment on column workspaces.openai_api_key is
  'API key OpenAI — usada quando agent.model começa com "gpt-"/"o1-"/"o3-". Fallback: env OPENAI_API_KEY.';
comment on column workspaces.llm_api_key is
  'DEPRECATED — usar anthropic_api_key OU openai_api_key. Mantido pra retrocompat até remoção planejada.';

-- ─── 2. Backfill — copia llm_api_key pra coluna do provider declarado ────────
update workspaces
set anthropic_api_key = llm_api_key
where llm_provider = 'anthropic'
  and llm_api_key is not null
  and llm_api_key <> ''
  and (anthropic_api_key is null or anthropic_api_key = '');

update workspaces
set openai_api_key = llm_api_key
where llm_provider = 'openai'
  and llm_api_key is not null
  and llm_api_key <> ''
  and (openai_api_key is null or openai_api_key = '');

-- ─── 3. Verificação ──────────────────────────────────────────────────────────
select
  name,
  llm_provider,
  case when llm_api_key       is not null and llm_api_key       <> '' then '✓' else '·' end as legacy_key,
  case when anthropic_api_key is not null and anthropic_api_key <> '' then '✓' else '·' end as anthropic_key,
  case when openai_api_key    is not null and openai_api_key    <> '' then '✓' else '·' end as openai_key,
  case when crm_api_token     is not null and crm_api_token     <> '' then '✓' else '·' end as crm_token,
  case when credentials::text <> '{}' and credentials is not null     then '✓' else '·' end as creds_jsonb
from workspaces
order by name;
