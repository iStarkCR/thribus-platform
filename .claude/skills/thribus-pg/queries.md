# Queries Comuns — thribus_staging

Cole no padrão `ssh -i ~/.ssh/thribus_vps root@147.93.131.93 "docker exec usicyqipyjfjxap7kgvkw261 psql -U postgres -d thribus_staging -c \"<SQL>\""` ou via heredoc.

## 📊 Operacional

### Templates de agente disponíveis
```sql
select slug, name, sector, icon, array_length(default_tools, 1) as tools_count
from agent_templates
where is_public = true
order by sector, name;
```

### Listar agentes com role (M2)
```sql
select id, name, role, status, model, channel, workspace_id
from agents
order by role nulls last, name;
```

### Workspaces com router habilitado (M2)
```sql
select id, name, crm_provider,
  router_config->>'enabled' as router_on,
  router_config->>'model' as router_model,
  jsonb_object_keys(router_config->'intents') as intent
from workspaces
where router_config is not null
order by name;
```

### Conversas em andamento (com state)
```sql
select c.customer_phone, c.current_state,
  to_char(c.updated_at at time zone 'America/Sao_Paulo', 'DD/MM HH24:MI') as ultima_msg,
  a.name as agente_atual
from conversations c
join agents a on a.id = c.agent_id
where c.status = 'active'
order by c.updated_at desc
limit 50;
```

## 🔄 Roteamento Multi-Agente (M2)

### Conversas que tiveram transferência
```sql
select c.customer_phone,
  prev.name as transferido_de,
  curr.name as transferido_pra,
  c.transferred_at,
  c.transfer_reason
from conversations c
left join agents prev on prev.id = c.transferred_from_agent_id
join agents curr on curr.id = c.agent_id
where c.transferred_from_agent_id is not null
order by c.transferred_at desc
limit 30;
```

### Stats de transferência por agente origem→destino
```sql
select
  prev.name as origem,
  curr.name as destino,
  count(*) as transferencias,
  array_agg(distinct c.transfer_reason) filter (where c.transfer_reason is not null) as motivos_distintos
from conversations c
left join agents prev on prev.id = c.transferred_from_agent_id
join agents curr on curr.id = c.agent_id
where c.transferred_from_agent_id is not null
  and c.transferred_at > now() - interval '7 days'
group by 1, 2
order by transferencias desc;
```

### Quais agentes existem por role (workspace específico)
```sql
-- :workspace_id = 'ws-id-here'
select id, name, role, status
from agents
where workspace_id = :workspace_id
  and role is not null
order by role, name;
```

## 💰 Custo / Performance

### Cost estimado da semana (precisa cost_usd preenchido — ainda em runtime)
```sql
select
  date_trunc('day', created_at at time zone 'America/Sao_Paulo')::date as dia,
  count(*) as turnos,
  sum(total_tokens) as tokens,
  round(avg(response_time_ms)::numeric / 1000, 1) as avg_seg
from executions
where created_at > now() - interval '7 days'
group by 1
order by 1 desc;
```

### Cache hit rate (Anthropic)
```sql
select
  round(100.0 * sum(case when cache_hit then 1 else 0 end) / count(*), 1) as hit_pct,
  count(*) as msgs
from messages
where role = 'assistant'
  and created_at > now() - interval '24 hours';
```

### Agentes mais usados (7d)
```sql
select a.name, a.role, count(e.id) as turnos
from executions e
join agents a on a.id = e.agent_id
where e.created_at > now() - interval '7 days'
group by a.id, a.name, a.role
order by turnos desc;
```

## 🐛 Debug

### Histórico de uma conversa por telefone
```sql
-- :phone = '5585988887777'
select
  to_char(m.created_at at time zone 'America/Sao_Paulo', 'HH24:MI:SS') as hora,
  m.role,
  m.tool_name,
  left(m.content, 200) as content,
  m.tokens_in + m.tokens_out as tokens
from messages m
join conversations c on c.id = m.conversation_id
where c.customer_phone = :phone
order by m.created_at asc;
```

### Conversas travadas em algum estado >30min
```sql
select c.customer_phone, c.current_state,
  to_char(c.state_updated_at at time zone 'America/Sao_Paulo', 'DD/MM HH24:MI') as parou_em,
  c.state_data,
  a.name as agente
from conversations c
join agents a on a.id = c.agent_id
where c.status = 'active'
  and c.state_updated_at < now() - interval '30 minutes'
  and c.current_state not in ('11_completed', 'closed')
order by c.state_updated_at;
```

### Distribuição de estados (funil)
```sql
select current_state, count(*) as conversas
from conversations
where created_at > now() - interval '7 days'
group by current_state
order by current_state;
```

## 🚨 Escalações

### Pendentes
```sql
select
  e.customer_phone, e.reason, e.priority,
  to_char(e.created_at at time zone 'America/Sao_Paulo', 'DD/MM HH24:MI') as quando,
  extract(epoch from (now() - e.created_at))/60 as min_espera,
  a.name as agente_que_escalou
from escalations e
join agents a on a.id = e.agent_id
where e.resolved_at is null
order by e.priority desc, e.created_at;
```

### Top motivos de escalação
```sql
select reason, count(*) as total
from escalations
where created_at > now() - interval '7 days'
group by reason
order by total desc;
```

## 🏢 Workspace

### Resumo geral
```sql
select
  w.name,
  w.crm_provider,
  count(distinct a.id) as agents,
  count(distinct a.id) filter (where a.role is not null) as agents_com_role,
  count(distinct c.id) filter (where c.status = 'active') as conversas_ativas,
  case when w.router_config->>'enabled' = 'true' then '✓' else '✗' end as router
from workspaces w
left join agents a on a.workspace_id = w.id
left join conversations c on c.agent_id = a.id
group by w.id, w.name, w.crm_provider, w.router_config;
```

### Credenciais cadastradas (sem expor valor)
```sql
select w.name, jsonb_object_keys(w.credentials) as credencial
from workspaces w
where w.credentials != '{}'::jsonb;
```

## 🔧 Manutenção

### Tamanho dos databases
```sql
select datname, pg_size_pretty(pg_database_size(datname)) as size
from pg_database
where datname in ('thribus_staging', 'thribus_prod', 'talki_prod', 'postgres')
order by pg_database_size(datname) desc;
```

### Tabelas mais pesadas do thribus_staging
```sql
select tablename,
  pg_size_pretty(pg_total_relation_size('public.' || tablename)) as size
from pg_tables
where schemaname = 'public'
order by pg_total_relation_size('public.' || tablename) desc;
```

### Queries mais lentas (precisa pg_stat_statements ativo)
```sql
select
  substring(query, 1, 80) as query,
  calls, round(mean_exec_time::numeric, 1) as mean_ms,
  round(total_exec_time::numeric / 1000, 1) as total_seg
from pg_stat_statements
order by total_exec_time desc
limit 10;
```
