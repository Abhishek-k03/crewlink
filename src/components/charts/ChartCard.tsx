import type { ReactNode } from 'react';

export function ChartCard({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-lg border border-line bg-surface p-4">
      <h3 className="font-medium">{title}</h3>
      {description && <p className="mt-0.5 mb-3 text-sm text-muted">{description}</p>}
      <div className="mt-3 h-64">{children}</div>
    </section>
  );
}
