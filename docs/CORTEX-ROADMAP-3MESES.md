# Cortex Brain — Roadmap Enterprise 3 Meses

> Plano estratégico pós-Fase 5. Foco: **funcionalidades B2B Enterprise** com 1 piloto rodando (TexNet) que precisa virar 5-10 clientes pagos nos próximos 90 dias.
> Versão: 1.0 — Mai/2026

---

## 1. Diagnóstico honesto — onde estamos

### O que está sólido ✅
- Brain multi-agente (analyze + handoff + memória 3 níveis + audit)
- Multi-tenancy real (DB-backed API keys + isolamento + usage tracking)
- Guardrails production (PII, rate, cost limit)
- 2 módulos Enterprise funcionais (Contratos, Propostas)
- SDK npm + painel admin React
- Stripe billing wired

### Gaps críticos pra B2B Enterprise ❌
**Estes são os bloqueadores reais de venda:**

| Gap | Impacto | Por que importa pra B2B |
|---|---|---|
| **RBAC dentro do tenant** | Bloqueia clientes >5 funcionários | Empresa precisa controlar quem vê o quê |
| **SSO empresarial** (SAML/OIDC) | Mata venda enterprise | Compliance + segurança corporativa exigem |
| **Audit log queryable na UI** | LGPD/SOC 2 | Cliente precisa exportar trilha pra auditoria |
| **Notificações multicanal** | UX quebrada | Eventos críticos não chegam ao time |
| **Workflow automation visual** | Diferencial vs concorrência | "Quando X acontecer, faça Y" sem código |
| **Tickets/Suporte real** | Carla fica vazia | Operação SAC precisa de ticket queue |
| **CRM/Pipeline** | Bianca/Marcos ficam soltos | Onde os leads que qualificam vão parar? |
| **Faturamento BR** (NF.e, boleto) | Bloqueia clientes ISP/serviço | Sem NF.e + boleto não tem operação BR |
| **Webhooks de saída** | Cliente fica preso ao painel | Tem que poder propagar evento pra sistema próprio |
| **Templates de agente por vertical** | Onboarding lento | Sem template, cliente leva 2 semanas pra subir |
| **i18n** | Bloqueia clientes EN/ES | Painel só PT-BR fecha portas |
| **Aprovação humana UI** | Ações risco 3+ paradas | Brain registra mas ninguém aprova |
| **Mobile/PWA** | -30% engagement | Time fora do desk não usa |
| **Data export (CSV/Excel)** | Cliente reclama | Toda gerência exige relatório offline |

### Funcionalidades vendáveis MAS sem runtime ⏳
- **Talki** — schema reservado, sem chat real
- **Thribus BI** — schema reservado, zero implementação

---

## 2. Pilares estratégicos do roadmap

```
┌─────────────────────────────────────────────────────┐
│  PILAR 1: COMPLETUDE ENTERPRISE                      │
│  Os 4 módulos existentes viram production-grade.    │
│  Talki + BI ganham runtime. Workflow horizontal.    │
└─────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────┐
│  PILAR 2: NOVOS MÓDULOS CORE B2B                     │
│  CRM/Pipeline, Tickets, Faturamento BR, Knowledge   │
│  Base. Cobre 80% da operação de PME/Enterprise.     │
└─────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────┐
│  PILAR 3: COMPLIANCE & GOVERNANÇA                    │
│  RBAC, SSO empresarial, audit UI, aprovação humana, │
│  data residency, encryption, LGPD docs.             │
└─────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────┐
│  PILAR 4: ECOSSISTEMA & DISTRIBUIÇÃO                 │
│  Integrações nativas (HubSpot, Pipedrive, Asaas,    │
│  NF.e). Marketplace de agentes/templates por        │
│  vertical. White-label pra agências/integradores.    │
└─────────────────────────────────────────────────────┘
```

---

## 3. Roadmap em 3 meses

### 🗓️ Mês 1 — Completude + Sustentação do piloto

**Objetivo:** TexNet rodando em produção sem dor; outros 2 clientes em onboarding sem fricção.

#### Semana 1-2 — Workflow & Notifications
- [ ] **Workflow engine** — schema `cortex_workflows` (triggers + steps + condições). Trigger: webhook, evento de agente, mudança de status. Step: chamar tool, mandar notificação, atualizar registro, esperar input humano. UI visual (drag-drop) reusando estilo do painel.
- [ ] **Notification service** — fan-out pra email (SES/Resend), Slack webhook, WhatsApp (TexNet), in-app. Tabela `cortex_notifications` com preferências por user. Template engine simples (Handlebars-like).
- [ ] **Webhook de saída** — `cortex_outgoing_webhooks` por tenant. Cliente registra URL e eventos que quer receber (analyze.done, contract.signed, proposal.accepted, etc). HMAC signature pra cliente validar.
- [ ] **Aprovação humana UI** — fila de ações risco ≥3 (do executor) com botões Aprovar/Rejeitar. Notifica responsável via Slack/email. Quando aprovada, executor retoma execução.

