/**
 * Fase 3 — exporter no formato de exposição Prometheus (text/plain 0.0.4).
 *
 * Reusa o registry in-memory de metrics.ts (os buckets já são cumulativos,
 * mesma semântica do `le` do Prometheus). Grafana lê via Prometheus scrape
 * em GET /cortex/metrics/prometheus.
 */

import { snapshot } from './metrics.js';

function parseKey(key: string): { name: string; labels: string } {
  const brace = key.indexOf('{');
  if (brace === -1) return { name: key, labels: '' };
  const name = key.slice(0, brace);
  const raw = key.slice(brace + 1, -1);
  const labels = raw
    .split(',')
    .map((pair) => {
      const eq = pair.indexOf('=');
      const k = pair.slice(0, eq);
      const v = pair.slice(eq + 1).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
      return `${k}="${v}"`;
    })
    .join(',');
  return { name, labels };
}

function withLabels(labels: string, extra?: string): string {
  const parts = [labels, extra].filter(Boolean).join(',');
  return parts ? `{${parts}}` : '';
}

export function renderPrometheus(): string {
  const snap = snapshot();
  const lines: string[] = [];
  const typed = new Set<string>();

  for (const [key, value] of Object.entries(snap.counters)) {
    const { name, labels } = parseKey(key);
    if (!typed.has(name)) {
      lines.push(`# TYPE ${name} counter`);
      typed.add(name);
    }
    lines.push(`${name}${withLabels(labels)} ${value}`);
  }

  for (const [key, h] of Object.entries(snap.histograms)) {
    const { name, labels } = parseKey(key);
    if (!typed.has(name)) {
      lines.push(`# TYPE ${name} histogram`);
      typed.add(name);
    }
    const bounds = Object.keys(h.buckets)
      .map((b) => Number(b.slice(2)))
      .sort((a, b) => a - b);
    for (const bound of bounds) {
      lines.push(
        `${name}_bucket${withLabels(labels, `le="${bound}"`)} ${h.buckets[`<=${bound}`] ?? 0}`,
      );
    }
    lines.push(`${name}_bucket${withLabels(labels, 'le="+Inf"')} ${h.count}`);
    lines.push(`${name}_sum${withLabels(labels)} ${h.sum}`);
    lines.push(`${name}_count${withLabels(labels)} ${h.count}`);
  }

  lines.push('# TYPE cortex_uptime_seconds gauge');
  lines.push(`cortex_uptime_seconds ${snap.uptime_seconds}`);

  return lines.join('\n') + '\n';
}
