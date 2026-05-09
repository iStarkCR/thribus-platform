-- ══════════════════════════════════════════════════════
-- Migration 008 — Skills empacotadas (M3) — SCAFFOLD
-- ══════════════════════════════════════════════════════
-- Skills são "módulos" reutilizáveis que um agente pode ter habilitado.
-- Diferente de tools (que são endpoints HTTP individuais), skills empacotam
-- um conjunto coerente:
--   - fragmento de prompt (instruções específicas)
--   - tools necessárias (lista de nomes — referencia tools existentes)
--   - state machine opcional (estados específicos)
--   - variáveis de configuração (ex: limites, mensagens customizadas)
--
-- Exemplos previstos:
--   - "consulta-viabilidade-isp" → instruções + tools (consultar_viabilidade)
--   - "cobrança-amigável" → instruções + tools (gerar_boleto, status_contrato)
--   - "qualificação-lead-b2b" → fluxo de qualificação BANT
--
-- M3 está em scaffold — schema pronto, mas o worker AINDA NÃO consome
-- as skills no agent loop. Isso virá em PR seguinte (M3-runtime).
--
-- Aplicação:
--   - DEV/STAGING: rodar via thribus-pg em thribus_staging
--   - PROD: aguardar M3-runtime estabilizar antes de aplicar
--
-- Idempotente — pode rodar várias vezes.
-- ══════════════════════════════════════════════════════

-- ─── 1. Tabela skills ────────────────────────────────────────────────────────
-- Definição da skill. Pode ser pública (compartilhada entre workspaces) ou
-- privada (só do workspace que criou).

create table if not exists skills (
  id              text primary key default gen_random_uuid()::text,
  slug            text not null unique,                -- 'consulta-viabilidade-isp', 'cobranca-amigavel'
  name            text not null,                       -- "Consulta de Viabilidade (ISP)"
  description     text not null default '',            -- preview na UI
  sector          text,                                -- 'isp', 'clinica', 'ecommerce'... (filtro)
  icon            text,                                -- emoji ou nome de ícone
  prompt_fragment text not null default '',            -- texto que será concatenado ao system_prompt do agent
  required_tools  text[] not null default '{}',        -- nomes de tools (FK lógica pra `tools.name`)
  config_schema   jsonb not null default '{}'::jsonb,  -- JSON Schema dos parâmetros configuráveis
  is_public       boolean not null default false,      -- false = só workspace dono vê
  workspace_id    text,                                -- FK→workspaces.id (null = built-in/global)
  version         text not null default '1.0.0',       -- semver — pra evoluir sem quebrar agentes
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists skills_sector_idx on skills(sector) where is_public;
create index if not exists skills_workspace_idx on skills(workspace_id) where workspace_id is not null;

comment on table skills is
  'M3 — skills empacotadas. Módulo reutilizável combinando prompt + tools + config. Diferente de templates (que criam um agente completo do zero), skills são adicionadas a agentes existentes.';

drop trigger if exists skills_updated_at on skills;
create trigger skills_updated_at before update on skills
  for each row execute function set_updated_at();

-- ─── 2. Tabela agent_skills (associação N:N + config por instância) ──────────
-- Quando uma skill é "habilitada" num agente, gravamos aqui.
-- O campo `config` permite parametrizar a skill por agente (ex: limites,
-- mensagens customizadas) sem editar a skill original.

create table if not exists agent_skills (
  id          text primary key default gen_random_uuid()::text,
  agent_id    text not null references agents(id) on delete cascade,
  skill_id    text not null references skills(id) on delete cascade,
  config      jsonb not null default '{}'::jsonb,    -- override dos config_schema defaults
  enabled     boolean not null default true,         -- pode desativar sem desinstalar
  installed_at timestamptz not null default now(),
  unique (agent_id, skill_id)
);

create index if not exists agent_skills_agent_idx on agent_skills(agent_id) where enabled;

comment on table agent_skills is
  'Associação N:N — agente X tem skill Y habilitada com config Z. agent_skill.config sobrescreve defaults da skill.';

-- ─── 3. RLS ──────────────────────────────────────────────────────────────────
-- Por enquanto: permissivo (worker conecta como superuser via socket).
-- Quando PostgREST entrar (próxima sessão), apertar com policies por workspace.

alter table skills enable row level security;
drop policy if exists "skills_read" on skills;
create policy "skills_read" on skills for select using (true);
drop policy if exists "skills_write" on skills;
create policy "skills_write" on skills for all using (true) with check (true);

alter table agent_skills enable row level security;
drop policy if exists "agent_skills_all" on agent_skills;
create policy "agent_skills_all" on agent_skills for all using (true) with check (true);

-- ─── 4. Seeds — 2 skills de exemplo (built-in, workspace_id null) ────────────

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
  'Detecta quando o cliente quer falar com humano (frase explícita, irritação, problema fora do escopo) e escala usando a tool `escalar_humano`. Inclui mensagem de transição cordial.',
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

-- ─── 5. Verificação ──────────────────────────────────────────────────────────
select 'Skills criadas:' as info;
select slug, name, sector, icon, version, array_length(required_tools, 1) as tools_count
from skills
where is_public
order by sector nulls last, name;

select 'Estrutura agent_skills:' as info;
select column_name, data_type, column_default
from information_schema.columns
where table_schema = current_schema()
  and table_name = 'agent_skills'
order by ordinal_position;
