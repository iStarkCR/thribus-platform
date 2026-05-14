# @thribus/cortex-sdk

SDK oficial pra integrar com o **Cortex Brain** — cérebro multi-agente B2B da Thribus.

## Instalação

```bash
npm install @thribus/cortex-sdk
```

## Quick start

```typescript
import { CortexClient } from '@thribus/cortex-sdk';

const cortex = new CortexClient({
  baseUrl: 'https://cortex.thribus.com.br',
  apiKey: process.env.CORTEX_API_KEY!,
});

const result = await cortex.analyze({
  sessionId: `customer-${customerId}-${Date.now()}`,
  input: 'Quero saber se tem internet na minha rua',
  entity: {
    type: 'customer',
    id: customerId,
    displayName: 'João Silva',
    attrs: { city: 'São Paulo', plan: 'business' },
  },
  channel: 'whatsapp',
});

console.log(result.reply);              // resposta pro usuário
console.log(result.metrics.agentUsed);  // 'bianca' | 'renata' | 'marcos' | 'carla'
console.log(result.actions);            // ações tomadas/sugeridas
console.log(result.insights);           // observações do Brain
console.log(result.traceId);            // pra correlacionar com audit log
```

## Streaming via SSE

```typescript
for await (const event of cortex.stream({
  sessionId: 'sess-1',
  input: 'Preciso de 2ª via',
})) {
  switch (event.type) {
    case 'analyzer':
      console.log('Brain escolheu:', event.data);
      break;
    case 'insight':
      console.log('Insight:', event.data);
      break;
    case 'agent_start':
      console.log('Agente começou:', event.data);
      break;
    case 'chunk':
      process.stdout.write(event.data.text);
      break;
    case 'done':
      console.log('\nFinalizou:', event.data.metrics);
      break;
    case 'error':
      console.error('Erro:', event.data);
      break;
  }
}
```

## API

### `new CortexClient(options)`

| Option | Tipo | Descrição |
|---|---|---|
| `baseUrl` | string | URL do worker (sem `/cortex` no final) |
| `apiKey` | string | API key do tenant — formato `ck_live_…` ou `ck_test_…` |
| `timeoutMs` | number | Default 30000 |
| `fetch` | typeof fetch | Custom fetch (útil pra testes) |

### Métodos

- `analyze(input)` → Promise<`AnalyzeResult`>
- `stream(input)` → AsyncIterable<`StreamEvent`>
- `listAgents()` → Promise<`CortexAgent[]`>
- `health()` → Promise<...>

### Tipos principais

```typescript
interface AnalyzeInput {
  sessionId: string;
  input: string;
  entity?: { type, id, displayName?, attrs? };
  channel?: string;
  hints?: { forceAgent?: string };
}

interface AnalyzeResult {
  sessionId: string;
  reply: string | null;
  actions: BrainAction[];
  insights: BrainInsight[];
  metrics: { latencyMs, inputTokens, outputTokens, estimatedCostUsd, agentUsed, model };
  traceId: string;
}
```

## Erros

```typescript
import { CortexError } from '@thribus/cortex-sdk';

try {
  await cortex.analyze({...});
} catch (err) {
  if (err instanceof CortexError) {
    console.error(`HTTP ${err.status}: ${err.message}`, err.details);
    if (err.status === 429) {
      // rate limited — retry-after vem em err.details.retry_after_ms
    }
    if (err.status === 402) {
      // cost/message limit excedido
    }
  }
}
```

## Codes

| Status | Significado |
|---|---|
| 200 | OK |
| 400 | Body inválido (sessionId/input obrigatórios) |
| 401 | API key ausente, inválida ou revogada |
| 402 | Limite mensal de mensagens/custo excedido |
| 429 | Rate limit (token bucket — default 60 req/min) |
| 500 | Erro interno (Brain crash, LLM down, etc) |

## Licença

UNLICENSED — uso interno Thribus.
