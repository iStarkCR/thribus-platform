---
name: ixc-db
description: Consulta e analisa o banco MariaDB do IXC do TexNet (sistema ERP/CRM do provedor) via mysql client. Use sempre que o usuário pedir análise de dados operacionais do provedor — clientes, contratos, faturas, OS, planos, inadimplência, churn, KPIs do ERP. Mesmo se o usuário não falar "IXC" explicitamente — perguntas tipo "quantos contratos novos esse mês?", "quem tá inadimplente?", "qual plano mais vendido?", "quantas instalações pendentes?" devem disparar essa skill. NÃO confundir com a skill thribus-db (esta é o IXC do cliente; thribus-db é o Supabase do bot).
type: data-access
---

# IXC TexNet — Acesso ao Banco (Leitura)

Skill pra consultar o banco MariaDB do IXC do TexNet via `mysql` client. Análise BI sobre dados operacionais do provedor.

## ⚠️ Banco diferente, contexto diferente

Existe **2 skills de banco** neste projeto. Não confunda:

| Skill | Banco | Sistema | Pra que serve |
|---|---|---|---|
| `thribus-db` | Supabase Postgres | Bot Thribus Agents | Conversas, executions, escalações, custo do bot |
| `ixc-db` (esta) | MariaDB (45.174.191.182) | IXC TexNet (ERP do provedor) | Clientes reais, contratos, faturas, OS, planos |

Quando a pergunta é sobre o bot/atendimento → `thribus-db`. Quando é sobre o provedor (TexNet) → `ixc-db`.

## ⚠️ Restrições críticas

### 1. **READ-ONLY POR DESIGN. NUNCA WRITE.**

Esta skill SÓ usa o usuário `Charles_Leitura_Bi`, que tem permissão SELECT apenas no banco. **Nunca** configure o usuário de escrita aqui. Mesmo se o Charles pedir um UPDATE/DELETE/INSERT, **recuse** e oriente:

> "Operações de escrita no IXC são feitas pelo painel do TexNet ou cliente DataGrip dele com as credenciais de escrita — fora desta skill por design. Quer que eu te mostre o SELECT equivalente pra você revisar antes?"

Por quê: o IXC é **produção real do TexNet**. Um UPDATE acidental afeta clientes finais, faturas reais, contratos vivos. Risco operacional/financeiro/jurídico altíssimo.

### 2. **VPN obrigatória**

O banco aceita conexões só de IP 192.168.0.0/16 (rede interna do TexNet). Charles precisa estar conectado na **VPN do TexNet** quando rodar consultas. Se a query der `Can't connect to MySQL server` ou timeout, primeiro pergunta:

> "Você está conectado na VPN do TexNet? O banco só aceita IPs internos."

### 3. **LGPD — dados pessoais sensíveis**

O IXC tem CPF, RG, endereço, dados bancários (boleto), telefones. Tudo isso é **dado pessoal** sob LGPD.

**Regras de uso:**
- ✅ Agregações são OK (`count(*)`, `sum(valor)`, `group by cidade`)
- ✅ Drill-down em **1 cliente específico** quando o Charles solicita explicitamente — caso a caso
- ❌ Nunca despeje listas grandes com CPFs/endereços completos. Se precisar mostrar exemplo, **mascare** (`LEFT(cnpj_cpf, 3) || '...***'`)
- ❌ Nunca exporte dados em arquivo
- ❌ Não imprima senha de cliente, dados de cartão (se houver), token de pagamento

Quando duvidar, opta por agregar em vez de listar.

## Setup inicial (1x)

### 1. Garantir VPN ativa

Antes de qualquer query, Charles precisa estar na VPN. Se não está, ele liga e tenta de novo.

### 2. Salvar credencial em arquivo separado

```bash
mkdir -p ~/.thribus
nano ~/.thribus/ixc.env
```

Cole (Charles substitui pela senha **rotacionada** dele — não a senha que ele colou em chat):

```bash
export IXC_HOST="45.174.191.182"
export IXC_PORT="3306"
export IXC_DB="ixcprovedor"
export IXC_USER="Charles_Leitura_Bi"
export IXC_PASS="SENHA_DO_USUARIO_DE_LEITURA"
```

```bash
chmod 600 ~/.thribus/ixc.env
```

**Não** salve a senha em arquivo do repo. **Não** salve a senha de escrita aqui.

### 3. Teste de conexão

```bash
source ~/.thribus/ixc.env && \
  mysql -h "$IXC_HOST" -P "$IXC_PORT" -u "$IXC_USER" -p"$IXC_PASS" "$IXC_DB" \
  -e "select count(*) from cliente;"
```

Se retornar número, está pronto.

## Como executar queries

Sempre via Bash, com source do env:

