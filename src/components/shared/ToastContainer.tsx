import { Check, AlertTriangle, X, Activity } from 'lucide-react';
import { useAppStore } from '@/hooks/useAppStore';

const ICON_MAP = {
  green: Check,
  amber: AlertTriangle,
  red: X,
  blue: Activity,
};

const COLOR_MAP = {
  green: 'text-semantic-green border-l-semantic-green',
  amber: 'text-semantic-amber border-l-semantic-amber',
  red: 'text-semantic-red border-l-semantic-red',
  blue: 'text-semantic-blue border-l-semantic-blue',
};

export function ToastContainer() {
  const toasts = useAppStore((s) => s.toasts);

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-5 right-5 z-[999] flex flex-col gap-2">
      {toasts.map((t) => {
        const Icon = ICON_MAP[t.type];
        return (
          <div
            key={t.id}
            className={`bg-surface-1 border border-hover border-l-2 ${COLOR_MAP[t.type]} rounded-lg px-4 py-3 flex items-center gap-2.5 text-xs font-medium text-creme min-w-[240px] shadow-[0_8px_32px_rgba(0,0,0,0.4)] animate-toast-in`}
          >
            <Icon size={14} className={COLOR_MAP[t.type].split(' ')[0]} />
            {t.message}
          </div>
        );
      })}
    </div>
  );
}
