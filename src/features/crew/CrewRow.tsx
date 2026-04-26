import { ChevronRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { RowComponentProps } from 'react-window';

import { Badge, type BadgeTone } from '@/components/ui/Badge';
import type { CrewMember, CrewStatus } from '@/domain/types';

const STATUS_TONES: Record<CrewStatus, BadgeTone> = {
  Onboard: 'positive',
  'On Leave': 'caution',
  Available: 'neutral',
};

export interface CrewRowProps {
  items: CrewMember[];
}

// Rendered by react-window, which supplies `index` and `style` — `style` must be
// applied verbatim, it carries the row's absolute scroll positioning.
export function CrewRow({ index, style, items }: RowComponentProps<CrewRowProps>) {
  const member = items[index];

  if (!member) {
    return (
      <div style={style} className="flex items-center px-3">
        <span className="h-4 w-40 animate-pulse rounded bg-elevated" />
      </div>
    );
  }

  return (
    <div style={style} className="px-1">
      <Link
        to={`/crew/${member.id}`}
        className="flex h-full items-center gap-3 rounded-md border-b border-line px-3 transition-colors hover:bg-elevated"
      >
        <span className="w-56 min-w-0 truncate font-medium">{member.name}</span>
        <span className="w-32 shrink-0 text-sm text-muted">{member.rank}</span>
        <span className="hidden w-32 shrink-0 truncate text-sm text-muted sm:block">
          {member.nationality}
        </span>
        <span className="shrink-0">
          <Badge tone={STATUS_TONES[member.status]}>{member.status}</Badge>
        </span>
        <ChevronRight className="ml-auto size-4 shrink-0 text-muted" aria-hidden />
      </Link>
    </div>
  );
}