#### Semana 3 — Talki Runtime
- [ ] **Talki realtime** — WebSocket ou Server-Sent Events com Supabase Realtime. Threads, mensagens, presença, typing indicator.
- [ ] **Bot integrations** — `@bianca` em thread aciona o Brain via sessionId = thread_id, resposta vira mensagem no thread. Audit + cost contabilizado.
- [ ] **Attachments** — upload pra Supabase Storage, image preview, PDF render.
- [ ] **Search em mensagens** — full-text + semantic (pgvector). Encontra "qual cliente reclamou de cobrança semana passada".

#### Semana 4 — Templates & Onboarding
- [ ] **Templates de agente por vertical** — 8 templates prontos: provedor ISP, clínica, e-commerce, imobiliária, contábil, escritório de advocacia, salão/barbearia, SaaS. Cada um vem com system prompt, intents, tools típicas e knowledge base inicial.
- [ ] **Wizard de onboarding** — fluxo guiado: criar tenant → escolher template → conectar integrações (CRM/WhatsApp) → testar agente. Meta: tenant pronto em < 30 min.
- [ ] **Data import** — CSV de leads/contatos pra Knowledge base; bulk import de docs (markdown/PDF) com chunking automático.

**Entregável M1:** Cliente novo entra, escolhe template, conecta canal, sobe agente em 30 min. Workflows automatizam handoffs. Talki vira ferramenta de uso diário.

---

### 🗓️ Mês 2 — Novos módulos B2B Core

**Objetivo:** Cortex Enterprise vira "suíte completa" — cliente substitui 4-5 ferramentas (CRM, helpdesk, BI, contratos, faturamento).

#### Semana 5-6 — Módulo CRM/Pipeline
- [ ] **`cortex_crm_leads` + `cortex_crm_deals`** — schema completo com stages, owner, valor, probabilidade, custom fields.
- [ ] **Kanban visual** — drag-drop entre stages, filtros por owner/source/data.
- [ ] **Integração Bianca/Marcos** — agentes criam/atualizam leads automaticamente; Brain consulta histórico do lead antes de responder.
- [ ] **Auto-qualificação BANT** — Bianca pergunta budget/authority/need/timeline e atualiza score do lead.
- [ ] **Forecast simples** — total no pipeline ponderado por probabilidade × stage.

#### Semana 7 — Módulo Tickets/Suporte
- [ ] **`cortex_tickets`** — id, status (open/pending/resolved/closed), priority, customer, agent assigned, SLA tracking.
- [ ] **Triagem automática** — agente Carla classifica ticket (técnico/financeiro/comercial), roteia pro agente ou humano.
- [ ] **SLA timer** — alerta visual quando passa de threshold (1h pra urgente, 4h pra normal). Notificação automática pro supervisor.
- [ ] **Satisfação (CSAT)** — após resolver, manda link de avaliação. Métricas no dashboard.

#### Semana 8 — Faturamento BR + Knowledge Base
- [ ] **Módulo Faturamento BR**:
  - Integração **Asaas / Pagar.me / Stripe Brasil** pra boleto + PIX + cartão recorrente
  - Emissão NF.e via integração (NFe.io, eNotas)
  - Régua de cobrança automatizada (Marcos manda lembrete em D-3, D+0, D+5 inadimplência) com workflow
  - Conciliação automática quando webhook do gateway chega
- [ ] **Módulo Knowledge Base** (vira módulo Enterprise com UI própria):
  - Hierarquia de docs/pastas
  - Editor markdown com preview
  - Versionamento (histórico de edições)
  - Permissões por doc (private/team/public ao cliente final)
  - Sincronização opcional Notion/Google Drive (botão "importar")
  - Search semântico (já tem pgvector — só UI)

**Entregável M2:** Cortex Enterprise tem 7 módulos funcionais (Contratos, Propostas, Talki, CRM, Tickets, Faturamento, Knowledge Base) + Brain + 4 agentes. Cliente PME tem operação completa.

---

### 🗓️ Mês 3 — Ecossistema & Compliance

**Objetivo:** Plataforma pronta pra enterprise médio/grande. Vende sem precisar customizar nada.

#### Semana 9 — RBAC + SSO Empresarial
- [ ] **RBAC granular** — roles owner/admin/member/viewer + permissions por módulo + per-resource (ex: ver só próprios leads). Middleware no Express checa permission antes de cada endpoint.
- [ ] **SSO SAML 2.0** — integração com Okta, Azure AD, Google Workspace. IdP-initiated + SP-initiated. JIT user provisioning.
- [ ] **SSO OIDC** — Google, Microsoft, GitHub diretos pra clientes menores que não usam IdP.
- [ ] **2FA** — TOTP (Google Authenticator) opcional por user; obrigatório pra owners.
- [ ] **Session management** — JWT refresh tokens, lista de sessions ativas, revoke remoto.

