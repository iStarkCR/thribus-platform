import { useEffect, useState } from 'react';
import { X } from 'lucide-react';

/** Shell de diálogo no padrão do sistema (substitui window.prompt/confirm). */
function Shell({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 bg-black/55 backdrop-blur-sm flex items-center justify-center z-[70] p-4" onClick={onClose}>
      <div className="bg-surface-1 border border-default rounded-2xl w-full max-w-sm shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-default">
          <h3 className="text-[15px] font-bold text-creme">{title}</h3>
          <button onClick={onClose} className="text-creme-faint hover:text-creme"><X size={17} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function PromptDialog({
  title,
  label,
  placeholder,
  initial = '',
  confirmLabel = 'Criar',
  onConfirm,
  onClose,
}: {
  title: string;
  label?: string;
  placeholder?: string;
  initial?: string;
  confirmLabel?: string;
  onConfirm: (value: string) => void;
  onClose: () => void;
}) {
  const [value, setValue] = useState(initial);
  const submit = () => {
    const v = value.trim();
    if (v) onConfirm(v);
  };
  return (
    <Shell title={title} onClose={onClose}>
      <div className="p-5">
        {label && <label className="text-[11px] font-bold uppercase tracking-wider text-creme-mute mb-1.5 block">{label}</label>}
        <input
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') submit(); }}
          placeholder={placeholder}
          className="w-full px-3.5 py-2.5 rounded-xl bg-surface-2 border border-default text-[14px] text-creme placeholder-creme-faint focus:outline-none focus:border-brand"
        />
        <div className="flex justify-end gap-2 mt-5">
          <button onClick={onClose} className="px-4 py-2 rounded-xl text-[13px] font-semibold text-creme-mute hover:bg-surface-hover transition-colors">Cancelar</button>
          <button onClick={submit} disabled={!value.trim()} className="px-4 py-2 rounded-xl text-[13px] font-semibold bg-brand text-white hover:bg-brand-bright disabled:opacity-40 transition-colors">{confirmLabel}</button>
        </div>
      </div>
    </Shell>
  );
}

export function ConfirmDialog({
  title,
  message,
  confirmLabel = 'Confirmar',
  danger = true,
  onConfirm,
  onClose,
}: {
  title: string;
  message: string;
  confirmLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <Shell title={title} onClose={onClose}>
      <div className="p-5">
        <p className="text-[13.5px] text-creme-mute leading-relaxed">{message}</p>
        <div className="flex justify-end gap-2 mt-5">
          <button onClick={onClose} className="px-4 py-2 rounded-xl text-[13px] font-semibold text-creme-mute hover:bg-surface-hover transition-colors">Cancelar</button>
          <button
            onClick={onConfirm}
            className={`px-4 py-2 rounded-xl text-[13px] font-semibold text-white transition-colors ${danger ? 'bg-semantic-red hover:bg-semantic-red/85' : 'bg-brand hover:bg-brand-bright'}`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </Shell>
  );
}
