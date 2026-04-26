import type { LucideIcon } from 'lucide-react';
import { Link } from 'react-router-dom';

interface KpiCardProps {
  label: string;
  value: number;
  icon: LucideIcon;
  /** Draws attention only when the number represents something to act on. */
  alert?: boolean;
  to?: string;
}

export function KpiCard({ label, value, icon: Icon, alert = false, to }: KpiCardProps) {
  const content = (
    <>
      <div className="flex items-center justify-between">
        <span className="text-sm text-muted">{label}</span>
        <Icon className={`size-4 ${alert ? 'text-danger' : 'text-accent'}`} aria-hidden />
      </div>
      <span
        className={`mt-2 block text-2xl font-semibold tabular-nums ${alert ? 'text-danger' : ''}`}
      >
        {value}
      </span>
    </>
  );

  const className = 'block rounded-lg border border-line bg-surface p-4 transition-colors';

  if (to) {
    return (
      <Link to={to} className={`${className} hover:border-accent`}>
        {content}
      </Link>
    );
  }

  return <div className={className}>{content}</div>;
}