#### Semana 10 — Compliance & Governança
- [ ] **Audit log UI** — busca + filtros (tenant, user, agent, action type, period) + export CSV. Compliance pode rastrear qualquer ação.
- [ ] **Encryption at rest** — secrets (API keys, credentials) cifrados com AES-256 antes de gravar no DB. Master key em env (ou KMS). PII em campos cifrados.
- [ ] **Data residency** — flag por tenant ("dados só no Brasil"). Validação no boot que o Supabase é region SA.
- [ ] **LGPD self-service** — endpoint `/cortex/lgpd/export/:user_id` (LGPD art. 9) + `/lgpd/delete/:user_id` (art. 18). Wizard no painel.
- [ ] **Compliance docs auto-geradas** — DPA, ToS, Privacy Policy templates customizados por tenant.

#### Semana 11 — Integrações Nativas
- [ ] **HubSpot/Pipedrive/Salesforce** — bidirectional sync de leads/deals/contatos. Webhooks ↔ Cortex CRM.
- [ ] **Slack/Microsoft Teams** — bot que conversa com agentes Cortex; notifications de eventos.
- [ ] **Google Calendar / Outlook** — agente agenda compromisso direto (Bianca marca instalação, Renata agenda entrevista).
- [ ] **WhatsApp Cloud API (Meta)** — alternativa nativa pro 360dialog/TexNet.
- [ ] **Conectores ERP** — TOTVS Protheus + RM, Bling, Tiny, Sankhya (read-only de produtos/clientes).

#### Semana 12 — Marketplace & White-label
- [ ] **Marketplace de agentes** — público lista os 8 templates + comunitários submetidos. Clone com 1 clique pro seu tenant.
- [ ] **Marketplace de tools** — biblioteca de tools prontas (CEP, CNPJ, CPF, taxa câmbio, geocoding, etc). Click-to-install.
- [ ] **White-label** — tenant tipo "agency" pode revender com logo/cores próprios. Domain custom (`brain.cliente.com.br`). Pricing markup configurável.
- [ ] **API pública completa** — OpenAPI 3.1 + Swagger UI hospedado em `/docs`. Cobertura de 100% endpoints.
- [ ] **Public status page** — `status.cortex.thribus.com.br` com uptime histórico, incidentes, métricas públicas.

**Entregável M3:** Cortex Enterprise vende pra empresa de qualquer porte (PME até 1000 funcionários). Integra nativamente com stack que já têm. Compliance pronta pra contrato enterprise.

---

## 4. Features transversais críticas (cortam todo o roadmap)

Estas não viram milestone único — são tarefas distribuídas ao longo dos 3 meses, mas precisam ser tratadas com prioridade:

### Operação & escala
- [ ] **Redis** pra memória curta multi-instance (Mês 1)
- [ ] **Health checks profundos** (DB, Redis, Stripe, OpenAI, Anthropic) — Mês 1
- [ ] **Graceful shutdown** + drain de jobs in-flight — Mês 1
- [ ] **Deploy multi-instance no Coolify** com load balancer interno — Mês 2
- [ ] **Backup automático Supabase** + cold storage S3 (LGPD) — Mês 2
- [ ] **Disaster recovery runbook** — Mês 3

### Observability avançada
- [ ] **OpenTelemetry exporter** pra Grafana/Loki/Tempo — Mês 1
- [ ] **Dashboards públicos** (uptime, latency p50/p95/p99, error rate) — Mês 2
- [ ] **Alerting** (PagerDuty/Slack) em SLO breach — Mês 2
- [ ] **Distributed tracing** entre Brain → agente → tool — Mês 2

### Streaming nativo (ficou da Fase 4)
- [ ] **Anthropic streaming SDK** — emite chunks token-a-token reais nos SSE events — Mês 1

### Experiência do desenvolvedor (DX)
- [ ] **SDKs Python + Go + Ruby** — Mês 3
- [ ] **CLI `cortex`** — `cortex agent create`, `cortex tenant create` — Mês 3
- [ ] **Playground público** (sem login, com tenant demo) — Mês 3

### Interface
- [ ] **Mobile/PWA responsive** — Mês 2
- [ ] **Dark mode toggle** — Mês 1 (quick win)
- [ ] **i18n** (PT, EN, ES) com `react-i18next` — Mês 2
- [ ] **Cmd+K search global** — Mês 2
- [ ] **Notification center** in-app — Mês 1

---

## 5. Quick wins — fazer nas próximas 2 semanas

Coisas de alto impacto + baixo esforço pra ganhar momentum:

