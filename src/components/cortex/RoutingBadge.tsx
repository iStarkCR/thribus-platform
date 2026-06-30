/**
 * Badge de roteamento por resposta — quando o Cortex Brain está em modo AUTO, a
 * ponte grava em cortex_usage o tier/reason que o router escolheu. Aqui mostramos
 * isso embaixo da resposta: "roteado: opus · high — sinal pesado".
 *
 * Em modo manual (modelo fixo) não há roteamento → tier vem nulo → não renderiza.
 */
import { Route } from 'lucide-react';
import type { RoutingInfo } from '@/services/cortexBrain';

const effortApplies = (m: string) => /opus|fable/.test(m);

export function RoutingBadge({ info }: { info?: RoutingInfo }) {
  if (!info || !info.tier) return null;
  const effort = info.effort && effortApplies(info.model) ? ` · ${info.effort}` : '';
  return (
    <div className="mt-1 inline-flex items-center gap-1 text-[10.5px] text-creme-faint">
      <Route size={10} className="text-brand-bright/70 shrink-0" />
      <span>
        roteado: <span className="font-semibold text-creme-mute">{info.model}{effort}</span>
        {info.reason ? <> — {info.reason}</> : null}
      </span>
    </div>
  );
}
