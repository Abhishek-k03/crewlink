import { useDraggable } from '@dnd-kit/core';
import type { ReactNode } from 'react';

interface KanbanCardProps {
  id: string;
  disabled?: boolean;
  children: ReactNode;
}

export function KanbanCard({ id, disabled = false, children }: KanbanCardProps) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id,
    disabled,
  });

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      style={{
        transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
      }}
      className={[
        'rounded-lg border border-line bg-surface p-3 text-sm',
        disabled ? 'cursor-default' : 'cursor-grab active:cursor-grabbing',
        // The original stays in place at reduced opacity so the column does not
        // reflow underneath the pointer mid-drag.
        isDragging ? 'opacity-40' : '',
      ].join(' ')}
    >
      {children}
    </div>
  );
}
