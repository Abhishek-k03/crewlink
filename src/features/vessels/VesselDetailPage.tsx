import { AlertTriangle, ArrowLeft, CheckCircle2 } from 'lucide-react';
import { useMemo } from 'react';
import { Link, useParams } from 'react-router-dom';

import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { PageHeader } from '@/components/ui/PageHeader';
import { Skeleton } from '@/components/ui/Skeleton';
import { todayIso } from '@/domain/dates';
import { checkManningCompliance } from '@/domain/rules';
import { RANKS } from '@/domain/types';
import { useAssignments } from '@/hooks/useAssignments';
import { useCrewInfinite } from '@/hooks/useCrew';
import { useVessel } from '@/hooks/useVessels';

export function VesselDetailPage() {
  const { id } = useParams<{ id: string }>();
  const today = useMemo(() => todayIso(), []);

  const vesselQuery = useVessel(id);
  const assignmentsQuery = useAssignments({ vesselId: id, pageSize: 200 });
  // The roster is small; names come from the first page of the directory.
  const crewQuery = useCrewInfinite({ sort: 'name' });

  const crewNames = useMemo(() => {
    const map = new Map<string, string>();
    for (const page of crewQuery.data?.pages ?? []) {
      for (const member of page.items) map.set(member.id, member.name);
    }
    return map;
  }, [crewQuery.data]);

  if (vesselQuery.isPending) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  if (vesselQuery.isError || !vesselQuery.data) {
    return (
      <EmptyState
        title="Vessel not found"
        description="That record may have been deleted."
        action={
          <Link to="/vessels" className="text-sm font-medium underline underline-offset-4">
            Back to the fleet
          </Link>
        }
      />
    );
  }

  const vessel = vesselQuery.data;
  const assignments = assignmentsQuery.data?.items ?? [];

  // The same pure function the mock server runs before allowing "ready to sail",
  // so the banner cannot disagree with what the API will accept.
  const compliance = checkManningCompliance(vessel, assignments, today);

  const onboard = assignments.filter(
    (assignment) =>
      assignment.status === 'Active' &&
      assignment.signOnDate <= today &&
      today <= assignment.signOffDate,
  );

  return (
    <>
      <Link
        to="/vessels"
        className="mb-4 inline-flex items-center gap-1 text-sm text-muted transition-colors hover:text-ink"
      >
        <ArrowLeft className="size-4" aria-hidden />
        All vessels
      </Link>

      <PageHeader
        title={vessel.name}
        description={`${vessel.type} · IMO ${vessel.imoNumber} · ${vessel.flag}`}
        actions={
          <div className="flex items-center gap-2">
            {vessel.readyToSail && <Badge tone="info">Ready to sail</Badge>}
            <Badge tone={vessel.status === 'In Service' ? 'positive' : 'neutral'}>
              {vessel.status}
            </Badge>
          </div>
        }
      />

      <div
        className={`mb-6 flex items-start gap-3 rounded-lg border p-4 ${
          compliance.compliant ? 'border-accent/40 bg-accent/10' : 'border-danger/40 bg-danger/10'
        }`}
      >
        {compliance.compliant ? (
          <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-accent" aria-hidden />
        ) : (
          <AlertTriangle className="mt-0.5 size-5 shrink-0 text-danger" aria-hidden />
        )}
        <div>
          <p className="font-medium">
            {compliance.compliant
              ? 'Meets minimum safe manning'
              : 'Below minimum safe manning'}
          </p>
          {!compliance.compliant && (
            <ul className="mt-1 text-sm text-ink">
              {compliance.shortfalls.map((shortfall) => (
                <li key={shortfall.rank}>
                  {shortfall.rank}: {shortfall.actual} of {shortfall.required} — short{' '}
                  {shortfall.short}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <section className="mb-8">
        <h2 className="mb-3 font-semibold">Minimum safe manning</h2>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {RANKS.filter((rank) => (vessel.minimumSafeManning[rank] ?? 0) > 0).map((rank) => {
            const required = vessel.minimumSafeManning[rank] ?? 0;
            const actual = onboard.filter((assignment) => assignment.rankOnboard === rank).length;
            return (
              <div
                key={rank}
                className="rounded-lg border border-line bg-surface p-3 text-sm"
              >
                <p className="text-muted">{rank}</p>
                <p
                  className={`font-semibold tabular-nums ${
                    actual < required ? 'text-danger' : ''
                  }`}
                >
                  {actual} / {required}
                </p>
              </div>
            );
          })}
        </div>
      </section>

      <section>
        <h2 className="mb-3 font-semibold">Crew onboard ({onboard.length})</h2>

        {assignmentsQuery.isPending ? (
          <Skeleton className="h-32 w-full" />
        ) : onboard.length === 0 ? (
          <EmptyState title="Nobody onboard" description="This vessel has no active rotations today." />
        ) : (
          <ul className="flex flex-col gap-2">
            {onboard.map((assignment) => (
              <li
                key={assignment.id}
                className="flex flex-wrap items-center gap-3 rounded-lg border border-line bg-surface p-3 text-sm"
              >
                <Link
                  to={`/crew/${assignment.crewId}`}
                  className="font-medium hover:underline"
                >
                  {crewNames.get(assignment.crewId) ?? assignment.crewId}
                </Link>
                <span className="text-muted">{assignment.rankOnboard}</span>
                <span className="ml-auto text-muted">
                  Signs off {assignment.signOffDate}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
