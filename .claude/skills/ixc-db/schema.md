# IXC TexNet — Schema Reference

Documentação parcial das tabelas mais usadas do IXC. **Não é exaustiva** — o IXC tem centenas de tabelas. Quando em dúvida, use `describe <tabela>` ou `show tables like '%palavra%'` pra explorar.

Documentação oficial pública (parcial): https://wikiapiprovedor.ixcsoft.com.br/

## Convenções

- **PK**: quase sempre coluna `id` (int, autoincrement)
- **Status booleano**: `'S'` (sim/ativo) / `'N'` (não/inativo) — varchar, não boolean nativo
- **Datas**: `datetime` ou `date`. Sem timezone explícito — banco grava em horário local do server
- **Soft delete**: muitas tabelas têm coluna de status em vez de deletar physical
- **CPF/CNPJ**: armazenado **com formatação** em algumas tabelas (`123.456.789-00`) e **só dígitos** em outras. Sempre confira com `describe` e dado de amostra.

## Tabelas críticas

### `cliente` — clientes (PJ e PF)

| coluna | tipo | nota |
|---|---|---|
| id | int PK | identificador interno IXC |
| razao | varchar | razão social / nome completo |
| fantasia | varchar | nome fantasia / "como prefere ser chamado" |
| cnpj_cpf | varchar | **sensível LGPD** — pode estar formatado ou não |
| ie_rg | varchar | inscrição estadual / RG |
| email | varchar | |
| fone, fone2 | varchar | telefones |
| endereco | varchar | rua |
| numero | varchar | |
| bairro | varchar | |
| cidade | int FK→cidade | id da cidade (não nome!) |
| uf | varchar(2) | |
| cep | varchar | |
| ativo | varchar(1) | 'S' / 'N' |
| pessoa | varchar(1) | 'F' (física) / 'J' (jurídica) |
| data_cadastro | datetime | |
| data_nascimento | date | **sensível** |
| origem_lead | varchar | "como conheceu" — usado p/ marketing |
| obs | text | observações livres |

**Cuidado com volume**: pode ter dezenas de milhares de rows.

### `cliente_contrato` — contratos de serviço

| coluna | tipo | nota |
|---|---|---|
| id | int PK | número do contrato (visível pro cliente) |
| id_cliente | int FK→cliente | |
| id_vd_contrato | int | id do plano (link `vd_contrato` ou `vd_planos_internet`) |
| status | varchar(1) | 'A' (ativo), 'I' (inativo), 'C' (cancelado), 'D' (desativado) |
| data_ativacao | datetime | |
| data_cancelamento | datetime | |
| valor_mensal | decimal | valor cobrado |
| dia_vencimento | int | 5, 10, 15, 20 |
| tipo_cobranca | varchar(1) | 'B' (boleto), 'C' (cartão), 'D' (débito) |
| data_assinatura | datetime | quando assinou contrato |
| forma_cobranca | int | FK→forma_cobranca |
| canal | int | id do canal de venda |
| obs | text | |

### `vd_contrato` ou `vd_planos_internet` — planos

| coluna | tipo |
|---|---|
| id | int PK |
| descricao | varchar — nome do plano ("600MB", "1GB Pós-Pago") |
| valor | decimal |
| velocidade_down, velocidade_up | int (em Mbps ou Kbps — confirma) |
| ativo | varchar(1) |

### `su_login` — login PPPoE / autenticação

| coluna | tipo | nota |
|---|---|---|
| id | int PK | |
| id_cliente | int FK | |
| id_contrato | int FK→cliente_contrato | |
| login | varchar | username PPPoE (geralmente CPF sem formatação) |
| senha | varchar | **sensível** — não imprimir |
| online | varchar(1) | 'S' / 'N' |
| ultima_conexao | datetime | |
| ip_atual | varchar | |
| mac_atual | varchar | MAC do CPE |

### `sa_titulos` — títulos financeiros (faturas)

| coluna | tipo | nota |
|---|---|---|
| id | int PK | número do título/fatura |
| id_cliente | int FK | |
| id_contrato | int FK | |
| valor | decimal | |
| valor_pago | decimal | |
| data_emissao | date | |
| data_vencimento | date | |
| data_pagamento | date | null = não pago |
| status | varchar(1) | 'A' (aberto), 'B' (baixado/pago), 'C' (cancelado) |
| linha_digitavel | varchar | **sensível — boleto** — não imprimir |
| nosso_numero | varchar | |
| descricao | varchar | "Mensalidade 06/2026" |

### `su_oss_chamado` — Ordens de Serviço

| coluna | tipo | nota |
|---|---|---|
| id | int PK | número da OS |
| id_cliente | int FK | |
| id_contrato | int FK | |
| id_assunto | int FK→su_oss_assunto | tipo da OS |
| status | varchar(1) | 'AG' (aguardando), 'EN' (encaminhada), 'AS' (assumida), 'AT' (atendida), 'CA' (cancelada) — confirma com `select distinct status from su_oss_chamado` |
| id_tecnico | int FK | técnico atribuído |
| data_abertura | datetime | |
| data_fechamento | datetime | |
| data_reservada | datetime | data agendada |
| periodo | varchar(1) | 'M' (manhã) / 'T' (tarde) |
| descricao | text | |

### `cidade` — cidades (lookup)

| id | int |
| nome | varchar |
| uf | varchar(2) |

## Tabelas auxiliares úteis

| Tabela | Pra que |
|---|---|
| `forma_cobranca` | Lookup das formas (boleto, cartão, etc) |
| `canal_venda` | Origem da venda |
| `usuarios` | Usuários internos (atendentes, técnicos) |
| `radusuarios` | Auth Radius (PPPoE) |
| `cliente_endereco` | Endereços extras do cliente |

## Padrões de query

- **Filtrar ativos**: `where ativo = 'S'`
- **Filtrar contratos vivos**: `where status in ('A')` (status='A' = ativo)
- **Filtrar inadimplentes**: `sa_titulos where status='A' and data_vencimento < curdate()`
- **Joins comuns**:
  ```sql
  cliente c
  join cliente_contrato cc on cc.id_cliente = c.id
  left join sa_titulos t on t.id_contrato = cc.id
  left join su_login l on l.id_contrato = cc.id
  left join su_oss_chamado os on os.id_contrato = cc.id
  ```

## Diferenças MariaDB ↔ Postgres

Se você está acostumado com Postgres (Supabase), atenção:
- **Sem `jsonb`** — usa `json` ou `text` com JSON dentro
- **Sem `at time zone`** — usa `convert_tz(data, '+00:00', '-03:00')`
- **String concat**: `concat(a, b)` em vez de `a || b`
- **Boolean**: varchar(1) com 'S'/'N' em vez de `true/false`
- **Limit/offset**: `limit 10 offset 20` (igual)
- **Window functions**: MariaDB 10.2+ suporta (server tem 11.4 — ok)
- **CTEs**: ok desde 10.2
- **`returning`**: NÃO existe (irrelevante aqui pq é read-only)

## Como descobrir o que não está aqui

Quando a pergunta envolve algo não documentado:

```bash
# Ver todas as tabelas
source ~/.thribus/ixc.env && \
  mysql -h "$IXC_HOST" -P "$IXC_PORT" -u "$IXC_USER" -p"$IXC_PASS" "$IXC_DB" \
  -e "show tables;" | head -100

# Buscar tabela por palavra-chave
... -e "show tables like '%fatura%';"

# Ver estrutura
... -e "describe sa_titulos;"

# Ver amostra (mascarando dados pessoais)
... -e "select id, left(razao, 10), left(cnpj_cpf, 3) from cliente limit 3;"
```
