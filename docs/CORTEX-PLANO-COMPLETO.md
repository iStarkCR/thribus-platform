# Cortex Ecosystem — Plano Completo

> Documento estratégico + técnico para construção e go-to-market do Cortex Brain e Cortex Enterprise.
> Versão: 1.0 — 2026-05-14

---

## 1. Visão do Ecossistema Cortex

```
┌─────────────────────────────────────────────────────────┐
│                  CORTEX ENTERPRISE                       │
│             (Hub de Soluções Empresariais)               │
│                                                          │
│  ┌─────────────┐  ┌──────────────┐  ┌──────────────┐    │
│  │   CORTEX    │  │ COLABORADORES│  │   MÓDULOS    │    │
│  │   BRAIN     │◄─┤   DIGITAIS   │  │   SaaS       │    │
│  │             │  │              │  │              │    │
│  │ • Memória   │  │ • Bianca     │  │ • Contratos  │    │
│  │ • Insights  │  │ • Renata     │  │ • Propostas  │    │
│  │ • Roteador  │  │ • Marcos     │  │ • Talki      │    │
│  │ • Ações     │  │ • Carla      │  │ • Thribus BI │    │
│  │   autônomas │  │ • + custom   │  │ • + custom   │    │
│  └─────────────┘  └──────────────┘  └──────────────┘    │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

**Três produtos, uma narrativa:**

| Produto | O que é | Quem compra | Modelo |
|---|---|---|---|
| **Cortex Brain** | Cérebro IA injetável em sistemas | Empresas que já têm sistemas | API/SDK + assinatura |
| **Colaboradores Digitais** | Agentes especializados (Bianca, Renata, etc) | Quem quer automação por função | Por agente/mês |
| **Cortex Enterprise** | Hub completo: Brain + Agentes + Módulos | Empresa que quer transformação digital total | Suite/assinatura |

---

## 2. Cortex Brain — O Produto

### 2.1 Pitch em 1 frase
**"O cérebro de IA que se conecta aos seus sistemas, entende seu negócio, e age."**

### 2.2 Pitch em 3 frases
> Cortex Brain é uma camada de inteligência que você injeta em qualquer sistema da sua empresa. Ele aprende com seus dados, gera insights em tempo real, e quando preciso, aciona colaboradores digitais para executar ações autonomamente — vendas, atendimento, cobrança, RH. Você não compra um chatbot. Você instala um cérebro.

### 2.3 Diferenciais

1. **Injetável** — não é um app à parte, vira parte dos seus sistemas via API/SDK/widget
2. **Memória contextual de longo prazo** — lembra de tudo do cliente/contexto, entre sessões e sistemas
3. **Multi-agente nativo** — roteia para o especialista certo automaticamente
4. **Ações autônomas auditáveis** — age sozinho com guardrails e trilha de auditoria
5. **LGPD-first** — controle de dados, mascaramento PII, residência de dados Brasil
6. **Multi-modelo** — Claude (default), GPT, modelos locais — escolha por caso de uso/custo

### 2.4 Casos de uso (vendáveis)

| Vertical | Use Case | Métrica de valor |
|---|---|---|
| Provedores ISP | Atendimento 24/7 + viabilidade + cobrança | -60% custo SAC, +30% conversão |
| E-commerce | Pre-sale, pós-venda, recuperação carrinho | +25% conversão, NPS |
| SaaS | Onboarding, suporte, expansion | -40% churn, +CSAT |
| Clínicas | Agendamento, lembrete, triagem | -50% no-show |
| Imobiliárias | Qualificação lead, agendamento visita | +3x leads qualificados |

---

## 3. Arquitetura Técnica

### 3.1 Visão de alto nível

```
                    ┌─────────────────────────────────┐
                    │      SISTEMAS EXTERNOS          │
                    │  CRM | ERP | App | Site | WA    │
                    └────────────┬────────────────────┘
                                 │
                         ┌───────▼────────┐
                         │  INJECT LAYER  │
                         │  REST / SDK /  │
                         │  Webhook       │
                         └───────┬────────┘
                                 │
                  ┌──────────────▼──────────────┐
                  │     CORTEX BRAIN CORE       │
                  │                             │
                  │  ┌─────────────────────┐    │
                  │  │ Intent Analyzer     │    │
                  │  └──────────┬──────────┘    │
                  │             │               │
                  │  ┌──────────▼──────────┐    │
                  │  │ Memory Layer        │◄───┼─── Supabase
                  │  │ (short+long+vector) │    │    pgvector
                  │  └──────────┬──────────┘    │
                  │             │               │
                  │  ┌──────────▼──────────┐    │
                  │  │ Router/Orchestrator │    │
                  │  └──────────┬──────────┘    │
                  │             │               │
                  │  ┌──────────▼──────────┐    │
                  │  │ Guardrails + Policy │    │
                  │  └──────────┬──────────┘    │
                  └─────────────┼───────────────┘
                                │
        ┌───────────────────────┼────────────────────────┐
        │                       │                        │
   ┌────▼─────┐          ┌──────▼────┐           ┌───────▼────┐
   │ Agent    │          │ Agent     │           │ Agent      │
   │ Runtime  │          │ Runtime   │           │ Runtime    │
   │ "Bianca" │          │ "Renata"  │           │ "Custom"   │
   └────┬─────┘          └──────┬────┘           └───────┬────┘
        │                       │                        │
        └───────────────────────┼────────────────────────┘
                                │
                       ┌────────▼────────┐
                       │  TOOL LAYER     │
                       │ IXC | TexNet |  │
                       │ n8n | Talki |   │
                       │ Custom APIs     │
                       └─────────────────┘
