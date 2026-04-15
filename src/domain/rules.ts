// The four business rules, as pure functions: no I/O, `today` always passed in
// explicitly, results are structured detail rather than booleans. Kept free of
// React/Dexie/network deps (enforced by eslint) so both the mock API and the
// forms can import the same logic.

import { daysBetween } from './dates';
import {
  type Assignment,
  type Certification,
  type CertificationType,
  type CrewMember,
  type IsoDate,
  RANKS,
  type Rank,
  type Vessel,
} from './types';

/** Certificates required per rank for an assignment to be legal (rule 3). Policy, not spec-derived. */
export const REQUIRED_CERTIFICATIONS_BY_RANK: Record<Rank, readonly CertificationType[]> = {
  Master: ['STCW', 'Medical Fitness', 'GMDSS', "Seaman's Book", 'Passport'],
  'Chief Officer': ['STCW', 'Medical Fitness', 'GMDSS', "Seaman's Book", 'Passport'],
  'Chief Engineer': ['STCW', 'Medical Fitness', "Seaman's Book", 'Passport'],
  '2nd Engineer': ['STCW', 'Medical Fitness', "Seaman's Book", 'Passport'],
  AB: ['STCW', 'Medical Fitness', "Seaman's Book"],
  Oiler: ['STCW', 'Medical Fitness', "Seaman's Book"],
  Cook: ['Medical Fitness', "Seaman's Book"],
};

/** Half-open `[start, end)`: a same-day handover (one ends where the next begins) is legal. */
function rangesOverlap(aStart: IsoDate, aEnd: IsoDate, bStart: IsoDate, bEnd: IsoDate): boolean {
  return !(aEnd <= bStart || bEnd <= aStart);
}

/** Existing assignments that conflict with `candidate`: same crew, Planned/Active, not itself, overlapping dates. */
export function findConflictingAssignments(
  candidate: Assignment,
  existing: readonly Assignment[],
): Assignment[] {
  return existing.filter((assignment) => {
    const sameCrewMember = candidate.crewId === assignment.crewId;
    const isNotCandidateItself = candidate.id !== assignment.id;
    const occupiesCalendar = assignment.status === 'Active' || assignment.status === 'Planned';
    const datesConflict = rangesOverlap(
      candidate.signOnDate,
      candidate.signOffDate,
      assignment.signOnDate,
      assignment.signOffDate,
    );

    return sameCrewMember && isNotCandidateItself && occupiesCalendar && datesConflict;
  });
}

export interface ManningShortfall {
  rank: Rank;
  required: number;
  actual: number;
  short: number;
}

export interface ManningCompliance {
  compliant: boolean;
  shortfalls: ManningShortfall[];
}

/** Compares a vessel's currently-crewed ranks (Active, today within range) against its minimum manning. */
export function checkManningCompliance(
  vessel: Vessel,
  assignments: readonly Assignment[],
  today: IsoDate,
): ManningCompliance {
  const activeRoster = assignments.filter((assignment) => {
    const validVesselId = assignment.vesselId === vessel.id;
    const validStatus = assignment.status === 'Active';
    const todayValid = assignment.signOnDate <= today && today <= assignment.signOffDate;
    return validVesselId && todayValid && validStatus;
  });

  const countByRank: Partial<Record<Rank, number>> = {};
  for (const assignment of activeRoster) {
    countByRank[assignment.rankOnboard] = (countByRank[assignment.rankOnboard] ?? 0) + 1;
  }

  const shortfalls: ManningShortfall[] = [];
  for (const rank of RANKS) {
    const required = vessel.minimumSafeManning[rank] ?? 0;
    const actual = countByRank[rank] ?? 0;
    if (actual < required) {
      shortfalls.push({ rank, required, actual, short: required - actual });
    }
  }

  return { compliant: shortfalls.length === 0, shortfalls };
}

export interface CertificationBlock {
  type: CertificationType;
  reason: 'missing' | 'expires-before-sign-off';
  expiryDate?: IsoDate;
  daysShort?: number;
}

/** Certificates blocking this rotation: missing, or expiring before `signOffDate` (not "today"). */
export function findBlockingCertifications(
  crew: CrewMember,
  certifications: readonly Certification[],
  rankOnboard: Rank,
  signOffDate: IsoDate,
): CertificationBlock[] {
  const requiredTypes = REQUIRED_CERTIFICATIONS_BY_RANK[rankOnboard];
  const crewCertifications = certifications.filter((cert) => cert.crewId === crew.id);

  const blocks: CertificationBlock[] = [];
  for (const type of requiredTypes) {
    // Multiple certs of the same type can exist (e.g. a renewal); use whichever expires latest.
    const matching = crewCertifications.filter((cert) => cert.type === type);
    const best = matching.reduce<Certification | undefined>((latest, cert) => {
      if (!latest || cert.expiryDate > latest.expiryDate) return cert;
      return latest;
    }, undefined);

    if (!best) {
      blocks.push({ type, reason: 'missing' });
      continue;
    }

    if (best.expiryDate < signOffDate) {
      blocks.push({
        type,
        reason: 'expires-before-sign-off',
        expiryDate: best.expiryDate,
        daysShort: daysBetween(best.expiryDate, signOffDate),
      });
    }
  }

  return blocks;
}

/** Days an Active assignment has overrun `signOffDate`; 0 if not overdue or not Active. */
export function getOverdueDays(assignment: Assignment, today: IsoDate): number {
  if (assignment.status !== 'Active') return 0;

  const overdueDays = daysBetween(assignment.signOffDate, today);
  return overdueDays > 0 ? overdueDays : 0;
}
