# IXC TexNet — Queries Comuns

Queries BI prontas. Adapte filtros (período, cidade, plano) conforme a pergunta. Sempre `LIMIT` em listagens e mascare CPF/endereço se mostrar.

## 📊 Visão geral / KPIs

### Resumo da base
```sql
select
  (select count(*) from cliente where ativo='S')                    as clientes_ativos,
  (select count(*) from cliente_contrato where status='A')          as contratos_ativos,
  (select count(*) from cliente_contrato where status in ('I','C','D')) as contratos_baixados,
  (select count(*) from sa_titulos where status='A')                as titulos_em_aberto,
  (select count(*) from sa_titulos where status='A' and data_vencimento < curdate()) as inadimplentes;
```

### Contratos novos por mês (12m)
```sql
select
  date_format(data_ativacao, '%Y-%m') as mes,
  count(*) as contratos
from cliente_contrato
where data_ativacao >= date_sub(curdate(), interval 12 month)
group by mes
order by mes desc;
```

### Cancelamentos por mês (churn)
```sql
select
  date_format(data_cancelamento, '%Y-%m') as mes,
  count(*) as cancelamentos
from cliente_contrato
where data_cancelamento >= date_sub(curdate(), interval 12 month)
group by mes
order by mes desc;
```

### Taxa de churn mensal
```sql
select
  date_format(data_cancelamento, '%Y-%m') as mes,
  count(*) as cancelados,
  (select count(*) from cliente_contrato where status='A') as ativos_hoje,
  round(count(*) * 100.0 / (select count(*) from cliente_contrato where status='A'), 2) as churn_pct
from cliente_contrato
where data_cancelamento >= date_sub(curdate(), interval 6 month)
group by mes
order by mes desc;
```

## 💰 Financeiro

### Inadimplência por dias atrasados
```sql
select
  case
    when datediff(curdate(), data_vencimento) <=  7 then '01-07d'
    when datediff(curdate(), data_vencimento) <= 15 then '08-15d'
    when datediff(curdate(), data_vencimento) <= 30 then '16-30d'
    when datediff(curdate(), data_vencimento) <= 60 then '31-60d'
    else '60d+'
  end as faixa,
  count(*) as titulos,
  sum(valor) as total
from sa_titulos
where status = 'A' and data_vencimento < curdate()
group by faixa
order by faixa;
```

### Receita esperada do mês corrente
```sql
select
  count(*) as titulos,
  sum(valor) as faturado
from sa_titulos
where year(data_vencimento) = year(curdate())
  and month(data_vencimento) = month(curdate());
```

### Receita realizada (pago) por mês — últimos 6
```sql
select
  date_format(data_pagamento, '%Y-%m') as mes,
  count(*) as pagamentos,
  sum(valor_pago) as recebido
from sa_titulos
where status = 'B'
  and data_pagamento >= date_sub(curdate(), interval 6 month)
group by mes
order by mes desc;
```

### Top 10 inadimplentes (mascarando CPF)
```sql
select
  c.id as cliente_id,
  left(c.razao, 20) as nome,
  concat(left(c.cnpj_cpf, 3), '.***') as cpf_mask,
  count(t.id) as titulos_abertos,
  sum(t.valor) as total_devido,
  min(t.data_vencimento) as mais_antigo
from cliente c
join sa_titulos t on t.id_cliente = c.id
where t.status = 'A' and t.data_vencimento < curdate()
group by c.id
order by total_devido desc
limit 10;
```

## 📦 Vendas / Planos

### Plano mais vendido (90d)
```sql
select
  vd.descricao as plano,
  count(cc.id) as vendas
from cliente_contrato cc
join vd_contrato vd on vd.id = cc.id_vd_contrato
where cc.data_ativacao >= date_sub(curdate(), interval 90 day)
group by vd.descricao
order by vendas desc;
```

### Distribuição da base por plano
```sql
select
  vd.descricao,
  count(cc.id) as contratos,
  round(count(cc.id) * 100.0 / sum(count(cc.id)) over (), 1) as pct
from cliente_contrato cc
join vd_contrato vd on vd.id = cc.id_vd_contrato
where cc.status = 'A'
group by vd.descricao
order by contratos desc;
```

### Tickets médio (mensalidade)
```sql
select
  round(avg(valor_mensal), 2) as ticket_medio,
  min(valor_mensal) as min,
  max(valor_mensal) as max
from cliente_contrato
where status = 'A';
```

