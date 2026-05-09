-- ════════════════════════════════════════════════════════════════════════
-- M3 — Rollout em produção (Supabase managed)
-- ════════════════════════════════════════════════════════════════════════
-- Cole este script INTEIRO no SQL Editor do Supabase managed (projeto do
-- Bianca prod). É idempotente — pode rodar várias vezes sem efeito colateral.
--
-- O que faz:
--   1. Aplica migration 008_skills.sql (cria `skills` e `agent_skills`)
--   2. Insere as 2 seeds (consulta-viabilidade-isp v1.1.0, escalacao-humano-padrao)
--   3. Instala skill `consulta-viabilidade-isp` na Bianca prod
--   4. Verifica que tudo aplicou corretamente
--
-- Pré-requisitos:
--   - PR #34 mergeado e worker deployado (já tem M3_SKILLS_ENABLED=true,
--     mas no-op até esse SQL rodar)
--
-- Após rodar:
--   - Bianca prod terá skill ativa no PRÓXIMO turno (worker lê skills a cada job)
--   - A skill apenda um prompt_fragment de ~2.4kb no system_prompt
--   - Não há flag de "rollback fácil" — pra desativar, basta:
--       update agent_skills set enabled = false where agent_id = '<bianca>';
-- ════════════════════════════════════════════════════════════════════════

-- ─── Parte 1: Schema (migration 008) ──────────────────────────────────────

