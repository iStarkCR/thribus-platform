# Bukowiski legado — inventário completo e plano de portabilidade

Auditoria de `~/projects/Bukowiski/daemon/` (server.js 1424 linhas, orchestrator.js, telegram.js, proactive.js, db.js) + docs.
Objetivo: portar o que vale pro **painel** (`thribus-platform` + `bukowiski-bridge.mjs`) e pro **Telegram**.

## TL;DR

- O legado tem uma **camada conversacional madura** que o painel não tem: paralelismo de raias, roteamento de modelo por complexidade, quick-ack, comandos, voz, proatividade.
- A "memória em banco próprio otimizado" é **menos do que parece**: a otimização real é `--resume` + prompt cache (o painel **já tem isso**). O banco próprio só persiste histórico; fatos/resumos/RAG são **dead code** (nunca chamados; não há pgvector funcional).
- O **orchestrator** do legado (projetos, gates, custo 5h, time de 15) **já aponta pro mesmo Supabase do painel** — ou seja, o painel **é** essa camada. Não há o que portar aí.
- O que falta portar é o **motor conversacional do `server.js`** pra ponte do painel. O Telegram herda automático.

## Matriz de portabilidade

| Feature do legado | O que é | Painel hoje | Telegram (adapter novo) | Ação |
|---|---|---|---|---|
| **Memória `--resume` + prompt cache** | sessão claude viva por conversa | ✅ tem | ✅ herda | — |
| **Histórico em banco** | persistência de mensagens | ✅ Supabase | ✅ | — (legado não é superior) |
| **RAG / fatos / embeddings** | memória semântica | ❌ | ❌ | **oportunidade** (legado tb não tem — só roadmap) |
| **Paralelismo** (lanes + semáforo 3 + bg sessions) | rodar 2+ coisas ao mesmo tempo | ❌ **serial** | ❌ | **PORTAR — Fase 1** |
| `/bg` `/fila` `/sessoes` `/parar` | controle das raias paralelas | ❌ | ❌ | vem junto (Fase 1) |
| **Cortex Brain** (trivial/médio/complexo/máximo → haiku/sonnet/opus) | escolhe modelo por complexidade | ⚠️ manual | ❌ | **PORTAR — Fase 2** |
| **Quick-ack** ("tô no caso" em haiku) | feedback antes da resposta cara | ❌ | ❌ | Fase 2 |
| Comandos `/opus /effort /reset /modelo` | controle por mensagem | ❌ | ❌ | Fase 2 |
| `@colaborador` (mention → subagent) | falar direto com 1 dos 15 | parcial | ❌ | Fase 2 |
| **Voz** (TTS ElevenLabs→OpenAI fallback; Whisper in) | áudio in/out | ❌ | ⏳ estruturado | **Fase 3** |
| **Proatividade** (briefing 8h + alertas 9/13/17h) | mensagem proativa | ❌ (mas tem **rotinas**) | ❌ | Fase 4 — talvez via rotina, não código |
| Anexo imagem (vision via Read) | foto → análise | ✅ | ❌ no adapter | Fase 5 |
| Anexo PDF / arquivo | documento → contexto | ❌ (gap no legado tb) | ❌ | oportunidade |
| Orchestrator (projetos/gates/custo/time) | autonomia do time | ✅ **é o painel** | — | já existe |
| `/metrics/server`, `/health` | infra/observabilidade | parcial | — | opcional |

## Detalhe técnico do que portar

### Fase 1 — Paralelismo (o que você pediu)
Do `server.js`:
- **Mutex por raia** (`_laneTails`, server.js:493-506): cauda de Promise por `laneKey`. `main:<conv>` serializa o `--resume` de uma conversa; lanes diferentes correm juntas.
- **Semáforo global** (`_acquireSlot/_releaseSlot`, server.js:480-491): `MAX_CONCURRENCY=3` processos claude simultâneos.
- **Background sessions** (server.js:1023-1071): `spawnBackgroundSession` → avisa "🧵 sessão paralela s1", roda fire-and-forget (laneKey `bg:<id>`, sem `--resume`, timeout 15min), entrega "✅ concluída" ao fechar. `killBackgroundSession` (SIGTERM).
- **Roteamento** (`routeJob`, server.js:1176-1207): `asBg = busy && tier !== 'trivial'`. Raia ocupada + demanda real → forka; só trivial fica na fila. Override `/bg` força paralelo, `/fila` força fila. Aceita `\` além de `/`.

> Na ponte do painel isso troca o `for…await processMessage` serial por: serialização por `session_id` + semáforo + linhas `bg_session` no Supabase (status running/done/killed pra sobreviver a restart, que o legado não faz — é in-memory).

### Fase 2 — Cortex Brain + quick-ack + comandos
- **Heurística** (server.js:538-564): regex puro, zero custo. trivial(≤12ch)→haiku; estratégia/arquitetura ou >900ch→opus·max; análise/código/sql ou >400ch→opus; default→sonnet. `--effort` só em opus/fable.
- **Quick-ack** (server.js:566-625): haiku gera "tô no caso" contextual antes da resposta real (timeout 12s, fallback estático).
- **Comandos** (server.js:674-717): `/opus /sonnet /haiku /fable`, `/auto`, `/effort <n>`, `/reset`, `/modelo`, `@colaborador`. Prefs em arquivo por conversa.

### Fase 3 — Voz
- **TTS** (server.js:186-252): ElevenLabs (`eleven_multilingual_v2`, voice settings) com **fallback automático** OpenAI (`gpt-4o-mini-tts`, onyx) em qualquer falha/cota.
- **Regra** (server.js:941-956): sempre texto; **+áudio se a entrada foi áudio**. (= exatamente o que você pediu no Telegram.)
- **Whisper** in: WhatsApp transcreve no n8n; Telegram no próprio adapter.

### Fase 4 — Proatividade
- `proactive.js`: `setInterval` 60s checa relógio. Briefing 8h (snapshot do time pré-computado em SQL + skills: agenda/email/Asaas/coolify/dólar). Alertas 9/13/17h (só fala se há desvio; senão `SEM_ALERTA` → silêncio).
- **Decisão:** o painel já tem **rotinas (demandas recorrentes)**. Briefing pode virar uma rotina que dispara o agente, em vez de reimplementar o `setInterval`. Avaliar.

## Achados de segurança (corrigir ao portar)
1. **`bypassPermissions` global no `/spawn` sem `allowedTools`** (server.js:351): WhatsApp/Telegram → Claude com toolset completo + bypass. Só o orchestrator confina (Task bloqueado). Ao portar, aplicar confinamento no caminho conversacional.
2. **`/health` sem auth** expõe `bg_sessions` (títulos = trechos das suas mensagens) e infra.
3. **Fila in-memory** (server.js:90): jobs perdidos se o daemon cai. A ponte do painel deve enfileirar durável no Supabase.

## Mitos desfeitos (memória)
- `memory_facts` + `saveFact()` + `closeConversation(summary)` existem mas **nunca são chamados** — extração de fatos e resumo de conversa são dead code.
- **Sem RAG/pgvector**: "pgvector" só aparece em comentário e log; nenhuma coluna vetorial, nenhuma query de similaridade. É item de `ROADMAP.md`.
- `tokens_used`/`model` na tabela `messages` sempre NULL.
- Janela de memória efetiva: **16 turns** fixos; o resto fica no banco sem ser relido.

→ Conclusão: pra "memória otimizada", o painel (Supabase + `--resume`) já está **par ou à frente**. A oportunidade real (que nenhum dos dois tem) é RAG/fatos — fica como melhoria futura, não portabilidade.
