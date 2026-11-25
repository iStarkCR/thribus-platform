# Thribus Platform — Plano de reorganização

**Data:** 25/11/2026 · **Status:** proposta para decisão · **Dono:** Charles

## 1. Visão

A Thribus Platform é o ambiente onde a **Thribus opera com IA** (time de agentes executando tarefas) e, depois, o produto que **plugamos nas empresas** pra elas implantarem IA no negócio. O chat é o centro: é onde se pede, se acompanha e se aprova trabalho.

A ordem importa: **primeiro o time interno usa e prova, depois vira produto**. O que não serve o time hoje não entra no menu.

## 2. Onde estamos

**O que já é forte**
- Chat com o Bukowiski é o próprio Claude Code (ponte no Mac): mesmas tools, MCPs, skills; streaming, blocos ricos (cards/confirm/demands), anexos, citação, pasta de trabalho por conversa, custo real, limites do plano.
- Kanban de demandas com orquestrador, dependências e rotinas.
- Voz: tempo real (OpenAI Realtime + Claude via tool), modo dividido com o chat, legenda ao vivo.
- Worker (API) multi-provider já atende agentes de cliente (Bianca/WhatsApp) — é a base do motor de produto.

**O que pesa**
- **Menu inchado:** 48 itens em 11 grupos.
- **~28 páginas mostram dados de demonstração** (`src/lib/seed-*`), 12 delas marcadas como visíveis ao cliente (Inbox, Customer 360, Billing, Status, Knowledge, Notificações…). Cliente vendo dado fictício é risco de credibilidade.
- **Segurança (auditoria de 25/11):** qualquer conta logada consegue mandar a ponte executar comandos no Mac (RLS de `collaborator_messages` + `bypassPermissions`); edge functions de voz sem checagem de usuário; listagem de pastas legível pela anon key.
- **Chat:** streaming pode duplicar/truncar resposta, "Parar" falha em fila, refetch da conversa inteira a cada chunk, canal realtime vaza em reconexão.
- **Duas máquinas sem fronteira clara:** ponte (Mac, assinatura pessoal, sem permissões) e worker (servidor, API).

## 3. Premissas (confirmar)

| # | Premissa assumida | Se for diferente… |
|---|---|---|
| P1 | "Time" = **agentes IA do organograma primeiro**, pessoas da Thribus depois | Pessoas primeiro → Fase 3 antecipa contas/papéis |
| P2 | Primeiros clientes do produto = verticais onde já atuamos (**ISP/TexNet, crédito**) | Outra vertical → muda templates e integrações da Fase 4 |
| P3 | Produto para cliente roda **só no worker (API comercial)**, nunca na ponte do Mac | — (é requisito, não preferência) |

## 4. Arquitetura-alvo — três camadas

```
Interface      painel · chat · voz · WhatsApp/Telegram · celular
Orquestração   demandas · rotinas · roteamento de modelo · aprovação · custo
Motores        PONTE (Claude Code, Mac)      → uso interno da Thribus
               WORKER (API, multi-tenant)    → agentes de clientes / produto
```

Regra de fronteira: **cliente nunca toca a ponte**. A ponte é a "mesa do Charles" (acesso total à máquina); o worker é o produto (isolado por workspace, auditável, cobrado por uso).

## 5. Claude Code direto × Platform — regra de uso

| Trabalho | Onde | Por quê |
|---|---|---|
| Código, refactor, PR, debug | **Claude Code direto** | Diff, review, permissões por ação, worktrees, plan mode |
| Delegar tarefa ao time, rotinas, status, relatórios | **Platform** | Orquestração, fila, custo, histórico do time |
| Conversa rápida, voz, celular | **Platform** | Voz em tempo real, acesso de qualquer lugar |
| Acompanhar tudo num lugar | **Platform** | O espelho já traz as sessões do Claude Code pro painel |

