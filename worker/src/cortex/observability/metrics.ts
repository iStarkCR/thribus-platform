/**
 * Observability — métricas in-memory + endpoint /cortex/metrics.
 *
 * Fase 2: contadores e histogramas simples em memória.
 * Fase 3: OpenTelemetry exporter pra Prometheus/Grafana.
 *
 * Não substitui o audit log (que é por-request, no DB). Aqui é só agregado
 * pra dashboards e alertas rápidos.
 */

interface Counter {
  value: number;
}

interface Histogram {
  count: number;
  sum: number;
  min: number;
  max: number;
  buckets: Record<string, number>;
}

const counters = new Map<string, Counter>();
const histograms = new Map<string, Histogram>();

const HISTOGRAM_BUCKETS_MS = [50, 100, 250, 500, 1000, 2500, 5000, 10000];
const HISTOGRAM_BUCKETS_COST = [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1];

function counterKey(name: string, labels?: Record<string, string>): string {
  if (!labels) return name;
  const parts = Object.entries(labels)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join(',');
  return `${name}{${parts}}`;
}

export function incrementCounter(
  name: string,
  labels?: Record<string, string>,
  value = 1,
): void {
  const key = counterKey(name, labels);
  let c = counters.get(key);
  if (!c) {
    c = { value: 0 };
    counters.set(key, c);
  }
  c.value += value;
}

export function recordHistogram(
  name: string,
  value: number,
  bucketSet: number[] = HISTOGRAM_BUCKETS_MS,
  labels?: Record<string, string>,
): void {
  const key = counterKey(name, labels);
  let h = histograms.get(key);
  if (!h) {
    h = {
      count: 0,
      sum: 0,
      min: value,
      max: value,
      buckets: Object.fromEntries(bucketSet.map((b) => [`<=${b}`, 0])),
    };
    histograms.set(key, h);
  }
  h.count += 1;
  h.sum += value;
  if (value < h.min) h.min = value;
  if (value > h.max) h.max = value;
  for (const b of bucketSet) {
    if (value <= b) {
      h.buckets[`<=${b}`] = (h.buckets[`<=${b}`] ?? 0) + 1;
    }
  }
}

export function recordLatency(value: number, labels?: Record<string, string>): void {
  recordHistogram('cortex_request_latency_ms', value, HISTOGRAM_BUCKETS_MS, labels);
}

export function recordCost(value: number, labels?: Record<string, string>): void {
  recordHistogram('cortex_request_cost_usd', value, HISTOGRAM_BUCKETS_COST, labels);
}

export interface MetricsSnapshot {
  counters: Record<string, number>;
  histograms: Record<
    string,
    {
      count: number;
      sum: number;
      avg: number;
      min: number;
      max: number;
      buckets: Record<string, number>;
    }
  >;
  uptime_seconds: number;
  ts: string;
}

const startTime = Date.now();

export function snapshot(): MetricsSnapshot {
  const c: Record<string, number> = {};
  for (const [k, v] of counters) c[k] = v.value;

  const h: MetricsSnapshot['histograms'] = {};
  for (const [k, v] of histograms) {
    h[k] = {
      count: v.count,
      sum: v.sum,
      avg: v.count > 0 ? v.sum / v.count : 0,
      min: v.min,
      max: v.max,
      buckets: v.buckets,
    };
  }

  return {
    counters: c,
    histograms: h,
    uptime_seconds: Math.floor((Date.now() - startTime) / 1000),
    ts: new Date().toISOString(),
  };
}

export function resetMetrics(): void {
  counters.clear();
  histograms.clear();
}
