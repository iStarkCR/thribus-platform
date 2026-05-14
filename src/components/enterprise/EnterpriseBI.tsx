import { BarChart3, Brain, Database, LineChart, PieChart, Sparkles, Hourglass } from 'lucide-react';

export function EnterpriseBI() {
  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 px-5 py-4 flex items-center gap-3">
        <Hourglass size={20} className="text-amber-200 shrink-0" />
        <div>
          <div className="text-[14px] font-bold text-amber-100">Thribus BI — Em breve</div>
          <p className="text-[12.5px] text-amber-200/80 mt-0.5">
            Schema reservado em <code className="font-mono">cortex_bi_dashboards</code>. Desenvolvimento
            programado para o próximo ciclo.
          </p>
        </div>
      </div>

      <div className="rounded-xl border border-default bg-surface-1 p-6">
        <div className="flex items-start gap-3 mb-5">
          <div className="w-10 h-10 rounded-xl bg-brand/10 text-brand-bright flex items-center justify-center">
            <BarChart3 size={20} />
          </div>
          <div>
            <h2 className="text-lg font-extrabold text-creme">BI gerado por IA</h2>
            <p className="text-[13.5px] text-creme-mute mt-1 max-w-2xl leading-relaxed">
              Dashboards customizáveis com widgets de queries SQL/RAG. O Brain pode propor
              dashboards baseado nas perguntas que o time faz mais — auto-discovery de KPIs.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Feature icon={PieChart} title="Widgets" desc="Pie, bar, line, table, KPI" />
          <Feature icon={Database} title="Queries SQL" desc="Direto no DB do tenant" />
          <Feature icon={Sparkles} title="Insights IA" desc="Resumos automáticos" />
          <Feature icon={LineChart} title="Tempo real" desc="Refresh configurável" />
        </div>
      </div>

      <div className="rounded-xl border border-default bg-surface-1 p-5">
        <div className="flex items-center gap-2 mb-3">
          <Brain size={16} className="text-brand-bright" />
          <h3 className="text-[14px] font-bold text-creme">Integração com Cortex Brain</h3>
        </div>
        <p className="text-[13px] text-creme-mute leading-relaxed">
          O Brain alimentará o BI com dois dados únicos: (1) <strong>uso de agentes</strong>{' '}
          (latência, custo, conversões por agente/intent) e (2) <strong>insights consolidados</strong>{' '}
          das memórias longas (padrões de comportamento de clientes, top objeções, riscos).
          Nenhuma outra ferramenta de BI tem acesso a isso.
        </p>
      </div>
    </div>
  );
}

function Feature({
  icon: Icon,
  title,
  desc,
}: {
  icon: typeof BarChart3;
  title: string;
  desc: string;
}) {
  return (
    <div className="rounded-lg border border-default bg-surface-2 p-3.5">
      <Icon size={16} className="text-brand-bright mb-2" />
      <div className="text-[13px] font-bold text-creme">{title}</div>
      <div className="text-[11.5px] text-creme-mute mt-0.5">{desc}</div>
    </div>
  );
}
