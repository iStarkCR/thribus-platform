-- ══════════════════════════════════════════════════════
-- Tool `escalar_humano` — registro no DB
-- ══════════════════════════════════════════════════════
-- Cadastra a tool `escalar_humano` na tabela `tools` (escopo global) e
-- adiciona ao array `agents.tools` da Bianca.
--
-- A tool é INTERNAL (handler em worker/src/tools/internal.ts) — o dispatcher
-- detecta o nome via INTERNAL_TOOL_NAMES e NÃO faz HTTP. O `endpoint` aqui
-- é só pra documentar; nunca é chamado.
--
-- Comportamento (no loop):
--   LLM chama `escalar_humano({motivo: "..."})` →
--   internal handler retorna `{escalated: {motivo}}` →
--   loop chama `handoffToHuman()` que faz:
--     - addInternalNote (resumo do contexto)
--     - escalateToHuman: setBotMode(false) + PATCH stage='aguardando' + responsibleId=null
--   loop break + state=escalated + cleanup do histórico
--
-- Idempotente — pode rodar várias vezes sem efeito colateral.
-- ══════════════════════════════════════════════════════

-- ─── 1. INSERT/UPSERT na tabela tools ────────────────────────────────────────
insert into tools (
  name,
  description,
  endpoint,
  method,
  scope,
  active
)
values (
  'escalar_humano',
  'Escala a conversa pra atendimento humano (move o lead pra fila aguardando, desvincula você como responsável, desativa o bot na conversa). USE SEMPRE que decidir passar pra humano — cliente que pede atendente, sem cobertura, problema técnico recorrente, cliente quer condição comercial fora da sua autonomia, ou erro repetido em outras tools. NÃO basta anunciar em texto — chamar a tool é o que efetivamente move o lead.',
  'internal://escalar_humano',
  'POST',
  'global',
  true
)
on conflict (name) do update set
  description = excluded.description,
  endpoint    = excluded.endpoint,
  method      = excluded.method,
  scope       = excluded.scope,
  active      = excluded.active,
  updated_at  = now();

-- ─── 2. Adiciona ao array agents.tools da Bianca (idempotente) ───────────────
update agents
set tools = case
  when 'escalar_humano' = any(tools) then tools
  else array_append(tools, 'escalar_humano')
end,
updated_at = now()
where name ilike 'bianca%';

-- ─── 3. Verificação ──────────────────────────────────────────────────────────
select
  '─── Tool registrada ───' as info;
select
  name,
  scope,
  active,
  left(description, 80) || '...' as description_preview
from tools
where name = 'escalar_humano';

select
  '─── Bianca tools ───' as info;
select
  name,
  case when 'escalar_humano' = any(tools) then '✓' else '✗' end as tem_escalar_humano,
  array_length(tools, 1) as total_tools,
  tools
from agents
where name ilike 'bianca%';
