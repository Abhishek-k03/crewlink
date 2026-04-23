import { Loader2 } from 'lucide-react';
import type { ButtonHTMLAttributes, ReactNode } from 'react';

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost';

const VARIANT_CLASSES: Record<Variant, string> = {
  primary: 'bg-primary text-on-primary enabled:hover:opacity-90',
  secondary: 'border border-line text-ink enabled:hover:bg-elevated',
  danger: 'bg-danger text-white enabled:hover:opacity-90',
  ghost: 'text-ink enabled:hover:bg-elevated',
};

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  pending?: boolean;
  children: ReactNode;
}

export function Button({
  variant = 'secondary',
  pending = false,
  disabled,
  className = '',
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      {...props}
      disabled={disabled || pending}
      className={`inline-flex items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors disabled:opacity-50 ${VARIANT_CLASSES[variant]} ${className}`}
    >
      {pending && <Loader2 className="size-4 animate-spin" aria-hidden />}
      {children}
    </button>
  );
}
