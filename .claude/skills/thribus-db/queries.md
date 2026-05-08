# Queries Comuns

Cole estas queries quando o usuário fizer a pergunta correspondente. Adapte filtros (período, agent, etc).

## 📊 Operacional / Dashboard

### Conversas hoje (todos agents)
```sql
select
  a.name as agent,
  count(distinct c.id) as conversas,
  count(e.id) as turnos
from conversations c
join agents a on a.id = c.agent_id
left join executions e on e.conversation_id = c.id
where c.created_at >= (now() at time zone 'America/Sao_Paulo')::date
group by a.name
order by conversas desc;
```

### Status atual das conversas
```sql
select status, count(*)
from conversations
group by status
order by count desc;
```

### Conversas ativas agora
```sql
select
  c.customer_phone,
  c.customer_name,
  c.current_state,
  to_char(c.updated_at at time zone 'America/Sao_Paulo', 'DD/MM HH24:MI') as ultima_msg,
  a.name as agent
from conversations c
join agents a on a.id = c.agent_id
where c.status = 'active'
order by c.updated_at desc
limit 50;
```

## 💰 Custo / Tokens

### Custo total na semana
```sql
select
  date(created_at at time zone 'America/Sao_Paulo') as dia,
  count(*) as turnos,
  sum(total_tokens) as tokens,
  round(sum(cost_usd)::numeric, 2) as usd,
  round((sum(cost_usd) * 5)::numeric, 2) as brl_aprox
from executions
where created_at > now() - interval '7 days'
group by 1
order by 1 desc;
```

### Custo por agente (mês corrente)
```sql
select
  a.name,
  count(e.id) as turnos,
  sum(e.total_tokens) as tokens,
  round(sum(e.cost_usd)::numeric, 2) as usd
from executions e
join agents a on a.id = e.agent_id
where e.created_at >= date_trunc('month', now() at time zone 'America/Sao_Paulo')
group by a.name
order by usd desc;
```

### Cache hit rate (Anthropic prompt caching)
```sql
select
  count(*) filter (where cache_hit) * 100.0 / count(*) as hit_rate_pct,
  count(*) as total_msgs
from messages
where role = 'assistant'
  and created_at > now() - interval '1 day';
```

## 🔧 Tools

### Tools mais usadas (últimos 7d)
```sql
select
  tool,
  count(*) as usos
from executions, unnest(tools_used) as tool
where created_at > now() - interval '7 days'
group by tool
order by usos desc;
```

### Tools que mais falham
```sql
select
  m.tool_name,
  count(*) filter (where m.content ilike '%error%' or m.content ilike '%falha%') as falhas,
  count(*) as total,
  round(count(*) filter (where m.content ilike '%error%')::numeric * 100 / count(*), 1) as fail_pct
from messages m
where m.role = 'tool'
  and m.created_at > now() - interval '7 days'
group by m.tool_name
having count(*) > 5
order by fail_pct desc;
```

## 🚨 Escalações

### Pendentes
```sql
select
  e.customer_phone,
  e.customer_name,
  e.reason,
  e.priority,
  to_char(e.created_at at time zone 'America/Sao_Paulo', 'DD/MM HH24:MI') as quando,
  extract(epoch from (now() - e.created_at))/60 as min_espera,
  a.name as agent
from escalations e
join agents a on a.id = e.agent_id
where e.resolved_at is null
order by e.priority desc, e.created_at asc;
```

### Top motivos de escalação
```sql
select
  reason,
  count(*) as total
from escalations
where created_at > now() - interval '7 days'
group by reason
order by total desc;
```

### Taxa de escalação por agente
```sql
select
  a.name,
  count(e.id) filter (where e.status = 'escalated') as escaladas,
  count(e.id) as total,
  round(count(e.id) filter (where e.status = 'escalated')::numeric * 100 / nullif(count(e.id), 0), 1) as pct
from executions e
join agents a on a.id = e.agent_id
where e.created_at > now() - interval '7 days'
group by a.name;
```

## 🐛 Debug / Investigação

### Histórico completo de uma conversa (por telefone)
```sql
-- $1 = telefone, ex: '5585988887777'
select
  to_char(m.created_at at time zone 'America/Sao_Paulo', 'HH24:MI:SS') as hora,
  m.role,
  m.tool_name,
  left(m.content, 200) as conteudo,
  m.tokens_in + m.tokens_out as tokens
from messages m
join conversations c on c.id = m.conversation_id
where c.customer_phone = $1
order by m.created_at asc;
```

### Conversas que travaram em algum estado
```sql
-- conversa parada há mais de 30min sem terminar
select
  c.customer_phone,
  c.current_state,
  to_char(c.state_updated_at at time zone 'America/Sao_Paulo', 'DD/MM HH24:MI') as parou_em,
  c.state_data
from conversations c
where c.status = 'active'
  and c.state_updated_at < now() - interval '30 minutes'
  and c.current_state not in ('11_completed', 'closed')
order by c.state_updated_at asc;
```

### Distribuição de estados (gargalos do funil)
```sql
select
  current_state,
  count(*) as conversas
from conversations
where created_at > now() - interval '7 days'
group by current_state
order by current_state;
```

### Última execução com erro
```sql
select
  to_char(e.created_at at time zone 'America/Sao_Paulo', 'DD/MM HH24:MI') as quando,
  e.customer_phone,
  e.tools_used,
  c.current_state,
  c.state_data
from executions e
join conversations c on c.id = e.conversation_id
where e.status = 'failed'
order by e.created_at desc
limit 20;
```

## 🏢 Workspaces / Multi-tenant

### Resumo por workspace
```sql
select
  w.name,
  w.crm_provider,
  count(distinct a.id) as agents,
  count(distinct c.id) as conversas_total,
  count(distinct c.id) filter (where c.status = 'active') as ativas
from workspaces w
left join agents a on a.workspace_id = w.id
left join conversations c on c.agent_id = a.id
group by w.name, w.crm_provider;
```

### Tools com auth configurada (sem mostrar valor)
```sql
select
  t.name,
  t.scope,
  t.auth_type,
  t.auth_credentials::text as refs,    -- só os ponteiros, não os valores
  t.extra_headers::text
from tools
where auth_type is not null
order by scope, name;
```

### Quais workspaces têm credenciais definidas (sem expor valor)
```sql
select
  w.name,
  jsonb_object_keys(w.credentials) as credencial
from workspaces w
where w.credentials != '{}'::jsonb;
```

## ⚡ Performance

### Tempo médio de resposta por agente (7d)
```sql
select
  a.name,
  count(*) as turnos,
  round(avg(response_time_ms)::numeric / 1000, 1) as avg_segundos,
  round(percentile_cont(0.5) within group (order by response_time_ms)::numeric / 1000, 1) as p50_segundos,
  round(percentile_cont(0.95) within group (order by response_time_ms)::numeric / 1000, 1) as p95_segundos
from executions e
join agents a on a.id = e.agent_id
where e.created_at > now() - interval '7 days'
group by a.name;
```

### Horário de pico
```sql
select
  extract(hour from created_at at time zone 'America/Sao_Paulo') as hora,
  count(*) as turnos
from executions
where created_at > now() - interval '7 days'
group by hora
order by hora;
```