create table if not exists skills (
  id              text primary key default gen_random_uuid()::text,
  slug            text not null unique,
  name            text not null,
  description     text not null default '',
  sector          text,
  icon            text,
  prompt_fragment text not null default '',
  required_tools  text[] not null default '{}',
  config_schema   jsonb not null default '{}'::jsonb,
  is_public       boolean not null default false,
  workspace_id    text,
  version         text not null default '1.0.0',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists skills_sector_idx on skills(sector) where is_public;
create index if not exists skills_workspace_idx on skills(workspace_id) where workspace_id is not null;

comment on table skills is
  'M3 — skills empacotadas. Módulo reutilizável combinando prompt + tools + config.';

drop trigger if exists skills_updated_at on skills;
create trigger skills_updated_at before update on skills
  for each row execute function set_updated_at();

create table if not exists agent_skills (
  id          text primary key default gen_random_uuid()::text,
  agent_id    text not null references agents(id) on delete cascade,
  skill_id    text not null references skills(id) on delete cascade,
  config      jsonb not null default '{}'::jsonb,
  enabled     boolean not null default true,
  installed_at timestamptz not null default now(),
  unique (agent_id, skill_id)
);

create index if not exists agent_skills_agent_idx on agent_skills(agent_id) where enabled;

comment on table agent_skills is
  'M3 — Associação N:N agente↔skill com config jsonb override.';

-- RLS permissiva por enquanto (worker conecta como service_role ou bypass).
-- Quando habilitar PostgREST self-hosted pra esse banco, criar policies finas.
alter table skills enable row level security;
drop policy if exists "skills_read" on skills;
create policy "skills_read" on skills for select using (true);
drop policy if exists "skills_write" on skills;
create policy "skills_write" on skills for all using (true) with check (true);

alter table agent_skills enable row level security;
drop policy if exists "agent_skills_all" on agent_skills;
create policy "agent_skills_all" on agent_skills for all using (true) with check (true);

-- ─── Parte 2: Seeds — 2 skills built-in ───────────────────────────────────

insert into skills (slug, name, description, sector, icon, prompt_fragment, required_tools, is_public, version)
values (
  'consulta-viabilidade-isp',
  'Consulta de Viabilidade (ISP)',
  'Tratamento robusto de endereço pra consultar_viabilidade. Aceita combinações flexíveis (rua+número+cidade, rua+número+CEP, condomínio com bloco/apto). 2 tentativas antes de escalar. Alinhado com o fix do prompt da Bianca.',
  'isp',
  '📍',
  $$## Skill: Consulta de Viabilidade (ISP)

Esta skill reforça o tratamento de endereços e a chamada do `consultar_viabilidade`. O backend (Geogrid) tem peculiaridades — siga as regras abaixo pra evitar falhas e loops.

### Quando chamar `consultar_viabilidade`

Tente quando tiver QUALQUER UMA destas combinações suficientes:
- **rua + número + cidade** (ex: "Avenida Padre José Holanda do Vale, 600, Maracanaú") ✓
- **rua + número + CEP** (ex: "Rua Eretides de Alencar, 1086, CEP 60135150") ✓
- **rua + número + bairro + cidade** ✓

Se faltar **rua** OU **número** → peça o que falta e NÃO chame a tool ainda.

### Caso especial — endereço de condomínio

Se o cliente mencionar "bloco", "apartamento", "apto", "condomínio", "edifício", "residencial X" ou "torre":

→ NÃO insista em "número da rua". Em condomínio o número é do prédio/condomínio — o cliente já te deu via "Bloco X apto Y".
→ Tente UMA chamada de `consultar_viabilidade` com o que tiver (rua/avenida + nome do condomínio + bairro + CEP se souber).
→ Se falhar, **escale pra humano** com motivo "endereço de condomínio — Geogrid não cobre, validar manualmente". Não fique pedindo dados que o cliente não tem.

### Recusa do cliente em fornecer dado faltante

Se o cliente disser "pesquisa assim mesmo / coloca aí e procura" SEM ter passado rua+número, explique calmamente:

"Sem o número da rua o sistema não consegue localizar o endereço exato. Você sabe o número aproximado, ou prefere que eu te transfira pra alguém do nosso time que pode te ajudar de outra forma?"

Se ainda recusar, **escale**. NÃO chame a tool com dados insuficientes.

### Tratamento de erro técnico

Quando `consultar_viabilidade` retornar erro (ex: "Error in workflow"):
1. Tente UMA segunda vez **com mais dados** se possível (ex: pedir CEP se ainda não tem).
2. Se persistir após 2ª tentativa, escale pra humano com motivo "consultar_viabilidade falhou 2x — endereço: <resumo>".

NÃO escale na 1ª falha. NÃO tente uma 3ª.

### Resultado da consulta

- **SEM COBERTURA**: "Infelizmente ainda não temos cobertura nessa região. 😔 Vou registrar seu interesse para quando expandirmos. Posso ajudar com mais alguma coisa?" → FIM
- **COBERTURA DISPONÍVEL**: "Perfeito! Temos cobertura disponível na sua região. 🚀" → segue pro próximo estado (apresentação de planos)
- **COBERTURA PARCIAL** (resultado ambíguo): peça confirmação do endereço e tente uma 2ª vez.$$,
  array['consultar_viabilidade', 'escalar_humano'],
  true,
  '1.1.0'
)
on conflict (slug) do update set
  name = excluded.name,
  description = excluded.description,
  prompt_fragment = excluded.prompt_fragment,
  required_tools = excluded.required_tools,
  version = excluded.version,
  updated_at = now();

insert into skills (slug, name, description, sector, icon, prompt_fragment, required_tools, is_public, version)
values (
  'escalacao-humano-padrao',
  'Escalação para Humano (padrão)',
  'Detecta quando o cliente quer falar com humano (frase explícita, irritação, problema fora do escopo) e escala usando a tool escalar_humano. Inclui mensagem de transição cordial.',
  null,
  '🧑‍💼',
  e'## Skill: Escalação para Humano\n\nEscale para humano quando:\n- Cliente pede explicitamente ("quero falar com humano", "atendente", "pessoa de verdade")\n- Você teve dúvida 2 vezes seguidas no mesmo tópico\n- Sentimento muito negativo / cliente irritado\n- Pedido fora do escopo do seu papel (ex: cancelamento se você é vendas)\n\nProcedimento:\n1. Avise o cliente: "Vou te transferir para um colega que pode te ajudar melhor com isso. Um momento por favor."\n2. Chame `escalar_humano(motivo="<motivo curto>", prioridade="normal|alta")`.\n3. Pare de processar mensagens dessa conversa (o humano assume).',
  array['escalar_humano'],
  true,
  '1.0.0'
)
on conflict (slug) do update set
  name = excluded.name,
  description = excluded.description,
  prompt_fragment = excluded.prompt_fragment,
  required_tools = excluded.required_tools,
  version = excluded.version,
  updated_at = now();

-- ─── Parte 3: Instalar skill na Bianca ─────────────────────────────────────
-- Detecta automaticamente o agent_id da Bianca pelo nome.

insert into agent_skills (agent_id, skill_id, enabled, config)
select
  a.id,
  s.id,
  true,
  '{}'::jsonb
from agents a
cross join skills s
where a.name ilike 'bianca%'
  and s.slug = 'consulta-viabilidade-isp'
on conflict (agent_id, skill_id) do update set
  enabled = true,
  installed_at = now();

-- ─── Parte 4: Verificação ────────────────────────────────────────────────

select 'Tabelas criadas:' as info;
select tablename from pg_tables where schemaname = 'public' and tablename in ('skills', 'agent_skills');

select 'Skills disponíveis:' as info;
select slug, name, version, is_public, array_length(required_tools, 1) as tools
from skills
order by sector nulls last, slug;

select 'Skills instaladas em agentes:' as info;
select
  a.name as agent,
  s.slug as skill,
  s.version,
  ag.enabled,
  ag.installed_at
from agent_skills ag
join agents a on a.id = ag.agent_id
join skills s on s.id = ag.skill_id
order by a.name, s.slug;

-- ─── Verificação final ──────────────────────────────────────────────────

select
  case
    when (select count(*) from skills where is_public) >= 2
     and (select count(*) from agent_skills ag
          join agents a on a.id = ag.agent_id
          where a.name ilike 'bianca%' and ag.enabled) >= 1
    then '✅ M3 prod ATIVO — Bianca tem skill consulta-viabilidade-isp habilitada'
    else '⚠️ M3 prod incompleto — verificar resultados acima'
  end as status_final;
