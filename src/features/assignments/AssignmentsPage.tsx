import {
  closestCorners,
  DndContext,
  type DragEndEvent,
  DragOverlay,
  type DragStartEvent,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';

import { ApiError } from '@/api/client';
import { useAuth } from '@/auth/context';
import { can } from '@/auth/permissions';
import { KanbanCard } from '@/components/kanban/KanbanCard';
import { KanbanColumn } from '@/components/kanban/KanbanColumn';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { PageHeader } from '@/components/ui/PageHeader';
import { Skeleton } from '@/components/ui/Skeleton';
import { useToast } from '@/components/ui/toast-context';
import { todayIso } from '@/domain/dates';
import { getOverdueDays } from '@/domain/rules';
import { ASSIGNMENT_STATUSES, type Assignment, type AssignmentStatus } from '@/domain/types';
import { useAssignments } from '@/hooks/useAssignments';
import { useCrewInfinite } from '@/hooks/useCrew';
import { useUpdateAssignmentStatus } from '@/hooks/useUpdateAssignmentStatus';
import { useVesselNames } from '@/hooks/useVessels';

function isAssignmentStatus(value: string): value is AssignmentStatus {
  return (ASSIGNMENT_STATUSES as readonly string[]).includes(value);
}

export function AssignmentsPage() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const today = useMemo(() => todayIso(), []);
  const [draggingId, setDraggingId] = useState<string | null>(null);

  const canEdit = user ? can(user.role, 'assignment:write') : false;

  const assignmentsQuery = useAssignments({ pageSize: 300, sort: 'signOnDate', order: 'desc' });
  const crewQuery = useCrewInfinite({ sort: 'name' });
  const { names: vesselNames } = useVesselNames();
  const updateStatus = useUpdateAssignmentStatus();

  const crewNames = useMemo(() => {
    const map = new Map<string, string>();
    for (const page of crewQuery.data?.pages ?? []) {
      for (const member of page.items) map.set(member.id, member.name);
    }
    return map;
  }, [crewQuery.data]);

  const assignments = useMemo(
    () => assignmentsQuery.data?.items ?? [],
    [assignmentsQuery.data],
  );

  const columns = useMemo(() => {
    const grouped: Record<AssignmentStatus, Assignment[]> = {
      Planned: [],
      Active: [],
      Completed: [],
    };
    for (const assignment of assignments) grouped[assignment.status].push(assignment);
    return grouped;
  }, [assignments]);

  const draggingAssignment = assignments.find((assignment) => assignment.id === draggingId);

  // The keyboard sensor is what makes this usable without a pointer; a Kanban
  // that only responds to mouse drags excludes keyboard and screen-reader users.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor),
  );

  const handleDragStart = (event: DragStartEvent) => setDraggingId(String(event.active.id));

  const handleDragEnd = async (event: DragEndEvent) => {
    setDraggingId(null);

    const id = String(event.active.id);
    const target = event.over ? String(event.over.id) : null;
    if (!target || !isAssignmentStatus(target)) return;

    const assignment = assignments.find((item) => item.id === id);
    if (!assignment || assignment.status === target) return;

    try {
      await updateStatus.mutateAsync({ id, status: target });
    } catch (caught) {
      // The card has already snapped back by the time this runs: the rollback
      // happens in the mutation's onError, not here.
      showToast({
        tone: 'error',
        title:
          caught instanceof ApiError
            ? caught.message
            : 'Could not move the rotation. It has been put back.',
      });
    }
  };

  if (assignmentsQuery.isPending) {
    return (
      <>
        <PageHeader title="Rotations" />
        <div className="grid gap-4 md:grid-cols-3">
          {ASSIGNMENT_STATUSES.map((status) => (
            <Skeleton key={status} className="h-72" />
          ))}
        </div>
      </>
    );
  }

  if (assignmentsQuery.isError) {
    return (
      <>
        <PageHeader title="Rotations" />
        <EmptyState
          title="Could not load rotations"
          description={
            assignmentsQuery.error instanceof Error
              ? assignmentsQuery.error.message
              : 'Unexpected error.'
          }
        />
      </>
    );
  }

  const renderCardBody = (assignment: Assignment) => {
    const overdue = getOverdueDays(assignment, today);
    return (
      <>
        <p className="font-medium">{crewNames.get(assignment.crewId) ?? assignment.crewId}</p>
        <p className="text-muted">
          {vesselNames.get(assignment.vesselId) ?? assignment.vesselId} · {assignment.rankOnboard}
        </p>
        <p className="mt-1 text-xs text-muted">
          {assignment.signOnDate} → {assignment.signOffDate}
        </p>
        {overdue > 0 && (
          <p className="mt-2">
            <Badge tone="critical">{overdue} days overdue</Badge>
          </p>
        )}
      </>
    );
  };

  return (
    <>
      <PageHeader
        title="Rotations"
        description={
          canEdit
            ? 'Drag a rotation between columns to change its status.'
            : 'Planned, active and completed rotations across the fleet.'
        }
      />

      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={handleDragStart}
        onDragEnd={(event) => void handleDragEnd(event)}
        onDragCancel={() => setDraggingId(null)}
      >
        <div className="grid gap-4 md:grid-cols-3">
          {ASSIGNMENT_STATUSES.map((status) => (
            <KanbanColumn
              key={status}
              id={status}
              title={status}
              count={columns[status].length}
            >
              {columns[status].length === 0 && (
                <p className="px-1 py-6 text-center text-sm text-muted">
                  Nothing here
                </p>
              )}
              {columns[status].map((assignment) => (
                <KanbanCard key={assignment.id} id={assignment.id} disabled={!canEdit}>
                  {renderCardBody(assignment)}
                </KanbanCard>
              ))}
            </KanbanColumn>
          ))}
        </div>

        {/* Rendered outside the columns so the dragged card is not clipped by
            a column's overflow while it moves between them. */}
        <DragOverlay>
          {draggingAssignment && (
            <div className="rounded-lg border border-accent bg-surface p-3 text-sm shadow-lg">
              {renderCardBody(draggingAssignment)}
            </div>
          )}
        </DragOverlay>
      </DndContext>

      <p className="mt-6 text-sm text-muted">
        Rotations are also shown on the{' '}
        <Link to="/calendar" className="underline underline-offset-4">
          calendar
        </Link>
        .
      </p>
    </>
  );
}
