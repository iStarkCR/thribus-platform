# Thribus Worker

Backend do loop agêntico dos Colaboradores Digitais.

## Stack

- **Node.js + TypeScript** (ESM)
- **Express** — webhook receiver
- **Anthropic SDK** — Claude API com prompt caching
- **Postgres** — Supabase (schema em `db/schema.sql`)

## Estrutura

```
worker/
├── src/
│   ├── index.ts           # Entry point (Express + worker)
│   ├── queue/
│   │   └── index.ts       # Fila in-memory (swap por BullMQ em prod)
│   ├── agent/
│   │   └── loop.ts        # Agent loop principal ← core do sistema
│   ├── tools/
│   │   └── dispatcher.ts  # Executor HTTP dinâmico de tools
│   ├── claude/
│   │   └── client.ts      # Anthropic SDK com prompt caching
│   ├── talki/
│   │   ├── webhook.ts     # Receiver + HMAC + dedup
│   │   └── client.ts      # Talki/Chatwoot API client
│   └── db/
│       └── index.ts       # DB layer (stubs com TODO → Postgres real)
└── db/
    └── schema.sql         # DDL completo para Supabase
```

## Fluxo

```
POST /webhook/talki
  → verifica HMAC
  → 200 OK  (imediato — Talki não espera)
  → enqueue(job)
       ↓ (async)
  runAgentLoop(job)
    → carrega agent + tools do DB
    → busca histórico da conversa
    → while (iter < MAX_TOOL_ITERATIONS):
        → callClaude (com prompt caching)
        → tool_use? → executeTool (HTTP) → append tool_result
        → escalar_humano? → assignToHuman → break
        → text? → sendMessage (Talki) → break
    → persiste execution (painel)
```

## Setup

```bash
cd worker
cp .env.example .env
# preencha ANTHROPIC_API_KEY, DATABASE_URL, TALKI_API_URL, TALKI_API_TOKEN

npm install
npm run dev          # tsx watch (hot reload)
```

## Conectar ao Postgres

1. Crie o schema no Supabase: copie `db/schema.sql` no SQL Editor
2. Defina `DATABASE_URL` no `.env`
3. Em `src/db/index.ts`, descomente o pool e troque cada `// TODO:` pelo query real

## Migrar a fila para BullMQ (recomendado em produção)

```bash
npm i bullmq ioredis
```

Em `src/queue/index.ts`, substitua o array em memória:

```ts
import { Queue, Worker } from 'bullmq';

const queue = new Queue('agent-jobs', { connection: { host: 'localhost' } });
const worker = new Worker('agent-jobs', async (job) => runAgentLoop(job.data), { concurrency: 5 });

export const enqueue = (job: AgentJob) => queue.add('run', job);
export const startWorker = () => {}; // BullMQ já sobe no construtor
```

## Variáveis de ambiente

| Var | Descrição |
|-----|-----------|
| `PORT` | Porta HTTP (default: 3200) |
| `ANTHROPIC_API_KEY` | Chave da API Anthropic |
| `DATABASE_URL` | Connection string Postgres |
| `TALKI_API_URL` | URL base do Talki/Chatwoot |
| `TALKI_API_TOKEN` | Token de API |
| `TALKI_WEBHOOK_SECRET` | Secret para validar HMAC |
| `MAX_TOOL_ITERATIONS` | Limite de iterações por turno (default: 10) |
| `TOOL_TIMEOUT_MS` | Timeout por tool (default: 15000) |
| `MAX_CONCURRENCY` | Jobs paralelos (default: 5) |

## Deploy

**Fly.io** (recomendado para começar):

```bash
fly launch --name thribus-worker
fly secrets set ANTHROPIC_API_KEY=... TALKI_API_TOKEN=... ...
fly deploy
```

**Railway**: conecte o repositório e configure as env vars no painel.
