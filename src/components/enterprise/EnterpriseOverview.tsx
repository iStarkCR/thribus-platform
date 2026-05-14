import { useEffect, useState } from 'react';
import {
  FileSignature,
  FileText,
  MessageSquare,
  BarChart3,
  Loader2,
  AlertCircle,
  CheckCircle2,
  Sparkles,
  Hourglass,
} from 'lucide-react';
import { clsx } from 'clsx';
import { cortexEnterprise, type CortexModule } from '@/services/cortexEnterprise';

const ICON_MAP: Record<string, typeof FileSignature> = {
  FileSignature,
  FileText,
  MessageSquare,
  BarChart3,
};

const STATUS_LABEL: Record<string, string> = {
  stable: 'estável',
  beta: 'beta',
  preview: 'preview',
  'coming-soon': 'em breve',
};

const STATUS_CLASS: Record<string, string> = {
  stable: 'bg-emerald-500/10 text-emerald-300',
  beta: 'bg-brand/10 text-brand-bright',
  preview: 'bg-amber-500/10 text-amber-200',
  'coming-soon': 'bg-surface-3 text-creme-faint',
};

export function EnterpriseOverview() {
  const [modules, setModules] = useState<CortexModule[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void (async () => {
      try {
        const list = await cortexEnterprise.listModules();
        setModules(list);
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-default bg-gradient-to-br from-brand/10 via-surface-1 to-surface-1 px-6 py-5">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-brand text-bg flex items-center justify-center shrink-0">
            <Sparkles size={20} />
          </div>
          <div>
            <h2 className="text-lg font-extrabold text-creme">Stack de valor Enterprise</h2>
            <p className="text-[13.5px] text-creme-mute mt-1 max-w-2xl leading-relaxed">
              Inteligência (Cortex Brain) + Execução (colaboradores digitais) + Operação (módulos
              SaaS) + Dados (Thribus BI), com uma única plataforma, billing e curva de aprendizado.
            </p>
          </div>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/5 px-4 py-3 text-[13.5px] text-red-200 flex items-start gap-2">
          <AlertCircle size={16} className="shrink-0 mt-0.5" />
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {loading && (
          <div className="col-span-2 text-center py-8">
            <Loader2 size={18} className="mx-auto text-creme-mute animate-spin" />
          </div>
        )}
        {modules.map((m) => {
          const Icon = ICON_MAP[m.icon] ?? FileText;
          return (
            <div
              key={m.id}
              className="rounded-xl border border-default bg-surface-1 p-5 hover:border-hover transition-colors"
            >
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-lg bg-brand/10 text-brand-bright flex items-center justify-center shrink-0">
                  <Icon size={18} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="text-[15px] font-extrabold text-creme">{m.name}</h3>
                    <span
                      className={clsx(
                        'text-[10.5px] font-bold uppercase px-1.5 py-0.5 rounded',
                        STATUS_CLASS[m.status] ?? 'bg-surface-3 text-creme-mute',
                      )}
                    >
                      {STATUS_LABEL[m.status] ?? m.status}
                    </span>
                    <span className="text-[10.5px] font-mono text-creme-faint">v{m.version}</span>
                  </div>
                  <p className="text-[13px] text-creme-mute mt-1.5 leading-relaxed">
                    {m.description}
                  </p>
                  <div className="flex flex-wrap gap-1 mt-3">
                    {m.tags.map((t) => (
                      <span
                        key={t}
                        className="text-[11px] px-1.5 py-0.5 rounded bg-surface-3 text-creme-faint"
                      >
                        {t}
                      </span>
                    ))}
                  </div>
                  <div className="mt-3 flex items-center gap-2 text-[11.5px]">
                    {m.has_runtime ? (
                      <span className="text-emerald-300 font-bold flex items-center gap-1">
                        <CheckCircle2 size={12} />
                        Runtime ativo
                      </span>
                    ) : (
                      <span className="text-amber-200 font-bold flex items-center gap-1">
                        <Hourglass size={12} />
                        Em desenvolvimento
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
