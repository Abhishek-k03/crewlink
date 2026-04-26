import { useCallback, useMemo, useState } from 'react';

import { assignmentsApi } from '@/api/assignments';
import { crewApi } from '@/api/crew';
import { Calendar, type CalendarView } from '@/components/calendar/Calendar';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { PageHeader } from '@/components/ui/PageHeader';
import { Skeleton } from '@/components/ui/Skeleton';
import { addMonths, startOfMonth, todayIso } from '@/domain/dates';
import type { Assignment, IsoDate } from '@/domain/types';
import { assignmentKeys, crewKeys } from '@/hooks/queryKeys';
import { useVesselNames } from '@/hooks/useVessels';
import { useQuery } from '@tanstack/react-query';

/** One assignment produces two movements: the crew member arriving and leaving. */
interface Movement {
  id: string;
  date: IsoDate;
  kind: 'Sign-on' | 'Sign-off';
  assignment: Assignment;
}

function toMovements(assignments: readonly Assignment[]): Movement[] {
  return assignments.flatMap((assignment) => [
    { id: `${assignment.id}-on`, date: assignment.signOnDate, kind: 'Sign-on' as const, assignment },
    {
      id: `${assignment.id}-off`,
      date: assignment.signOffDate,
      kind: 'Sign-off' as const,
      assignment,
    },
  ]);
}

export function CalendarPage() {
  const today = useMemo(() => todayIso(), []);
  const [anchor, setAnchor] = useState<IsoDate>(() => startOfMonth(today));
  const [view, setView] = useState<CalendarView>('month');
  const [selectedDate, setSelectedDate] = useState<IsoDate | undefined>(today);

  // Fetch a window either side of the visible month so the grid's leading and
  // trailing days are populated too, rather than showing false blanks.
  const from = startOfMonth(addMonths(anchor, -1));
  const to = startOfMonth(addMonths(anchor, 2));

  const assignmentsQuery = useQuery({
    queryKey: assignmentKeys.list({ from, to, pageSize: 1000 }),
    queryFn: () => assignmentsApi.list({ from, to, pageSize: 1000 }),
  });

  // Names are looked up separately: the API returns ids, and the calendar has to
  // show who is moving, not which uuid.
  const crewQuery = useQuery({
    queryKey: crewKeys.list({ pageSize: 2000 }),
    queryFn: () => crewApi.list({ pageSize: 2000 }),
    staleTime: 5 * 60_000,
  });
  const { names: vesselNames } = useVesselNames();

  const crewNames = useMemo(() => {
    const map = new Map<string, string>();
    for (const member of crewQuery.data?.items ?? []) map.set(member.id, member.name);
    return map;
  }, [crewQuery.data]);

  const movements = useMemo(
    () => toMovements(assignmentsQuery.data?.items ?? []),
    [assignmentsQuery.data],
  );

  const selectedMovements = useMemo(
    () => movements.filter((movement) => movement.date === selectedDate),
    [movements, selectedDate],
  );

  // Stable identity so the calendar's bucketing memo is not invalidated each render.
  const getEventDate = useCallback((movement: Movement) => movement.date, []);
  const renderEvent = useCallback(
    (movement: Movement) => (
      <span
        className={[
          'block truncate rounded px-1 py-0.5 text-xs',
          movement.kind === 'Sign-on'
            ? 'bg-accent/20 text-accent'
            : 'bg-warn/20 text-warn',
        ].join(' ')}
      >
        {crewNames.get(movement.assignment.crewId) ?? 'Crew'}
      </span>
    ),
    [crewNames],
  );

  return (
    <>
      <PageHeader
        title="Calendar"
        description="Sign-on and sign-off movements across the fleet."
      />

      {assignmentsQuery.isPending ? (
        <Skeleton className="h-[32rem] w-full" />
      ) : assignmentsQuery.isError ? (
        <EmptyState
          title="Could not load movements"
          description={
            assignmentsQuery.error instanceof Error
              ? assignmentsQuery.error.message
              : 'Unexpected error.'
          }
        />
      ) : (
        <Calendar
          events={movements}
          getEventDate={getEventDate}
          renderEvent={renderEvent}
          today={today}
          anchor={anchor}
          onAnchorChange={setAnchor}
          view={view}
          onViewChange={setView}
          selectedDate={selectedDate}
          onSelectDate={setSelectedDate}
        />
      )}

      {selectedDate && (
        <section className="mt-6">
          <h3 className="mb-3 font-semibold">Movements on {selectedDate}</h3>

          {selectedMovements.length === 0 ? (
            <EmptyState title="No movements" description="Nobody signs on or off on this date." />
          ) : (
            <ul className="flex flex-col gap-2">
              {selectedMovements.map((movement) => (
                <li
                  key={movement.id}
                  className="flex flex-wrap items-center gap-3 rounded-lg border border-line bg-surface p-3 text-sm"
                >
                  <Badge tone={movement.kind === 'Sign-on' ? 'positive' : 'caution'}>
                    {movement.kind}
                  </Badge>
                  <span className="font-medium">
                    {crewNames.get(movement.assignment.crewId) ?? movement.assignment.crewId}
                  </span>
                  <span className="text-muted">
                    {movement.assignment.rankOnboard}
                  </span>
                  <span className="text-muted">
                    {vesselNames.get(movement.assignment.vesselId) ?? movement.assignment.vesselId}
                  </span>
                  <span className="ml-auto text-muted">
                    {movement.assignment.port}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </>
  );
}
