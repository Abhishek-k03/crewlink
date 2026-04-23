import type { ReactNode } from 'react';

export type BadgeTone = 'neutral' | 'positive' | 'caution' | 'critical' | 'info';

// Tones mix against the brand palette so one set of values works in both
// light and dark, without a `dark:` variant per tone.
const TONE_CLASSES: Record<BadgeTone, string> = {
  neutral: 'bg-elevated text-muted',
  positive: 'bg-accent/15 text-accent',
  caution: 'bg-warn/15 text-warn',
  critical: 'bg-danger/15 text-danger',
  info: 'bg-brand/15 text-brand',
};

export function Badge({ tone = 'neutral', children }: { tone?: BadgeTone; children: ReactNode }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap ${TONE_CLASSES[tone]}`}
    >
      {children}
    </span>
  );
}
