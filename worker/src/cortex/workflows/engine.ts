/**
 * Cortex M1 — Workflow Engine.
 *
 * Workflow = trigger + steps (chain). Triggers: webhook, event, schedule, manual.
 * Steps: notify, http_call, agent_call, condition, set_variable, wait_approval, delay.
 *
 * Cada run grava state em cortex_workflow_runs com log por step. Suporta
 * pause/resume (wait_approval pausa até aprovação).
 *
 * Não usa libs externas — engine caseiro pra max controle.
 */

import { supabase } from '../../db/supabase.js';
import { createLogger } from '../observability/logger.js';
import { notify } from '../notifications/service.js';
import { emit } from '../webhooks/outgoing.js';

const logger = createLogger('cortex.workflows');

export type StepType =
  | 'notify'
  | 'http_call'
  | 'agent_call'
  | 'condition'
  | 'set_variable'
  | 'wait_approval'
  | 'emit_webhook'
  | 'delay';

export interface WorkflowStep {
  id: string;
  type: StepType;
  config: Record<string, unknown>;
  on_failure?: 'continue' | 'abort';
}

export interface WorkflowDef {
  id: string;
  tenant_id: string;
  name: string;
  description?: string | null;
  trigger_type: 'webhook' | 'event' | 'schedule' | 'manual';
  trigger_config: Record<string, unknown>;
  steps: WorkflowStep[];
  enabled: boolean;
}

interface RunContext {
  runId: number;
  workflowId: string;
  tenantId: string;
  vars: Record<string, unknown>;
  stepsLog: Array<{ stepId: string; status: string; output?: unknown; error?: string; ts: string }>;
}

/** Substitui {{var.path}} em strings com valor do context.vars */
function interpolate(value: unknown, ctx: RunContext): unknown {
  if (typeof value === 'string') {
    return value.replace(/\{\{([^}]+)\}\}/g, (_, path: string) => {
      const parts = path.trim().split('.');
      let v: unknown = ctx.vars;
      for (const p of parts) {
        if (v && typeof v === 'object' && p in v) v = (v as Record<string, unknown>)[p];
        else return '';
      }
      return String(v ?? '');
    });
  }
  if (Array.isArray(value)) return value.map((v) => interpolate(v, ctx));
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = interpolate(v, ctx);
    }
    return out;
  }
  return value;
}

async function runStep(step: WorkflowStep, ctx: RunContext): Promise<{ ok: boolean; output?: unknown; pause?: boolean }> {
  const config = interpolate(step.config, ctx) as Record<string, unknown>;

  switch (step.type) {
    case 'notify': {
      const r = await notify({
        tenantId: ctx.tenantId,
        channel: (config.channel as 'email' | 'slack' | 'in_app') ?? 'in_app',
        destination: config.destination as string | undefined,
        userId: config.user_id as string | undefined,
        title: String(config.title ?? 'Workflow notification'),
        body: config.body as string | undefined,
        category: 'workflow',
        source: `workflow:${ctx.workflowId}`,
      });
      return { ok: r.ok, output: { notification_id: r.id } };
    }

    case 'http_call': {
      const url = String(config.url ?? '');
      const method = String(config.method ?? 'GET').toUpperCase();
      const headers = (config.headers as Record<string, string>) ?? {};
      const body = config.body;
      try {
        const resp = await fetch(url, {
          method,
          headers: { 'Content-Type': 'application/json', ...headers },
          body: body ? JSON.stringify(body) : undefined,
        });
        const data = await resp.json().catch(() => null);
        return { ok: resp.ok, output: { status: resp.status, body: data } };
      } catch (err) {
        return { ok: false, output: { error: (err as Error).message } };
      }
    }

    case 'set_variable': {
      const key = String(config.key ?? '');
      if (!key) return { ok: false };
      ctx.vars[key] = config.value;
      return { ok: true, output: { [key]: config.value } };
    }

    case 'condition': {
      // config: { left, op (==, !=, >, <, contains), right, true_step, false_step }
      const left = config.left;
      const right = config.right;
      const op = String(config.op ?? '==');
      let result = false;
      switch (op) {
        case '==':
          result = left === right;
          break;
        case '!=':
          result = left !== right;
          break;
        case '>':
          result = Number(left) > Number(right);
          break;
        case '<':
          result = Number(left) < Number(right);
          break;
        case 'contains':
          result = String(left).includes(String(right));
          break;
      }
      return { ok: true, output: { result } };
    }

    case 'wait_approval': {
      // Cria approval e pausa workflow
      if (!supabase) return { ok: false };
      const { data } = await supabase
        .from('cortex_approvals')
        .insert({
          tenant_id: ctx.tenantId,
          source: `workflow:${ctx.workflowId}`,
          action_type: String(config.action_type ?? 'workflow_step'),
          action_payload: config.payload ?? {},
          risk_level: Number(config.risk_level ?? 2),
          context: String(config.context ?? 'Aprovação solicitada por workflow'),
          status: 'pending',
          resume_workflow_run: ctx.runId,
        })
        .select('id')
        .maybeSingle();
      return { ok: true, pause: true, output: { approval_id: data?.id } };
    }

    case 'delay': {
      const ms = Number(config.ms ?? 1000);
      await new Promise((r) => setTimeout(r, Math.min(ms, 60_000)));
      return { ok: true };
    }

    case 'emit_webhook': {
      await emit({
        type: String(config.event ?? 'workflow.custom'),
        tenantId: ctx.tenantId,
        data: (config.data as Record<string, unknown>) ?? {},
      });
      return { ok: true };
    }

    case 'agent_call':
      // Stub — chamar /cortex/analyze internamente. Por ora retorna placeholder.
      return { ok: true, output: { stub: 'agent_call not yet wired in v1' } };

    default:
      return { ok: false, output: { error: 'unknown step type' } };
  }
}