1. **Templates de agente** (3-4 dias) — destrava onboarding rápido
2. **Webhooks de saída** (2 dias) — clientes técnicos pedem isso de cara
3. **Audit log UI** (2 dias) — só falta tela do que já existe no DB
4. **Aprovação humana UI** (3 dias) — destrava ações risco alto
5. **Notification service v1** (3 dias) — email + Slack já cobrem 80%
6. **Streaming nativo Anthropic** (2 dias) — UX muito melhor no Playground
7. **Dark mode** (1 dia) — pediu até cliente
8. **Data export CSV** em listas (2 dias) — cliente sempre pede

**Total: ~15-18 dias úteis pra entregar tudo isso. Cabe em 2-3 semanas com foco.**

---

## 6. Métricas de sucesso por mês

| KPI | Hoje | Meta M1 | Meta M2 | Meta M3 |
|---|---|---|---|---|
| Clientes pagos | 1 (TexNet) | 3 | 7 | 12 |
| MRR | R$ X | R$ 25k | R$ 80k | R$ 200k |
| Módulos com runtime | 2 | 4 (+ Talki + BI básico) | 7 (+CRM+Tickets+Faturamento+KB) | 8+ |
| Integrações nativas | 0 | 0 | 3 | 8 |
| Time-to-first-value (novo cliente) | 2 sem | 30 min | 30 min | 15 min |
| Uptime | — | 99.5% | 99.7% | 99.9% |
| NPS | — | 30 | 45 | 55+ |

---

## 7. Trade-offs e o que **NÃO** vamos fazer

Pra manter foco — coisas que cabem no horizonte mas decidimos não priorizar:

- ❌ **Fine-tuning custom por tenant** — complexidade alta, valor incerto. Adiar Q4.
- ❌ **Agentes voice (telefonia real)** — diferente de TTS. Requer integração SIP/Twilio. Adiar Q4.
- ❌ **App mobile nativo** (iOS/Android) — PWA cobre 90%. Nativo só Q4 se cliente exigir.
- ❌ **Editor visual de prompts** estilo n8n — UX cara, valor marginal. Markdown + preview basta.
- ❌ **Multi-LLM no mesmo agente** (Claude + GPT em paralelo) — sem demanda real, custo dobrado.
- ❌ **Plano gratuito (freemium)** — venda B2B não escala em free. Trial de 14 dias é melhor.

---

## 8. Riscos & mitigações

| Risco | Probab. | Mitigação |
|---|---|---|
| Custo LLM dispara com crescimento | Alta | Multi-model routing (Haiku/Sonnet/Opus por tier), cache agressivo, prompt minimization |
| Anthropic muda preço/política | Média | Provider abstraction já existe — pode fallback OpenAI ou Gemini |
| Concorrente lança IA empresarial BR | Alta | Foco vertical + integrações locais (NF.e, PIX, ERPs BR) — barreira de entrada |
| 1º piloto cancela | Média | Diversificar segmentos (não só ISP); manter contato semanal |
| Não conseguimos atender M3 sozinhos | Alta | Contratar 2 devs até M2; documentar tudo conforme constrói |
| Bugs em ação autônoma causam prejuízo a cliente | Média | Aprovação humana obrigatória pra ações ≥ R$ 1k; seguro de erros & omissões |
| Vazamento de dados (PII) | Baixa | Encryption at rest, audit log, LGPD compliance, pentest no M3 |

---

## 9. Próximos passos imediatos (esta semana)

1. **Validar o roadmap** com 2-3 prospects: "se eu te entregar X em Y, fecha?"
2. **Pricing review** — confirmar valores Essencial/Business/Corporate com pelo menos 1 venda fechada
3. **Hiring plan** — começar processo pra 1 dev full-stack senior + 1 dev backend Node mid (cubra M2-M3)
4. **Stack decision Mês 1**:
   - Notificações: Resend (email) + Slack incoming webhooks
   - Workflow engine: caseiro (não usar Temporal/Inngest agora — overkill)
   - Realtime: Supabase Realtime (já configurado) ou WebSocket próprio?
5. **Definir SLA público** — 99.5%? Crédito em caso de breach? Suporte 8x5 ou 24x7?

---

## 10. Glossário

- **Workflow engine** — sistema que orquestra steps automatizados (trigger → ações → condições)
- **RBAC** — Role-Based Access Control (controle de acesso por papel/permissão)
- **IdP** — Identity Provider (Okta, Azure AD…)
- **SAML/OIDC** — protocolos de SSO empresarial
- **DPA** — Data Processing Agreement (contrato LGPD/GDPR)
- **JIT provisioning** — usuário criado automaticamente no 1º login SSO
- **CSAT/NPS** — métricas de satisfação
- **SLO** — Service Level Objective (alvo interno de uptime/latência)
- **TTV** — Time To Value (quanto tempo cliente leva pra ver valor)
