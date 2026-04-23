import { CheckCircle2, Info, X, XCircle } from 'lucide-react';
import { type ReactNode, useCallback, useMemo, useState } from 'react';

import { type Toast, ToastContext, type ToastTone } from './toast-context';

const AUTO_DISMISS_MS = 6000;

const TONE_STYLES: Record<ToastTone, { icon: typeof Info; accent: string }> = {
  success: { icon: CheckCircle2, accent: 'text-accent' },
  error: { icon: XCircle, accent: 'text-danger' },
  info: { icon: Info, accent: 'text-brand' },
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const dismissToast = useCallback((id: string) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const showToast = useCallback(
    (toast: Omit<Toast, 'id'>) => {
      const id = crypto.randomUUID();
      setToasts((current) => [...current, { ...toast, id }]);
      // Errors stay until dismissed; a failed write is not something to blink past.
      if (toast.tone !== 'error') {
        setTimeout(() => dismissToast(id), AUTO_DISMISS_MS);
      }
    },
    [dismissToast],
  );

  const value = useMemo(() => ({ showToast, dismissToast }), [showToast, dismissToast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      {/* aria-live so screen readers announce toasts that appear without user focus. */}
      <div
        role="status"
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex flex-col items-center gap-2 p-4 sm:items-end"
      >
        {toasts.map((toast) => {
          const { icon: Icon, accent } = TONE_STYLES[toast.tone];
          return (
            <div
              key={toast.id}
              className="pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-lg border border-line bg-surface p-3 shadow-lg"
            >
              <Icon className={`mt-0.5 size-5 shrink-0 ${accent}`} aria-hidden />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">{toast.title}</p>
                {toast.description && <p className="mt-0.5 text-sm text-muted">{toast.description}</p>}
              </div>
              <button
                type="button"
                onClick={() => dismissToast(toast.id)}
                className="rounded p-0.5 transition-colors hover:bg-elevated"
                aria-label="Dismiss notification"
              >
                <X className="size-4" aria-hidden />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}
