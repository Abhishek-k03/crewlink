import { AlertTriangle, Clock, ShieldAlert, Users } from 'lucide-react';

import { ChartCard } from '@/components/charts/ChartCard';
import {
  CrewByRankChart,
  FleetComplianceChart,
  RotationsTrendChart,
} from '@/components/charts/DashboardCharts';
import { EmptyState } from '@/components/ui/EmptyState';
import { PageHeader } from '@/components/ui/PageHeader';
import { Skeleton } from '@/components/ui/Skeleton';
import { EXPIRING_SOON_DAYS } from '@/domain/reporting';
import { useDashboardSummary } from '@/hooks/useDashboard';

import { KpiCard } from './KpiCard';

export function DashboardPage() {
  const { data, isPending, isError, error } = useDashboardSummary();

  if (isPending) {
    return (
      <>
        <PageHeader title="Fleet dashboard" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }, (_unused, index) => (
            <Skeleton key={index} className="h-24" />
          ))}
        </div>
        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          <Skeleton className="h-80" />
          <Skeleton className="h-80" />
        </div>
      </>
    );
  }

  if (isError) {
    return (
      <>
        <PageHeader title="Fleet dashboard" />
        <EmptyState
          title="Could not load the dashboard"
          description={error instanceof Error ? error.message : 'Unexpected error.'}
        />
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Fleet dashboard"
        description="Manning, certification and rotation status across the fleet."
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="Crew onboard" value={data.crewOnboard} icon={Users} to="/crew" />
        <KpiCard
          label="Vessels below manning"
          value={data.vesselsBelowManning}
          icon={AlertTriangle}
          alert={data.vesselsBelowManning > 0}
          to="/vessels"
        />
        <KpiCard
          label={`Certificates expiring in ${EXPIRING_SOON_DAYS} days`}
          value={data.certificationsExpiringSoon}
          icon={ShieldAlert}
          alert={data.certificationsExpiringSoon > 0}
          to="/certifications"
        />
        <KpiCard
          label="Overdue rotations"
          value={data.overdueRotations}
          icon={Clock}
          alert={data.overdueRotations > 0}
          to="/assignments"
        />
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <ChartCard title="Crew by rank" description="Substantive rank across the whole pool.">
          <CrewByRankChart data={data.crewByRank} />
        </ChartCard>

        <ChartCard title="Fleet compliance" description="Vessels meeting minimum safe manning today.">
          <FleetComplianceChart data={data.fleetCompliance} />
        </ChartCard>

        <ChartCard
          title="Rotations over time"
          description="Sign-ons and sign-offs per month."
        >
          <RotationsTrendChart data={data.rotationsOverTime} />
        </ChartCard>
      </div>
    </>
  );
}
