import { addMonths, daysBetween, monthKey, startOfMonth } from './dates';
import { checkManningCompliance, getOverdueDays } from './rules';
import { type Assignment, type Certification, type CrewMember, type IsoDate, type Rank, RANKS, type Vessel } from './types';

export const EXPIRING_SOON_DAYS = 30;
const TREND_MONTHS = 12;

export type ExpiryBucket = 'Expired' | 'Within 30 days' | 'Within 90 days' | 'Valid';

/** The colour-coding the certification views key off. */
export function expiryBucket(expiryDate: IsoDate, today: IsoDate): ExpiryBucket {
  const days = daysBetween(today, expiryDate);
  if (days < 0) return 'Expired';
  if (days <= 30) return 'Within 30 days';
  if (days <= 90) return 'Within 90 days';
  return 'Valid';
}

export interface DashboardSummary {
  crewOnboard: number;
  vesselsBelowManning: number;
  certificationsExpiringSoon: number;
  overdueRotations: number;
  crewByRank: { rank: Rank; count: number }[];
  rotationsOverTime: { month: string; signOns: number; signOffs: number }[];
  fleetCompliance: { compliant: number; belowManning: number };
  certificationStatus: { bucket: ExpiryBucket; count: number }[];
}

// Every dashboard figure, computed in one pass over the data. Pure, so it's
// testable without a database. Reuses the business rules rather than
// reimplementing "below manning" or "overdue", so the dashboard can't drift
// from the pages it links to.
export function buildDashboardSummary(
  vessels: readonly Vessel[],
  crew: readonly CrewMember[],
  assignments: readonly Assignment[],
  certifications: readonly Certification[],
  today: IsoDate,
): DashboardSummary {
  const activeAssignments = assignments.filter(
    (assignment) =>
      assignment.status === 'Active' &&
      assignment.signOnDate <= today &&
      today <= assignment.signOffDate,
  );

  const belowManning = vessels.filter(
    (vessel) => !checkManningCompliance(vessel, assignments, today).compliant,
  ).length;

  const rankCounts = new Map<Rank, number>();
  for (const member of crew) {
    rankCounts.set(member.rank, (rankCounts.get(member.rank) ?? 0) + 1);
  }

  const bucketCounts = new Map<ExpiryBucket, number>();
  let expiringSoon = 0;
  for (const certification of certifications) {
    const bucket = expiryBucket(certification.expiryDate, today);
    bucketCounts.set(bucket, (bucketCounts.get(bucket) ?? 0) + 1);
    const days = daysBetween(today, certification.expiryDate);
    if (days >= 0 && days <= EXPIRING_SOON_DAYS) expiringSoon += 1;
  }

  // A fixed window of months, so a month with no movements still appears as a
  // zero rather than vanishing and distorting the shape of the line.
  const firstMonth = startOfMonth(addMonths(today, -(TREND_MONTHS - 1)));
  const months = Array.from({ length: TREND_MONTHS }, (_unused, index) =>
    monthKey(addMonths(firstMonth, index)),
  );
  const signOns = new Map<string, number>();
  const signOffs = new Map<string, number>();
  for (const assignment of assignments) {
    const onKey = monthKey(assignment.signOnDate);
    const offKey = monthKey(assignment.signOffDate);
    signOns.set(onKey, (signOns.get(onKey) ?? 0) + 1);
    signOffs.set(offKey, (signOffs.get(offKey) ?? 0) + 1);
  }

  return {
    crewOnboard: new Set(activeAssignments.map((assignment) => assignment.crewId)).size,
    vesselsBelowManning: belowManning,
    certificationsExpiringSoon: expiringSoon,
    overdueRotations: assignments.filter((assignment) => getOverdueDays(assignment, today) > 0)
      .length,
    crewByRank: RANKS.map((rank) => ({ rank, count: rankCounts.get(rank) ?? 0 })),
    rotationsOverTime: months.map((month) => ({
      month,
      signOns: signOns.get(month) ?? 0,
      signOffs: signOffs.get(month) ?? 0,
    })),
    fleetCompliance: { compliant: vessels.length - belowManning, belowManning },
    certificationStatus: (
      ['Expired', 'Within 30 days', 'Within 90 days', 'Valid'] as const
    ).map((bucket) => ({ bucket, count: bucketCounts.get(bucket) ?? 0 })),
  };
}
