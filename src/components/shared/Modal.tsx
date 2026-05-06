import { type ReactNode, useEffect } from 'react';
import { X } from 'lucide-react';

interface ModalProps {
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
  onClose: () => void;
  maxWidth?: string;
}

export function Modal({ title, subtitle, children, footer, onClose, maxWidth = '620px' }: ModalProps) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 bg-black/65 backdrop-blur-[10px] z-[200] flex items-center justify-center p-5"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        className="bg-surface-1 border border-hover rounded-2xl w-full overflow-hidden shadow-[0_24px_80px_rgba(0,0,0,0.6)] animate-modal-in"
        style={{ maxWidth, maxHeight: '85vh' }}
      >
        {/* Header */}
        <div className="px-6 pt-5 pb-4 border-b border-default flex items-start justify-between gap-4">
          <div>
            <h2 className="text-base font-extrabold text-creme tracking-tight">{title}</h2>
            {subtitle && <p className="text-[11.5px] text-creme-mute mt-0.5">{subtitle}</p>}
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-md bg-surface-3 border border-default flex items-center justify-center text-creme-mute hover:text-creme hover:bg-surface-4 transition-all shrink-0"
          >
            <X size={14} />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 overflow-y-auto" style={{ maxHeight: 'calc(85vh - 130px)' }}>
          {children}
        </div>

        {/* Footer */}
        {footer && (
          <div className="px-6 py-4 border-t border-default flex items-center justify-end gap-2">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
