import { useDroppable } from '@dnd-kit/core';
import type { ReactNode } from 'react';

interface KanbanColumnProps {
  id: string;
  title: string;
  count: number;
  children: ReactNode;
}

export function KanbanColumn({ id, title, count, children }: KanbanColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id });

  return (
    <section
      ref={setNodeRef}
      className={`flex min-h-72 flex-col gap-2 rounded-lg border p-3 transition-colors ${
        isOver ? 'border-accent bg-accent/10' : 'border-line bg-elevated/50'
      }`}
    >
      <h2 className="flex items-center justify-between text-sm font-semibold">
        {title}
        <span className="rounded-full bg-elevated px-2 py-0.5 text-xs tabular-nums">{count}</span>
      </h2>
      {children}
    </section>
  );
}
