-- ══════════════════════════════════════════════════════
-- Migration 009 — agent_templates.workspace_id (M4 marketplace)
-- ══════════════════════════════════════════════════════
-- Pra fechar o conceito de marketplace nos templates (mesmo padrão das
-- skills): templates podem ser públicos (visíveis pra todos) ou privados
-- de um workspace (forkáveis e editáveis).
--
-- Adiciona apenas a coluna FK + índice. is_public já existe da 006.
--
-- Idempotente — safe to re-run.
-- ══════════════════════════════════════════════════════

alter table agent_templates
  add column if not exists workspace_id text;

comment on column agent_templates.workspace_id is
  'Se setado, template é privado deste workspace (forkado ou criado privado). Null = template público/built-in.';

create index if not exists agent_templates_workspace_idx
  on agent_templates(workspace_id)
  where workspace_id is not null;

-- Verificação
select 'agent_templates.workspace_id' as col,
  exists(
    select 1 from information_schema.columns
    where table_name = 'agent_templates' and column_name = 'workspace_id'
  ) as ok;
