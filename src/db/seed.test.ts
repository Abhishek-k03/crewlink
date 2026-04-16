import { describe, expect, it } from 'vitest';

import { DEMO_CREW_MEMBER_CREW_ID } from '@/auth/users';
import { todayIso } from '@/domain/dates';
import { isValidImoNumber } from '@/domain/imo';
import {
  findBlockingCertifications,
  findConflictingAssignments,
  getOverdueDays,
} from '@/domain/rules';

import { generateSeedData } from './seed';

const data = generateSeedData();

describe('seed volume', () => {
  it('meets the record counts the specification calls for', () => {
    expect(data.vessels).toHaveLength(20);
    expect(data.crew.length).toBeGreaterThanOrEqual(1000);
    expect(data.assignments.length).toBeGreaterThanOrEqual(1500);
    expect(data.certifications.length).toBeGreaterThan(3000);
  });
});

describe('seed determinism', () => {
  it('produces identical data for the same seed', () => {
    expect(generateSeedData(1234)).toEqual(generateSeedData(1234));
  });

  it('produces different data for a different seed', () => {
    expect(generateSeedData(1234).crew[5]).not.toEqual(generateSeedData(9999).crew[5]);
  });
});

describe('seed integrity', () => {
  it('includes the crew record the demo Crew Member account signs in as', () => {
    const demo = data.crew.find((member) => member.id === DEMO_CREW_MEMBER_CREW_ID);

    expect(demo).toBeDefined();
    expect(data.assignments.some((item) => item.crewId === DEMO_CREW_MEMBER_CREW_ID)).toBe(true);
    expect(data.certifications.some((item) => item.crewId === DEMO_CREW_MEMBER_CREW_ID)).toBe(true);
  });

  it('generates IMO numbers with valid check digits', () => {
    for (const vessel of data.vessels) {
      expect(isValidImoNumber(vessel.imoNumber)).toBe(true);
    }
  });

  it('references only vessels and crew that exist', () => {
    const vesselIds = new Set(data.vessels.map((vessel) => vessel.id));
    const crewIds = new Set(data.crew.map((member) => member.id));

    for (const assignment of data.assignments) {
      expect(vesselIds.has(assignment.vesselId)).toBe(true);
      expect(crewIds.has(assignment.crewId)).toBe(true);
    }
    for (const certification of data.certifications) {
      expect(crewIds.has(certification.crewId)).toBe(true);
    }
  });

  it('uses unique ids within each table', () => {
    expect(new Set(data.crew.map((item) => item.id)).size).toBe(data.crew.length);
    expect(new Set(data.assignments.map((item) => item.id)).size).toBe(data.assignments.length);
    expect(new Set(data.certifications.map((item) => item.id)).size).toBe(
      data.certifications.length,
    );
  });
});

describe('seed obeys the business rules the app enforces', () => {
  it('never double-books a crew member', () => {
    // Seeding through a generator that ignores the overlap rule would open the
    // app already in violation of its own constraint.
    for (const assignment of data.assignments) {
      expect(findConflictingAssignments(assignment, data.assignments)).toEqual([]);
    }
  });

  it('never leaves an upcoming rotation blocked by its own certification requirements', () => {
    // The counterpart to the double-booking check: if a seeded Planned or Active
    // rotation failed rule 3, the app would open in breach of itself and every
    // attempt to advance that rotation would be refused.
    const crewById = new Map(data.crew.map((member) => [member.id, member]));

    for (const assignment of data.assignments) {
      if (assignment.status === 'Completed') continue;
      const member = crewById.get(assignment.crewId);
      if (!member) throw new Error(`Unknown crew ${assignment.crewId}`);

      expect(
        findBlockingCertifications(
          member,
          data.certifications,
          assignment.rankOnboard,
          assignment.signOffDate,
        ),
      ).toEqual([]);
    }
  });

  it('marks a rotation Active only when today falls inside its dates', () => {
    const today = todayIso();

    for (const assignment of data.assignments.filter((item) => item.status === 'Active')) {
      expect(assignment.signOnDate <= today).toBe(true);
      expect(getOverdueDays(assignment, today)).toBe(0);
    }
  });

  it('leaves nobody marked Onboard without an active rotation', () => {
    const activeCrewIds = new Set(
      data.assignments.filter((item) => item.status === 'Active').map((item) => item.crewId),
    );

    for (const member of data.crew.filter((item) => item.status === 'Onboard')) {
      expect(activeCrewIds.has(member.id)).toBe(true);
    }
  });

  it('includes expired and soon-to-expire certificates for the compliance views', () => {
    const today = todayIso();
    const expired = data.certifications.filter((item) => item.expiryDate < today);
    const expiringSoon = data.certifications.filter(
      (item) => item.expiryDate >= today && item.expiryDate <= '2027-12-31',
    );

    expect(expired.length).toBeGreaterThan(0);
    expect(expiringSoon.length).toBeGreaterThan(0);
  });
});
