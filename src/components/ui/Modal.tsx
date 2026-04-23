import { X } from 'lucide-react';
import { type ReactNode, useEffect, useRef } from 'react';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}

// Built on the native <dialog> element for free focus trapping, Escape
// handling, and inertness behind it — easy to get subtly wrong on a plain div.
export function Modal({ open, onClose, title, children }: ModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={dialogRef}
      // Fires for Escape and for programmatic close alike, so React state cannot
      // drift out of sync with what the browser is actually showing.
      onClose={onClose}
      onCancel={onClose}
      className="m-auto w-[min(32rem,calc(100vw-2rem))] rounded-lg border border-line bg-surface p-0 text-ink backdrop:bg-brand-deep/60"
    >
      <div className="flex items-center justify-between border-b border-line px-4 py-3">
        <h2 className="font-semibold">{title}</h2>
        <button
          type="button"
          onClick={onClose}
          className="rounded-md p-1 transition-colors hover:bg-elevated"
          aria-label="Close dialog"
        >
          <X className="size-5" aria-hidden />
        </button>
      </div>
      <div className="p-4">{children}</div>
    </dialog>
  );
}
