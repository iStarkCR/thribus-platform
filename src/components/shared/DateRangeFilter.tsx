import { CalendarRange } from 'lucide-react';
import { resolveRange, RANGE_OPTIONS, type RangeKey, type DateRange } from '@/lib/dateRanges';

interface Props {
  value: RangeKey;
  onChange: (key: RangeKey, range: DateRange) => void;
  /** Mostra o range resolvido (from–to) abaixo do select. Default: false. */
  showResolved?: boolean;
}

const LABELS: Record<RangeKey, string> = {
  today: 'Hoje',
  '7d': 'Últimos 7 dias',
  '30d': 'Últimos 30 dias',
  currentMonth: 'Mês atual',
  lastMonth: 'Mês passado',
  '3m': 'Últimos 3 meses',
  '12m': 'Últimos 12 meses',
  all: 'Todo período',
};

/**
 * Filtro temporal compartilhado entre Dashboard e MetricsPage.
 * Cobre os ranges mais comuns (hoje/7d/30d/mês atual/passado/3m/12m/all).
 *
 * Date picker custom (range arbitrário) fica pra próxima iteração — os 8
 * presets cobrem 95% dos casos de gerência operacional.
 */
export function DateRangeFilter({ value, onChange, showResolved = false }: Props) {
  const range = resolveRange(value);

  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const key = e.target.value as RangeKey;
    onChange(key, resolveRange(key));
  };

  return (
    <div className="inline-flex flex-col gap-1">
      <div className="inline-flex items-center gap-2 bg-surface-2 border border-default rounded-lg pl-3 pr-1 py-1.5 hover:border-hover transition-colors">
        <CalendarRange size={13} className="text-creme-mute shrink-0" />
        <select
          value={value}
          onChange={handleChange}
          className="bg-transparent text-[12.5px] font-semibold text-creme focus:outline-none cursor-pointer pr-2"
        >
          {RANGE_OPTIONS.map((k) => (
            <option key={k} value={k}>
              {LABELS[k]}
            </option>
          ))}
        </select>
      </div>
      {showResolved && (
        <div className="text-[11px] text-creme-faint font-mono pl-2">
          {range.from.toLocaleDateString('pt-BR')}
          {range.to ? ` → ${range.to.toLocaleDateString('pt-BR')}` : ' → agora'}
        </div>
      )}
    </div>
  );
}
