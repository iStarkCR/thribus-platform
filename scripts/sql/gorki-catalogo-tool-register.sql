-- ══════════════════════════════════════════════════════
-- Tool `consultar_imoveis_gorki` — registro no DB
-- ══════════════════════════════════════════════════════
-- Cadastra a tool `consultar_imoveis_gorki` na tabela `tools` com
-- scope = 'Gorki Imóveis' (NÃO global) e a adiciona ao array agents.tools
-- da Ana Vitória. O scope + o array garantem o ISOLAMENTO: só agentes com
-- client='Gorki Imóveis' que tenham o nome no array enxergam/chamam a tool.
-- Bianca/Texnet, PdC e GrandCred NÃO têm acesso.
--
-- A tool é INTERNAL (handler em worker/src/tools/gorki-catalogo.ts via
-- tools/internal.ts). O dispatcher detecta o nome em INTERNAL_TOOL_NAMES e
-- NÃO faz HTTP — faz fetch + cache + filtro + resumo em código. O `endpoint`
-- aqui é só documental; nunca é chamado.
--
-- ⚠️  SÓ funciona em runtime DEPOIS do deploy do worker com o código desta
--     branch (feat/gorki-catalogo-tool). Registrar o nome antes do deploy é
--     inofensivo — a tool simplesmente não é resolvida até o código subir.
--
-- Idempotente — pode rodar várias vezes.
-- ══════════════════════════════════════════════════════

-- ─── 1. INSERT/UPSERT na tabela tools ────────────────────────────────────────
insert into tools (name, description, endpoint, method, scope, active)
values (
  'consultar_imoveis_gorki',
  'Consulta o catálogo de imóveis À VENDA da Gorki Imóveis (read-only). Chame SEMPRE antes de apresentar ou afirmar qualquer imóvel/preço/característica — nunca invente. Todos os parâmetros são OPCIONAIS; passe só os que o cliente informou: cidade, bairro, tipo (apartamento/casa/terreno/comercial/etc), quartos_min, preco_min, preco_max (valores em reais, número puro). Retorna até 6 imóveis resumidos (código, título, tipo, bairro/cidade, quartos/suítes, área, preço, condomínio, IPTU, resumo e links de vídeo/tour quando houver). Apresente de 2 a 4 por vez.',
  'internal://consultar_imoveis_gorki',
  'GET',
  'Gorki Imóveis',
  true
)
on conflict (name) do update set
  description = excluded.description,
  endpoint    = excluded.endpoint,
  method      = excluded.method,
  scope       = excluded.scope,
  active      = excluded.active,
  updated_at  = now();

-- ─── 2. Adiciona ao array agents.tools da Ana Vitória (idempotente) ──────────
update agents
set tools = case
  when 'consultar_imoveis_gorki' = any(tools) then tools
  else array_append(tools, 'consultar_imoveis_gorki')
end,
updated_at = now()
where workspace_id = 'gorki-imoveis' and name = 'Ana Vitória';

-- ─── 3. Verificação ──────────────────────────────────────────────────────────
select '─── Tool registrada ───' as info;
select name, scope, active, left(description, 70) || '...' as description_preview
from tools where name = 'consultar_imoveis_gorki';

select '─── Ana Vitória tools ───' as info;
select name, client, workspace_id,
  case when 'consultar_imoveis_gorki' = any(tools) then '✓' else '✗' end as tem_tool,
  tools
from agents where workspace_id = 'gorki-imoveis';