```bash
source ~/.thribus/ixc.env && \
  mysql -h "$IXC_HOST" -P "$IXC_PORT" -u "$IXC_USER" -p"$IXC_PASS" "$IXC_DB" \
  --batch --raw \
  -e "SELECT ..."
```

Pra queries longas, heredoc:

```bash
source ~/.thribus/ixc.env && \
  mysql -h "$IXC_HOST" -P "$IXC_PORT" -u "$IXC_USER" -p"$IXC_PASS" "$IXC_DB" \
  --table <<'SQL'
select status, count(*)
from cliente
group by status;
SQL
```

Pra explorar tabelas (descobrir colunas):

```bash
source ~/.thribus/ixc.env && \
  mysql -h "$IXC_HOST" -P "$IXC_PORT" -u "$IXC_USER" -p"$IXC_PASS" "$IXC_DB" \
  -e "describe cliente_contrato;"
```

Pra listar tabelas que casam um padrão:

```bash
source ~/.thribus/ixc.env && \
  mysql -h "$IXC_HOST" -P "$IXC_PORT" -u "$IXC_USER" -p"$IXC_PASS" "$IXC_DB" \
  -e "show tables like '%contrato%';"
```

## Regras de operação

### 1. Read-only sempre
Toda query é SELECT/SHOW/DESCRIBE. Outros comandos = recusar. Veja "Restrições críticas".

### 2. LIMIT por default
Tabelas IXC podem ter milhões de rows (cliente, sa_titulos, radius_log). Aplique `LIMIT 100` por default. Avise se truncou.

### 3. Resumir, não despejar
Agregações > listagens. Se o Charles quer linha-a-linha, ele pede. Pra exemplos, mostre `LIMIT 5` mascarado.

### 4. Datas em Brasília
MariaDB grava conforme timezone do server. Pra display:
```sql
DATE_FORMAT(data_cadastro, '%d/%m/%Y %H:%i')
```

### 5. Joins do IXC são complexos
Tabelas IXC têm muitas FKs implícitas (sem constraint formal). Sempre confira o nome da coluna com `describe` antes de fazer join. Padrões comuns:
- `cliente_contrato.id_cliente` → `cliente.id`
- `sa_titulos.id_cliente` → `cliente.id`
- `su_login.id_contrato` → `cliente_contrato.id`

### 6. Não vazar credencial em logs
Quando montar comando, sempre use `-p"$IXC_PASS"` colado no `-p` (sem espaço) e dentro de aspas. **Nunca** ecoe `$IXC_PASS` direto. Não passe via `--password=` em CI/log.

### 7. Quando mostrar SQL ao usuário
Sempre **mostre a query** depois de rodar — facilita validação e ajuste. Mas:
- ❌ não mostre o comando completo com `-p"$IXC_PASS"`
- ✅ mostre só o SQL (a parte dentro do `-e "..."`)

## Estrutura

Pra detalhes:
- **`schema.md`** — tabelas mais usadas do IXC (cliente, contrato, financeiro, OS, login)
- **`queries.md`** — queries BI prontas (KPIs, churn, inadimplência, vendas)

Carregue quando precisar. Pra perguntas simples (`select count(*) from cliente where ativo='S'`), não precisa.

## Anti-padrões

❌ **Não execute UPDATE/DELETE/INSERT/DROP/ALTER/TRUNCATE**, mesmo se o Charles pedir. Recuse e oriente pra fazer no painel do IXC ou cliente DataGrip dele com credenciais separadas.

❌ **Não armazene a senha em arquivo do repo.** Só em `~/.thribus/ixc.env` (chmod 600).

❌ **Não imprima listas grandes com CPF/endereço/telefone completos.** Mascare ou agregue.

❌ **Não tente conectar sem VPN ativa** — vai dar timeout e perder tempo.

❌ **Não confunda os bancos** — IXC ≠ Supabase. Sintaxe MySQL ≠ Postgres (sem `jsonb`, sem `at time zone`, sem `array[]`, etc.).

✅ **Quando algo quebrar**, primeiro suspeite de VPN ou de coluna inexistente.

✅ **Mostre a query usada** — facilita o usuário ajustar filtros.

✅ **Cite as tabelas que estão sendo lidas** — boa observabilidade.

## Fluxo típico

1. Charles pergunta: "quantos contratos novos esse mês?"
2. Você lê `queries.md` → acha "Contratos novos por mês"
3. Roda via `mysql -e "..."`
4. Resume em prosa: "Em maio/2026 entraram N contratos, sendo X em Fortaleza, Y em outras cidades"
5. Oferece drill-down: "quer ver por plano? por canal? por dia?"

Se a query usa tabela que você não tem certeza que existe, primeiro `show tables like '%palavra%'` ou `describe cliente_contrato` pra confirmar antes de inferir.