Não migrar dev pra Platform até ela ter: visualização de diff, aprovação por ação de risco e permissões por agente (Fase 3).

## 6. Fases

Tamanho: **P** (dias) · **M** (1–2 semanas) · **G** (3+ semanas). Estimativas, não prazos.

### Fase 0 — Segurança (P) — pré-requisito de tudo
- [ ] Ponte só atende mensagens do dono (filtro por `user_id` do Charles/time) e de sessões do próprio usuário; RLS de `collaborator_messages` checa posse da `session_id`.
- [ ] Confirmar e fechar cadastro aberto no Auth (se ligado).
- [ ] Edge functions `tts`, `transcribe`, `voice-ack`: exigir usuário autenticado.
- [ ] `fs_browse` e `cortex_work_folders`: só super-admin.
- [ ] Anexos: validar `path` dentro da pasta do usuário.

**Pronto quando:** uma conta nova não consegue disparar a ponte nem ler dados de outro usuário (teste do Deming).

### Fase 1 — Limpeza (M)
- [ ] **Menu em 4 áreas** (de 48 itens pra ~12):
  - **Trabalho:** Conversas · Demandas · Rotinas · Colaboradores
  - **Cérebro:** Controle (modelo/uso) · Skills · Knowledge*
  - **Clientes:** Workspaces · Inbox* · Customer 360*
  - **Admin:** Acessos · Configurações · Métricas/Logs
  - \* só entra quando ligado a dado real.
- [ ] **Modo demo:** páginas com seed ficam atrás de uma flag (`demo`), fora do menu padrão e **nunca** visíveis ao cliente. Viram material de pitch, não produto.
- [ ] Inventário página a página (Anexo A): manter / esconder (demo) / remover.
- [ ] Remover `/voice-test` da navegação de produção.

**Pronto quando:** todo item do menu padrão mostra dado real; nenhum seed aparece pra conta cliente.

### Fase 2 — Chat como centro de trabalho (M–G)
Correções (da auditoria):
- [ ] Streaming aplicando o payload do realtime direto no estado (sem refetch da conversa a cada chunk); refetch só pra reconciliar.
- [ ] Ponte: `await` no 1º INSERT do streaming (fim da duplicação/truncamento).
- [ ] "Parar" pelo id da mensagem que está rodando + respeitar cancelamento na fila + matar o grupo de processos.
- [ ] Erros honestos: timeout/reinício da ponte viram `error` com "Reenviar" (não `done` silencioso, não reexecução cega).