```

### 3.2 Stack técnica

| Camada | Tecnologia | Por quê |
|---|---|---|
| Runtime | Node.js + TypeScript | Já temos no worker, ecossistema maduro |
| API | Express + Zod | Validação forte, schema-first |
| LLM | Anthropic Claude (Sonnet/Haiku) | Melhor tool use, raciocínio |
| LLM fallback | OpenAI GPT-4 | Resiliência |
| Memória curta | Redis | Sessão, context window |
| Memória longa | Supabase (Postgres + pgvector) | Já temos, suporta vector search |
| Orquestração externa | n8n | Já temos, fluxos visuais |
| Queue | BullMQ (Redis) | Jobs assíncronos, retry |
| Deploy | Coolify (Docker) | Já temos, auto-deploy |
| Observabilidade | OpenTelemetry + Grafana | Padrão de mercado |
| Cost tracking | LangSmith ou custom | Controle por tenant |

### 3.3 Estrutura de código proposta

```
worker/src/
├── cortex/
│   ├── brain/
│   │   ├── analyzer.ts        # Análise de intenção
│   │   ├── orchestrator.ts    # Roteamento principal
│   │   ├── synthesizer.ts     # Consolida output dos agentes
│   │   └── prompts/           # System prompts versionados
│   ├── memory/
│   │   ├── short-term.ts      # Redis-based session memory
│   │   ├── long-term.ts       # Postgres entity memory
│   │   ├── semantic.ts        # pgvector semantic search
│   │   └── consolidation.ts   # Resumos periódicos
│   ├── agents/
│   │   ├── registry.ts        # Catálogo de agentes
│   │   ├── runtime.ts         # Executor de agente
│   │   ├── definitions/       # YAML/JSON dos agentes
│   │   │   ├── bianca.yaml
│   │   │   ├── renata.yaml
│   │   │   └── marcos.yaml
│   │   └── tools/             # Tools que agentes podem usar
│   ├── inject/
│   │   ├── rest.ts            # POST /cortex/analyze, /act, /chat
│   │   ├── websocket.ts       # Streaming responses
│   │   ├── webhook.ts         # Eventos pra fora
│   │   └── sdk/               # SDKs JS/Python
│   ├── guardrails/
│   │   ├── policy.ts          # Política do tenant
│   │   ├── pii.ts             # Mascaramento PII
│   │   ├── cost-limit.ts      # Limite de gasto
│   │   └── rate-limit.ts      # Rate limiting
│   ├── observability/
│   │   ├── tracing.ts         # OpenTelemetry
│   │   ├── audit.ts           # Trilha de auditoria
│   │   └── metrics.ts         # Custom metrics
│   └── tenancy/
│       ├── tenant.ts          # Multi-tenant context
│       ├── isolation.ts       # Row-level security
│       └── config.ts          # Config por tenant
└── agent/                      # legado Bianca (migra pra cortex/agents)
```

---

## 4. Funcionalidades para Robustez

### 4.1 Memória — 3 níveis

**Memória curta (Redis, TTL ~1h)**
- Contexto da sessão atual
- Últimas N mensagens
- Estado da conversa

**Memória longa (Postgres, persistente)**
- Perfil do cliente/entidade
- Histórico consolidado
- Preferências aprendidas
- Decisões tomadas e por quê

**Memória semântica (pgvector)**
- Documentos/conhecimento do tenant
- Conversas passadas indexadas
- Busca por similaridade
- RAG por tenant

**Consolidação automática**
- Cron job que resume conversas longas
- Extrai fatos relevantes pra memória longa
- Mantém context window enxuto

### 4.2 Multi-tenancy

- **Isolamento por tenant_id** em todas as queries (RLS no Postgres)
- **API key por tenant** com escopos
- **Configuração por tenant**: agentes habilitados, limites, prompts customizados
- **Branding por tenant**: nome do bot, tom de voz, identidade
- **Billing por tenant**: tracking de tokens, ações, mensagens

### 4.3 Guardrails (essencial pra vender)

| Guardrail | Implementação |
|---|---|
| PII detection/masking | Regex + LLM check antes de logar |
| Cost limit per tenant | Bloqueia ação se ultrapassou limite |
| Action approval | Ações críticas exigem aprovação humana |
| Prompt injection defense | System prompt blindado, input sanitization |
| Output validation | Schema validation antes de retornar |
| Audit log imutável | Toda ação registrada com hash |
| Rate limiting | Por tenant, por endpoint, por agente |
| Content filtering | Detectar conteúdo impróprio/ofensivo |

### 4.4 Observabilidade

- **Tracing**: cada request gera um trace_id, propagado por todos os agentes
- **Métricas**: latência, custo, taxa de sucesso, tool calls por agente
- **Logs estruturados**: JSON com tenant_id, agent_id, action_id
- **Dashboard por tenant**: cliente vê uso, ações, custos
- **Alertas**: custo anormal, erros em sequência, agente travado

### 4.5 Ações autônomas com segurança

```
┌─────────────────────────────────────────┐
│  Classificação de ações por risco       │
├─────────────────────────────────────────┤
│ NÍVEL 0: read-only (consultar dados)    │ → Auto
│ NÍVEL 1: enviar mensagem ao cliente     │ → Auto + log
│ NÍVEL 2: criar/atualizar dados internos │ → Auto + audit
│ NÍVEL 3: ações com efeito financeiro    │ → Aprovação humana
│ NÍVEL 4: ações irreversíveis            │ → Aprovação + 2FA
└─────────────────────────────────────────┘
```

### 4.6 Performance

- **Streaming SSE** para respostas longas
- **Prompt caching** (Claude) para reduzir custo 80%+
- **Model routing**: Haiku para tarefas simples, Sonnet para complexas
- **Batching** de embeddings
- **Connection pooling** Postgres
- **CDN** para SDKs públicos

### 4.7 Compliance & Segurança

- **LGPD**: data export, right to forget, consent tracking
- **SOC 2** (médio prazo)
- **Criptografia em repouso e trânsito**
- **Secrets em vault** (não em env vars de prod)
- **Backup automático** (Supabase + offsite)
- **Audit log imutável** (append-only)
- **Residência de dados Brasil** (Coolify/AWS São Paulo)

### 4.8 Developer Experience (DX) — pra vender pra times técnicos

- **SDK JS/TS, Python**: `npm install @cortex/brain-sdk`
- **CLI**: `cortex agent create`, `cortex agent deploy`
- **Playground web**: testar agentes sem código
- **Docs interativas** com exemplos copy-paste
- **Webhooks** para eventos
- **Postman collection**
- **OpenAPI spec** auto-gerada

---

## 5. Roadmap de Desenvolvimento

### Fase 0 — Fundação (Semanas 1-2)
**Objetivo:** Cortex Brain "hello world" — recebe input, roteia, responde.

- [ ] Setup `worker/src/cortex/` com TypeScript + Zod
- [ ] Endpoint `POST /cortex/analyze` (auth básica + tenant_id)
- [ ] Brain analyzer com Claude Sonnet
- [ ] Memória curta Redis
- [ ] Registry de agentes (YAML)
- [ ] Bianca como primeiro agente registrado
- [ ] Audit log básico

**Entregável:** Brain funcional ponta-a-ponta, integrado com Bianca atual.

### Fase 1 — Multi-agente (Semanas 3-4)
**Objetivo:** Brain roteia entre múltiplos agentes especializados.

- [ ] Criar Renata, Marcos, Carla (definições YAML)
- [ ] Orchestrator com tool_use do Claude
- [ ] Synthesizer (consolida múltiplas respostas)
- [ ] Memória longa Postgres
- [ ] Handoff entre agentes (passa contexto)
- [ ] Streaming SSE

**Entregável:** Roteamento automático + 4 agentes funcionais.

### Fase 2 — Robustez & Multi-tenant (Semanas 5-7)
**Objetivo:** Pronto pra primeiro cliente externo.

- [ ] Multi-tenancy completo (RLS, isolation)
- [ ] Sistema de API keys + escopos
- [ ] Guardrails (PII, cost limit, rate limit)
- [ ] Memória semântica (pgvector + RAG)
- [ ] Observability (OpenTelemetry + dashboard)
- [ ] Aprovação humana para ações nível 3+
- [ ] Documentação técnica completa

**Entregável:** Plataforma multi-tenant production-ready.

### Fase 3 — DX & Self-service (Semanas 8-10)
**Objetivo:** Cliente consegue se onboardar sozinho.

- [ ] Painel web (admin, billing, agentes)
- [ ] SDK TypeScript publicado no npm
- [ ] Playground web
- [ ] Docs interativas (Mintlify ou Docusaurus)
- [ ] Onboarding wizard
- [ ] Templates de agentes (marketplace mini)

**Entregável:** Self-service onboarding + portal do cliente.

### Fase 4 — Cortex Enterprise (Semanas 11-14)
**Objetivo:** Hub completo com módulos integrados.

- [ ] Integração Contratos (módulo)
- [ ] Integração Propostas (módulo)
- [ ] Integração Talki
- [ ] Integração Thribus BI
- [ ] SSO (Google, Microsoft)
- [ ] Billing unificado
- [ ] Pacote Enterprise vendável

**Entregável:** Cortex Enterprise lançado.

### Fase 5 — Escala (Mês 4+)
- Marketplace de agentes públicos
- Fine-tuning por cliente
- Mobile SDK (React Native)
- Integrações nativas (HubSpot, Salesforce, Pipedrive)
- Modelo white-label
- Programa de parceiros

---

## 6. Modelo de Negócio & Pricing

### 6.1 Cortex Brain (standalone)

| Plano | Preço | Inclui |
|---|---|---|
| **Starter** | R$ 1.997/mês | 50k mensagens, 1 agente, 1 tenant |
| **Growth** | R$ 4.997/mês | 200k mensagens, 5 agentes, 3 tenants |
| **Scale** | R$ 9.997/mês | 1M mensagens, agentes ilimitados, 10 tenants |
| **Enterprise** | Sob consulta | Volume custom + SLA + suporte dedicado |

**Add-ons:**
- Tokens extras: R$ 0,02 / 1k tokens
- Agente customizado: R$ 2.000 setup + R$ 500/mês
- Treinamento on-premise: R$ 50k

### 6.2 Cortex Enterprise (suite)

| Plano | Preço | Inclui |
|---|---|---|
| **Essencial** | R$ 7.997/mês | Brain + 2 colaboradores + 2 módulos |
| **Business** | R$ 14.997/mês | Brain + 5 colaboradores + todos módulos |
| **Corporate** | R$ 29.997+/mês | Tudo + customizações + dedicated success manager |

**Setup fee:** R$ 10k – R$ 50k (integração + treinamento)

### 6.3 Unit economics target

- **CAC alvo:** R$ 8k – R$ 15k (Enterprise)
- **LTV alvo:** R$ 180k+ (3 anos)
- **Gross margin:** 70%+ (descontando custo de modelos)
- **Payback:** 6-9 meses

---

## 7. Pitch Deck — Estrutura

### Slide 1 — Capa
Cortex Brain
**O cérebro de IA que age dentro dos seus sistemas.**

### Slide 2 — O problema
- Empresas têm dados espalhados, sistemas isolados
- Equipes operacionais sobrecarregadas com tarefas repetitivas
- Chatbots são burros: não decidem, não agem, não lembram
- IA generativa é poderosa mas desconectada do negócio

### Slide 3 — A virada
> "E se sua empresa tivesse um cérebro digital que entende todos seus sistemas, lembra de cada cliente, e age 24/7?"

### Slide 4 — O que é Cortex Brain
- Camada de inteligência injetável
- Memória de longo prazo
- Multi-agente especializado
- Ações autônomas auditáveis

### Slide 5 — Como funciona (diagrama)
[Arquitetura simplificada]

### Slide 6 — Casos de uso
[Tabela vertical → métrica]

### Slide 7 — Demonstração
[Live demo ou vídeo: Bianca atendendo TexNet]

### Slide 8 — Diferenciais
- Multi-modelo
- LGPD-first
- White-label friendly
- Brasil-first (suporte, docs, residência de dados)

### Slide 9 — Ecossistema Cortex
[Brain + Colaboradores + Módulos = Enterprise]

### Slide 10 — Tração
- Cliente atual: TexNet (provedor ISP)
- Bianca: X mil mensagens/mês, Y% conversão
- Métricas reais

### Slide 11 — Mercado
- TAM: empresas brasileiras com >50 funcionários (~200k)
- SAM: que usam CRM/ERP (~50k)
- SOM: que estão investindo em IA (~10k)

### Slide 12 — Modelo de negócio
[Pricing tiers + projeção MRR]

### Slide 13 — Roadmap
[Fases visuais]

### Slide 14 — Time
[Quem são + por que esse time]

### Slide 15 — Investimento / Ask
- Quanto precisa
- Pra quê
- Milestones de uso

---

## 8. Cortex Enterprise — Posicionamento

### 8.1 Narrativa de vendas

> "Você não precisa contratar 5 fornecedores diferentes pra digitalizar sua empresa. Cortex Enterprise traz cérebro, colaboradores digitais e módulos operacionais num só lugar — integrados nativamente, com uma única curva de aprendizado."

### 8.2 Stack de valor

```
┌─────────────────────────────────────┐
│  INTELIGÊNCIA   → Cortex Brain      │
├─────────────────────────────────────┤
│  EXECUÇÃO       → Colaboradores     │
├─────────────────────────────────────┤
│  OPERAÇÃO       → Módulos SaaS      │
├─────────────────────────────────────┤
│  DADOS          → Thribus BI        │
└─────────────────────────────────────┘
```

### 8.3 Argumentos de venda

1. **Integração nativa** — não é Zapier amarrando coisas, é mesma plataforma
2. **Single sign-on, single billing**
3. **Dados conectados** — agente de vendas vê contratos, BI vê tudo
4. **Menor TCO** — 1 plataforma < 5 ferramentas
5. **Suporte unificado**
6. **Roadmap único** — features novas em todos os módulos

### 8.4 Personas target

| Persona | Dor | Argumento |
|---|---|---|
| CEO PME 50-500 pessoas | "Não consigo escalar operação" | "Triplique capacidade sem triplicar time" |
| CTO médio porte | "Stack fragmentado, integração ruim" | "Uma plataforma, uma API" |
| Diretor comercial | "SDR caro, conversão baixa" | "Bianca/Marcos qualificam 24/7" |
| COO | "Operação manual demais" | "Automatize sem código" |
| CFO | "Custo de SaaS explodindo" | "Substitui 5 ferramentas" |

---

## 9. Go-to-market

### 9.1 Estratégia inicial

**Mês 1-3: Validação com early adopters**
- 3-5 clientes parceiros (desconto pesado, feedback intenso)
- Foco vertical: provedores ISP (TexNet como case)
- Pricing flexível, contratos curtos

**Mês 4-6: Caso de sucesso + expansão vertical**
- Case TexNet documentado (vídeo, números, ROI)
- Expansão pra 2 verticais novas (clínicas? imobiliárias?)
- Programa de indicação

**Mês 7-12: Escala**
- Conteúdo (blog, YouTube, LinkedIn)
- SDR/AE dedicado
- Eventos (RD Summit, Web Summit Rio)
- Parcerias (consultorias, integradores)

### 9.2 Canais

- **Inbound**: SEO, blog técnico, calculadora ROI
- **Outbound**: SDR para PMEs médias
- **Parcerias**: consultorias de transformação digital
- **Eventos**: vertical-specific (ABRINT pra ISP, etc)
- **Open source**: pequeno componente OSS para credibilidade dev

### 9.3 Métricas-chave (KPIs)

| Métrica | Target ano 1 |
|---|---|
| MRR | R$ 100k |
| Clientes | 20-30 |
| Logo churn | <5%/mês |
| NRR (net revenue retention) | >110% |
| CAC payback | <9 meses |
| NPS | >50 |

---

## 10. Riscos & Mitigações

| Risco | Probabilidade | Mitigação |
|---|---|---|
| Custo de modelos LLM explode | Alta | Multi-modelo + caching + Haiku para 80% |
| Concorrência (OpenAI, Anthropic lançam similar) | Média | Foco vertical Brasil + integrações locais |
| LGPD/regulação | Média | Compliance-first desde dia 1 |
| Cliente quer self-host | Média | Plano Enterprise com on-premise |
| Bug em ação autônoma causa prejuízo | Média | Guardrails + aprovação humana + seguro |
| Dependência de Anthropic | Alta | Fallback OpenAI + modelos locais |

---

## 11. Próximos Passos Imediatos

### Esta semana
1. [ ] Validar pricing com 3 prospects (entrevistas)
2. [ ] Criar repo `cortex/` dentro do worker
3. [ ] Setup do esqueleto técnico (Fase 0)
4. [ ] Domínio: cortex.thribus.com.br + cortex.ai (se disponível)

### Próximas 2 semanas
1. [ ] Fase 0 completa (Brain hello world)
2. [ ] Landing page com waitlist
3. [ ] Pitch deck final (este doc → Pitch)
4. [ ] Demo gravado com Bianca rodando no Brain

### Mês 1
1. [ ] Fase 1 completa (multi-agente)
2. [ ] Primeiro cliente externo (além de TexNet) testando
3. [ ] Material de venda: one-pager, deck, calculadora ROI

---

## 12. Glossário

- **Agent / Colaborador Digital**: instância de IA com prompt, ferramentas e missão específica (Bianca, Renata...)
- **Brain**: camada orquestradora que recebe input, analisa, roteia, e consolida resposta
- **Tenant**: cliente da plataforma (uma empresa que usa Cortex)
- **Inject**: ato de conectar Cortex em um sistema externo (via API/SDK/webhook)
- **Tool**: função/integração que um agente pode usar (consultar IXC, enviar WhatsApp, etc)
- **Guardrail**: regra de segurança/política aplicada antes de uma ação
- **Memory consolidation**: processo de resumir histórico longo em fatos para memória de longo prazo