### Origem do lead (de onde vem o cliente)
```sql
select
  coalesce(origem_lead, 'não informado') as origem,
  count(*) as total
from cliente
where data_cadastro >= date_sub(curdate(), interval 90 day)
group by origem
order by total desc;
```

## 🔧 Operacional / OS

### OS abertas por status
```sql
select
  status,
  count(*) as total
from su_oss_chamado
where data_abertura >= date_sub(curdate(), interval 30 day)
group by status;
```

### Instalações pendentes (próximos 7 dias)
```sql
select
  os.id as os_numero,
  left(c.razao, 20) as cliente,
  os.data_reservada,
  case os.periodo when 'M' then 'Manhã' when 'T' then 'Tarde' else os.periodo end as periodo,
  c.bairro
from su_oss_chamado os
join cliente c on c.id = os.id_cliente
where os.status in ('AG','EN','AS')
  and os.data_reservada between curdate() and date_add(curdate(), interval 7 day)
order by os.data_reservada, os.periodo;
```

### Tempo médio de resolução de OS (30d)
```sql
select
  round(avg(timestampdiff(hour, data_abertura, data_fechamento)), 1) as horas_medias,
  count(*) as total_os
from su_oss_chamado
where data_fechamento >= date_sub(curdate(), interval 30 day)
  and data_fechamento is not null;
```

## 📡 Conectividade

### Quantos clientes online agora
```sql
select
  online,
  count(*) as total
from su_login
group by online;
```

### Clientes desconectados há > 7 dias (possível problema)
```sql
select
  l.login,
  left(c.razao, 20) as nome,
  c.bairro,
  l.ultima_conexao,
  datediff(curdate(), l.ultima_conexao) as dias_offline
from su_login l
join cliente c on c.id = l.id_cliente
where l.online = 'N'
  and l.ultima_conexao < date_sub(curdate(), interval 7 day)
order by l.ultima_conexao asc
limit 30;
```

## 🌎 Geografia

### Top bairros por número de clientes
```sql
select
  upper(c.bairro) as bairro,
  count(*) as clientes
from cliente c
join cliente_contrato cc on cc.id_cliente = c.id
where cc.status = 'A'
group by upper(c.bairro)
order by clientes desc
limit 20;
```

### Cidades com mais ativos
```sql
select
  cd.nome,
  cd.uf,
  count(distinct c.id) as clientes_ativos
from cliente c
join cidade cd on cd.id = c.cidade
join cliente_contrato cc on cc.id_cliente = c.id and cc.status = 'A'
group by cd.id
order by clientes_ativos desc
limit 20;
```

## 🔎 Investigação por cliente

### Tudo de um CPF (drill-down sob demanda)
```sql
-- :cpf = '12345678900' (sem formatação) ou '123.456.789-00' — confira o formato
-- com SELECT DISTINCT cnpj_cpf FROM cliente LIMIT 5

select
  c.id as cliente_id,
  c.razao,
  c.fone,
  cc.id as contrato_id,
  cc.status as status_contrato,
  vd.descricao as plano,
  cc.valor_mensal,
  cc.dia_vencimento,
  cc.data_ativacao,
  l.login as pppoe,
  l.online,
  l.ultima_conexao
from cliente c
left join cliente_contrato cc on cc.id_cliente = c.id
left join vd_contrato vd on vd.id = cc.id_vd_contrato
left join su_login l on l.id_contrato = cc.id
where c.cnpj_cpf = :cpf
order by cc.data_ativacao desc;
```

### Histórico financeiro de um cliente
```sql
-- :cliente_id = id IXC do cliente
select
  t.id as titulo,
  t.descricao,
  t.valor,
  t.data_vencimento,
  t.data_pagamento,
  case t.status
    when 'A' then 'Aberto'
    when 'B' then 'Pago'
    when 'C' then 'Cancelado'
    else t.status
  end as situacao,
  case
    when t.status = 'A' and t.data_vencimento < curdate() then datediff(curdate(), t.data_vencimento)
    else null
  end as dias_atraso
from sa_titulos t
where t.id_cliente = :cliente_id
order by t.data_vencimento desc
limit 24;
```

## ⚠️ Boas práticas em todas as queries

- **Mascarar CPF/CNPJ ao listar**: `concat(left(cnpj_cpf, 3), '.***')`
- **Truncar nome se cabe**: `left(razao, 20)`
- **Não imprimir senha PPPoE**, `linha_digitavel` de boleto, dados de cartão
- **LIMIT default = 50** se a query lista clientes/títulos individuais
- **Confirmar valores fora-do-padrão**: se aparecer `0` ou `null` onde não deveria, suspeite de filtro (ex: status diferente do esperado)
