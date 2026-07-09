# Observabilidade Cortex — Fase 3 (Prometheus + Grafana)

Stack de dashboard visual de saúde e custo dos agentes do Cortex Brain.
Consome o exporter Prometheus do worker (`GET /cortex/metrics/prometheus`),
que expõe as métricas in-memory da Fase 2 no formato de exposição Prometheus.

## Componentes

| Peça | Onde | O quê |
| --- | --- | --- |
| Exporter | `worker/src/cortex/observability/prometheus.ts` | Converte counters/histogramas pro formato Prometheus |
| Endpoint | `GET /cortex/metrics/prometheus` | Auth: `Bearer $METRICS_SCRAPE_TOKEN` (ou api_key de tenant) |
| Prometheus | este compose | Scrape a cada 30s, retenção 30d |
| Grafana | este compose | Dashboard `Cortex — Saúde e Custo dos Agentes` provisionado |

## Deploy no Coolify

1. **No worker** (app existente): adicionar env var `METRICS_SCRAPE_TOKEN`
   (gerar com `openssl rand -hex 32`) e redeployar.
2. **Novo resource** no Coolify: *Docker Compose*, apontando pra este
   diretório (`infra/observability`) do repo.
3. Env vars do compose:
   - `METRICS_SCRAPE_TOKEN` — o mesmo do passo 1
   - `CORTEX_WORKER_HOST` — host público do worker (ex: `worker.thribustech.com`)
   - `GRAFANA_ADMIN_PASSWORD`
4. Expor o serviço `grafana` (porta 3000) num domínio (ex:
   `grafana.thribustech.com`) via proxy do Coolify.

Se o worker roda na mesma rede Docker do Coolify, dá pra usar o nome do
container em `CORTEX_WORKER_HOST` e trocar `scheme: https` → `http` no
`prometheus/prometheus.yml`.

## Métricas expostas

- `cortex_requests_total{tenant}` / `cortex_request_errors_total{tenant}` — counters
- `cortex_request_latency_ms` — histograma (buckets 50ms–10s)
- `cortex_request_cost_usd` — histograma (buckets $0.001–$1)
- `cortex_consolidations_total{tenant}` — counter
- `cortex_uptime_seconds` — gauge

Nota: as métricas são in-memory — zeram a cada restart do worker. Prometheus
lida bem com isso (counters usam `rate`/`increase`, que detectam reset).