export async function runWorkflow(
  workflow: WorkflowDef,
  triggerPayload: Record<string, unknown>,
): Promise<{ runId: number; status: string }> {
  if (!supabase) throw new Error('supabase not configured');

  const { data: run } = await supabase
    .from('cortex_workflow_runs')
    .insert({
      workflow_id: workflow.id,
      tenant_id: workflow.tenant_id,
      trigger_payload: triggerPayload,
      status: 'running',
      current_step: 0,
      context: { trigger: triggerPayload, ...triggerPayload },
      steps_log: [],
    })
    .select('id')
    .maybeSingle();

  if (!run) throw new Error('failed to create run');
  const runId = run.id as number;

  const ctx: RunContext = {
    runId,
    workflowId: workflow.id,
    tenantId: workflow.tenant_id,
    vars: { trigger: triggerPayload, ...triggerPayload },
    stepsLog: [],
  };

  for (let i = 0; i < workflow.steps.length; i++) {
    const step = workflow.steps[i];
    const ts = new Date().toISOString();
    try {
      const result = await runStep(step, ctx);
      ctx.stepsLog.push({
        stepId: step.id,
        status: result.ok ? 'success' : 'failed',
        output: result.output,
        ts,
      });
      if (result.pause) {
        await supabase
          .from('cortex_workflow_runs')
          .update({
            status: 'paused',
            current_step: i + 1,
            steps_log: ctx.stepsLog,
            context: ctx.vars,
          })
          .eq('id', runId);
        return { runId, status: 'paused' };
      }
      if (!result.ok && step.on_failure !== 'continue') {
        await supabase
          .from('cortex_workflow_runs')
          .update({
            status: 'failed',
            current_step: i,
            steps_log: ctx.stepsLog,
            error: 'step_failed',
            completed_at: new Date().toISOString(),
          })
          .eq('id', runId);
        logger.warn('workflow failed', { workflowId: workflow.id, runId, stepId: step.id });
        return { runId, status: 'failed' };
      }
    } catch (err) {
      const msg = (err as Error).message;
      ctx.stepsLog.push({ stepId: step.id, status: 'error', error: msg, ts });
      if (step.on_failure !== 'continue') {
        await supabase
          .from('cortex_workflow_runs')
          .update({
            status: 'failed',
            current_step: i,
            steps_log: ctx.stepsLog,
            error: msg,
            completed_at: new Date().toISOString(),
          })
          .eq('id', runId);
        return { runId, status: 'failed' };
      }
    }
  }

  await supabase
    .from('cortex_workflow_runs')
    .update({
      status: 'completed',
      current_step: workflow.steps.length,
      steps_log: ctx.stepsLog,
      context: ctx.vars,
      completed_at: new Date().toISOString(),
    })
    .eq('id', runId);

  return { runId, status: 'completed' };
}

/** Resume workflow pausado (após approval). */
export async function resumeWorkflow(runId: number, _approvalOutcome: 'approved' | 'rejected'): Promise<void> {
  if (!supabase) return;
  const { data: run } = await supabase
    .from('cortex_workflow_runs')
    .select('*, cortex_workflows(*)')
    .eq('id', runId)
    .maybeSingle();
  if (!run || run.status !== 'paused') return;

  // Continua a partir do current_step. Implementação completa pendente.
  // V1: marca como completed se approved, failed se rejected
  const newStatus = _approvalOutcome === 'approved' ? 'completed' : 'failed';
  await supabase
    .from('cortex_workflow_runs')
    .update({ status: newStatus, completed_at: new Date().toISOString() })
    .eq('id', runId);
}