Recursos novos:
- [ ] **Fila visível** na conversa ("na fila — 2º") com cancelar.
- [ ] **Delegar no chat:** `@Turing revisa o PR 52` cria demanda pro agente e mostra o card de execução na própria conversa.
- [ ] **Painel de execução** ao lado da resposta: passos/tools em tempo real, arquivos tocados, custo (base já existe em `run_events`).
- [ ] **Aprovação por ação de risco:** deploy, email externo, cobrança, delete → card ```confirm obrigatório mostrando exatamente o que será executado (corrige o confirm que envia texto oculto).
- [ ] Busca entre conversas + fixar/resumir conversa longa.
- [ ] Interface mais limpa: rodapé com 1 linha (modelo · pasta · uso), badges secundários num menu.

### Fase 3 — Time dentro da Platform (G)
- [ ] **Ficha de cada agente:** missão, ferramentas permitidas, pastas/sistemas que acessa, modelo padrão, teto de custo/dia.
- [ ] **Permissões por agente** no lugar do `bypassPermissions` geral (ex.: Arkad lê Asaas mas não estorna sem aprovação).
- [ ] Demandas com dono, prazo, SLA e entrega revisável; histórico por agente.
- [ ] **Painel do time:** o que cada agente fez hoje, custo, taxa de sucesso, demandas paradas.
- [ ] Pessoas da Thribus com conta e papel (quem pode delegar a quem, quem aprova o quê).

**Pronto quando:** uma semana de operação do time rodando por demandas na Platform, com custo e entregas auditáveis.

### Fase 4 — Produto para empresas (G, depois da 3)
- [ ] Motor do cliente 100% no worker (API comercial), isolado por workspace; atualizar modelos do worker (hoje fixos em versões antigas).
- [ ] Onboarding de empresa: conectar canais (WhatsApp/Talki), base de conhecimento, agentes a partir de templates da vertical.
- [ ] Billing real por uso (Asaas), LGPD por tenant, logs de auditoria.
- [ ] Revisar termos: atender cliente com API comercial, não com assinatura pessoal.

## 7. Como medir

| Métrica | Hoje | Meta Fase 3 |
|---|---|---|
| Itens no menu padrão | 48 | ≤ 12 |
| Páginas com dado fictício visíveis ao cliente | 12 | 0 |
| Tarefas do time que passam pela Platform | não medido | > 70% |
| Demandas concluídas sem retrabalho | não medido | > 80% |
| Custo por demanda | parcial | visível por agente |

## 8. Riscos

- **Mac como servidor:** ponte cai se o Mac dormir/desligar. Mitigação: alerta (Argos) + avaliar ponte na VPS para tarefas que não exigem o Mac.
- **Escopo:** a plataforma cresceu por largura. Regra: nada novo no menu sem dado real e usuário real.
- **Custo:** voz em tempo real e Opus pesam; Fase 2 precisa registrar o custo do Realtime no `cortex_usage`.

## 9. Próximos passos

1. Charles confirma P1–P3.
2. Executar Fase 0 (segurança).
3. Fase 1: inventário do Anexo A validado com o Charles (o que é demo de pitch e o que some).

---

## Anexo A — Inventário de páginas (rascunho)

Critério: **Real** = lê dados de serviço/Supabase sem seed · **Seed** = estado inicial vem de `src/lib/seed-*` (fictício ou híbrido — validar) · **Verificar** = sem seed nem serviço direto (lê do store).

| Rota | Página | Dado | Proposta |
|---|---|---|---|
| /talk | Conversas | Real | Manter (centro) |
| /demands | Demandas | Real | Manter |
| /routines | Rotinas | Real | Manter |
| /agents | Colaboradores | Real | Manter |
| /cortex-brain | Controle (modelo · uso) | Real | Manter |
| /cortex-skills | Skills do Claude | Real | Manter |
| /access · /settings · /profile | Sistema | Real | Manter (Admin) |
| /cortex · /stack · /enterprise | Cortex Admin / Stack | Real/Verificar | Unificar em Admin |
| / | Dashboard | Verificar | Refazer como "Hoje": demandas, custo, alertas |
| /tools · /skills · /templates | Catálogo | Verificar | Unificar em "Skills" |
| /analytics · /logs | Métricas · Logs | Verificar | Manter em Admin |
| /clients | Workspaces | Verificar | Manter (Clientes) |
| /knowledge | Knowledge Base | Seed | Ligar a dado real ou demo |
| /inbox · /customers | Inbox · Customer 360 | Seed | Demo até integrar Talki |
| /billing | Billing | Seed | Demo até ligar Asaas real |
| /voice | Canal de Voz | Seed | Demo (voz real está no chat) |
| /integrations · /orchestration · /studio | Cérebro/no-code | Seed | Demo |
| /lab · /experiments · /insights · /reports · /optimizer | Lab & Intel | Seed | Demo (reports → Hub Thribus) |
| /marketplace · /partners · /sandbox | Growth | Seed | Demo (pitch) |
| /api-docs · /webhooks · /mobile · /notifications · /status · /help | Plataforma | Seed | Demo |
| /governance · /lgpd · /compliance · /vault | Governança | Seed | Demo até Fase 4 |
| /onboarding · /activity | Onboarding · Feed | Seed | Refazer na Fase 4 |
| /voice-test | Diagnóstico de voz | Real | Tirar do menu |
