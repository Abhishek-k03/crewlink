import { describe, expect, it } from 'vitest';

import { makeAssignment, makeCertification, makeCrewMember, makeVessel } from '@/test/factories';

import {
  checkManningCompliance,
  findBlockingCertifications,
  findConflictingAssignments,
  getOverdueDays,
} from './rules';

describe('findConflictingAssignments', () => {
  it('returns no conflicts when the crew member has no other assignments', () => {
    const candidate = makeAssignment({ crewId: 'crew-A' });

    expect(findConflictingAssignments(candidate, [])).toEqual([]);
  });

  it('flags an assignment that falls entirely inside an existing rotation', () => {
    const existing = makeAssignment({
      crewId: 'crew-A',
      signOnDate: '2024-01-01',
      signOffDate: '2024-06-30',
      status: 'Active',
    });
    const candidate = makeAssignment({
      crewId: 'crew-A',
      signOnDate: '2024-03-01',
      signOffDate: '2024-04-01',
    });

    expect(findConflictingAssignments(candidate, [existing])).toEqual([existing]);
  });

  /* Exclusions */

  it('ignores assignments belonging to a different crew member', () => {
    const existing = makeAssignment({
      crewId: 'crew-B',
      signOnDate: '2024-01-01',
      signOffDate: '2024-06-30',
      status: 'Active',
    });
    const candidate = makeAssignment({
      crewId: 'crew-A',
      signOnDate: '2024-03-01',
      signOffDate: '2024-04-01',
    });

    expect(findConflictingAssignments(candidate, [existing])).toEqual([]);
  });

  it('ignores Completed assignments, even when the dates overlap', () => {
    const existing = makeAssignment({
      crewId: 'crew-A',
      signOnDate: '2024-01-01',
      signOffDate: '2024-06-30',
      status: 'Completed',
    });
    const candidate = makeAssignment({
      crewId: 'crew-A',
      signOnDate: '2024-03-01',
      signOffDate: '2024-04-01',
    });

    expect(findConflictingAssignments(candidate, [existing])).toEqual([]);
  });

  it('ignores the candidate itself, so an existing assignment can be edited', () => {
    const candidate = makeAssignment({
      id: 'assignment-being-edited',
      crewId: 'crew-A',
      signOnDate: '2024-01-01',
      signOffDate: '2024-06-30',
      status: 'Active',
    });
    // Distinct object, same id -- proves the exclusion is id-based, not reference-based.
    const sameRecordDifferentObject = { ...candidate };

    expect(findConflictingAssignments(candidate, [sameRecordDifferentObject])).toEqual([]);
  });

  /* Overlap shapes */

  it('flags an existing rotation that falls entirely inside the candidate', () => {
    const existing = makeAssignment({
      crewId: 'crew-A',
      signOnDate: '2024-03-01',
      signOffDate: '2024-04-01',
      status: 'Active',
    });
    const candidate = makeAssignment({
      crewId: 'crew-A',
      signOnDate: '2024-01-01',
      signOffDate: '2024-06-30',
    });

    expect(findConflictingAssignments(candidate, [existing])).toEqual([existing]);
  });

  it('flags a candidate that overlaps only the start of an existing rotation', () => {
    // existing:      |-----------|  (03-01 .. 08-01)
    // candidate: |--------|          (01-01 .. 04-01)
    const existing = makeAssignment({
      crewId: 'crew-A',
      signOnDate: '2024-03-01',
      signOffDate: '2024-08-01',
      status: 'Active',
    });
    const candidate = makeAssignment({
      crewId: 'crew-A',
      signOnDate: '2024-01-01',
      signOffDate: '2024-04-01',
    });

    expect(findConflictingAssignments(candidate, [existing])).toEqual([existing]);
  });

  it('flags a candidate that overlaps only the end of an existing rotation', () => {
    // existing:  |--------|          (01-01 .. 04-01)
    // candidate:      |-----------|  (03-01 .. 08-01)
    const existing = makeAssignment({
      crewId: 'crew-A',
      signOnDate: '2024-01-01',
      signOffDate: '2024-04-01',
      status: 'Active',
    });
    const candidate = makeAssignment({
      crewId: 'crew-A',
      signOnDate: '2024-03-01',
      signOffDate: '2024-08-01',
    });

    expect(findConflictingAssignments(candidate, [existing])).toEqual([existing]);
  });

  it('flags two rotations with identical dates', () => {
    const existing = makeAssignment({
      crewId: 'crew-A',
      signOnDate: '2024-01-01',
      signOffDate: '2024-06-30',
      status: 'Active',
    });
    const candidate = makeAssignment({
      crewId: 'crew-A',
      signOnDate: '2024-01-01',
      signOffDate: '2024-06-30',
    });

    expect(findConflictingAssignments(candidate, [existing])).toEqual([existing]);
  });

  /* Boundaries */

  it('does not flag rotations separated by a clear gap', () => {
    const existing = makeAssignment({
      crewId: 'crew-A',
      signOnDate: '2024-01-01',
      signOffDate: '2024-03-01',
      status: 'Active',
    });
    const candidate = makeAssignment({
      crewId: 'crew-A',
      signOnDate: '2024-04-01',
      signOffDate: '2024-06-01',
    });

    expect(findConflictingAssignments(candidate, [existing])).toEqual([]);
  });

  it('treats a same-day handover as legal: existing ends 2024-06-01, candidate starts 2024-06-01', () => {
    const existing = makeAssignment({
      crewId: 'crew-A',
      signOnDate: '2024-01-01',
      signOffDate: '2024-06-01',
      status: 'Active',
    });
    const candidate = makeAssignment({
      crewId: 'crew-A',
      signOnDate: '2024-06-01',
      signOffDate: '2024-12-01',
    });

    expect(findConflictingAssignments(candidate, [existing])).toEqual([]);
  });

  /* Result shape */

  it('returns every conflict when a candidate overlaps more than one rotation', () => {
    const existingA = makeAssignment({
      crewId: 'crew-A',
      signOnDate: '2024-01-01',
      signOffDate: '2024-03-01',
      status: 'Planned',
    });
    const existingB = makeAssignment({
      crewId: 'crew-A',
      signOnDate: '2024-02-15',
      signOffDate: '2024-05-01',
      status: 'Active',
    });
    const candidate = makeAssignment({
      crewId: 'crew-A',
      signOnDate: '2024-01-15',
      signOffDate: '2024-04-15',
    });

    expect(findConflictingAssignments(candidate, [existingA, existingB])).toEqual([
      existingA,
      existingB,
    ]);
  });
});

describe('checkManningCompliance', () => {
  it('is compliant when every required rank is fully crewed', () => {
    const vessel = makeVessel({ minimumSafeManning: { Master: 1, AB: 2 } });
    const roster = [
      makeAssignment({
        vesselId: vessel.id,
        rankOnboard: 'Master',
        status: 'Active',
        signOnDate: '2024-01-01',
        signOffDate: '2024-12-01',
      }),
      makeAssignment({
        vesselId: vessel.id,
        rankOnboard: 'AB',
        status: 'Active',
        signOnDate: '2024-01-01',
        signOffDate: '2024-12-01',
      }),
      makeAssignment({
        vesselId: vessel.id,
        rankOnboard: 'AB',
        status: 'Active',
        signOnDate: '2024-01-01',
        signOffDate: '2024-12-01',
      }),
    ];

    expect(checkManningCompliance(vessel, roster, '2024-06-01')).toEqual({
      compliant: true,
      shortfalls: [],
    });
  });

  it('reports a shortfall with the exact gap when a rank is under-crewed', () => {
    const vessel = makeVessel({ minimumSafeManning: { AB: 4 } });
    const roster = [
      makeAssignment({
        vesselId: vessel.id,
        rankOnboard: 'AB',
        status: 'Active',
        signOnDate: '2024-01-01',
        signOffDate: '2024-12-01',
      }),
    ];

    expect(checkManningCompliance(vessel, roster, '2024-06-01')).toEqual({
      compliant: false,
      shortfalls: [{ rank: 'AB', required: 4, actual: 1, short: 3 }],
    });
  });

  it('ignores assignments on a different vessel', () => {
    const vessel = makeVessel({ minimumSafeManning: { Master: 1 } });
    const otherVessel = makeVessel();
    const roster = [
      makeAssignment({
        vesselId: otherVessel.id,
        rankOnboard: 'Master',
        status: 'Active',
        signOnDate: '2024-01-01',
        signOffDate: '2024-12-01',
      }),
    ];

    expect(checkManningCompliance(vessel, roster, '2024-06-01').compliant).toBe(false);
  });

  it('ignores Planned assignments -- only Active crew count toward manning', () => {
    const vessel = makeVessel({ minimumSafeManning: { Master: 1 } });
    const roster = [
      makeAssignment({
        vesselId: vessel.id,
        rankOnboard: 'Master',
        status: 'Planned',
        signOnDate: '2024-01-01',
        signOffDate: '2024-12-01',
      }),
    ];

    expect(checkManningCompliance(vessel, roster, '2024-06-01').compliant).toBe(false);
  });

  it('ignores an Active assignment whose dates do not cover today', () => {
    const vessel = makeVessel({ minimumSafeManning: { Master: 1 } });
    const roster = [
      makeAssignment({
        vesselId: vessel.id,
        rankOnboard: 'Master',
        status: 'Active',
        signOnDate: '2024-01-01',
        signOffDate: '2024-03-01',
      }),
    ];

    expect(checkManningCompliance(vessel, roster, '2024-06-01').compliant).toBe(false);
  });

  it("counts by rankOnboard, not the crew member's substantive rank", () => {
    // Fills the Master slot regardless of the crew member's own substantive rank.
    const vessel = makeVessel({ minimumSafeManning: { Master: 1 } });
    const roster = [
      makeAssignment({
        vesselId: vessel.id,
        rankOnboard: 'Master',
        status: 'Active',
        signOnDate: '2024-01-01',
        signOffDate: '2024-12-01',
      }),
    ];

    expect(checkManningCompliance(vessel, roster, '2024-06-01').compliant).toBe(true);
  });

  it('counts crew on both the sign-on day and the sign-off day (inclusive boundary)', () => {
    const vessel = makeVessel({ minimumSafeManning: { AB: 1 } });
    const signsOnToday = makeAssignment({
      vesselId: vessel.id,
      rankOnboard: 'AB',
      status: 'Active',
      signOnDate: '2024-06-01',
      signOffDate: '2024-12-01',
    });
    const signsOffToday = makeAssignment({
      vesselId: vessel.id,
      rankOnboard: 'AB',
      status: 'Active',
      signOnDate: '2024-01-01',
      signOffDate: '2024-06-01',
    });

    expect(checkManningCompliance(vessel, [signsOnToday], '2024-06-01').compliant).toBe(true);
    expect(checkManningCompliance(vessel, [signsOffToday], '2024-06-01').compliant).toBe(true);
  });

  it('does not produce a shortfall entry for a rank with no minimum, even though every rank is checked', () => {
    const vessel = makeVessel({ minimumSafeManning: { Master: 1 } }); // no AB requirement at all

    expect(checkManningCompliance(vessel, [], '2024-06-01')).toEqual({
      compliant: false,
      shortfalls: [{ rank: 'Master', required: 1, actual: 0, short: 1 }],
    });
  });
});

describe('findBlockingCertifications', () => {
  it('clears a crew member who holds every required certificate well past sign-off', () => {
    const crew = makeCrewMember({ rank: 'AB' });
    const certifications = [
      makeCertification({ crewId: crew.id, type: 'STCW', expiryDate: '2030-01-01' }),
      makeCertification({ crewId: crew.id, type: 'Medical Fitness', expiryDate: '2030-01-01' }),
      makeCertification({ crewId: crew.id, type: "Seaman's Book", expiryDate: '2030-01-01' }),
    ];

    expect(findBlockingCertifications(crew, certifications, 'AB', '2024-12-01')).toEqual([]);
  });

  it('reports a required certificate the crew member does not hold at all', () => {
    const crew = makeCrewMember({ rank: 'Master' });
    const certifications = [
      makeCertification({ crewId: crew.id, type: 'STCW', expiryDate: '2030-01-01' }),
      makeCertification({ crewId: crew.id, type: 'Medical Fitness', expiryDate: '2030-01-01' }),
      makeCertification({ crewId: crew.id, type: "Seaman's Book", expiryDate: '2030-01-01' }),
      makeCertification({ crewId: crew.id, type: 'Passport', expiryDate: '2030-01-01' }),
      // GMDSS deliberately absent.
    ];

    expect(findBlockingCertifications(crew, certifications, 'Master', '2024-12-01')).toEqual([
      { type: 'GMDSS', reason: 'missing' },
    ]);
  });

  it('blocks a certificate that lapses mid-contract, even though it is valid today', () => {
    // Not expired right now, but will be before the contract ends.
    const crew = makeCrewMember({ rank: 'AB' });
    const certifications = [
      makeCertification({ crewId: crew.id, type: 'STCW', expiryDate: '2024-03-01' }),
      makeCertification({ crewId: crew.id, type: 'Medical Fitness', expiryDate: '2030-01-01' }),
      makeCertification({ crewId: crew.id, type: "Seaman's Book", expiryDate: '2030-01-01' }),
    ];

    expect(findBlockingCertifications(crew, certifications, 'AB', '2024-08-01')).toEqual([
      { type: 'STCW', reason: 'expires-before-sign-off', expiryDate: '2024-03-01', daysShort: 153 },
    ]);
  });

  it('does not block when the certificate expires exactly on the sign-off date', () => {
    const crew = makeCrewMember({ rank: 'Cook' });
    const certifications = [
      makeCertification({ crewId: crew.id, type: 'Medical Fitness', expiryDate: '2024-08-01' }),
      makeCertification({ crewId: crew.id, type: "Seaman's Book", expiryDate: '2030-01-01' }),
    ];

    expect(findBlockingCertifications(crew, certifications, 'Cook', '2024-08-01')).toEqual([]);
  });

  it('uses whichever certificate expires latest when duplicates of the same type exist', () => {
    const crew = makeCrewMember({ rank: 'Cook' });
    const certifications = [
      makeCertification({ crewId: crew.id, type: 'Medical Fitness', expiryDate: '2024-01-01' }), // stale
      makeCertification({ crewId: crew.id, type: 'Medical Fitness', expiryDate: '2030-01-01' }), // renewed
      makeCertification({ crewId: crew.id, type: "Seaman's Book", expiryDate: '2030-01-01' }),
    ];

    expect(findBlockingCertifications(crew, certifications, 'Cook', '2024-08-01')).toEqual([]);
  });

  it('checks only the certificates required for the rank being sailed, not the crew\'s own rank', () => {
    // Substantive rank AB would require STCW; sailing as Cook does not.
    const crew = makeCrewMember({ rank: 'AB' });
    const certifications = [
      makeCertification({ crewId: crew.id, type: 'Medical Fitness', expiryDate: '2030-01-01' }),
      makeCertification({ crewId: crew.id, type: "Seaman's Book", expiryDate: '2030-01-01' }),
      // No STCW held.
    ];

    expect(findBlockingCertifications(crew, certifications, 'Cook', '2024-08-01')).toEqual([]);
  });
});

describe('getOverdueDays', () => {
  it('returns the exact number of days an Active assignment has overrun', () => {
    const assignment = makeAssignment({ status: 'Active', signOffDate: '2024-01-01' });

    expect(getOverdueDays(assignment, '2024-01-11')).toBe(10);
  });

  it('returns 0 on the sign-off date itself -- overdue starts the day after', () => {
    const assignment = makeAssignment({ status: 'Active', signOffDate: '2024-01-01' });

    expect(getOverdueDays(assignment, '2024-01-01')).toBe(0);
  });

  it('returns 0 for an Active assignment still within its dates', () => {
    const assignment = makeAssignment({ status: 'Active', signOffDate: '2024-06-01' });

    expect(getOverdueDays(assignment, '2024-01-01')).toBe(0);
  });

  it('returns 0 for a Planned assignment past its sign-off date -- that is a planning error, not an overrun', () => {
    const assignment = makeAssignment({ status: 'Planned', signOffDate: '2024-01-01' });

    expect(getOverdueDays(assignment, '2024-06-01')).toBe(0);
  });

  it('returns 0 for a Completed assignment, regardless of its dates', () => {
    const assignment = makeAssignment({ status: 'Completed', signOffDate: '2024-01-01' });

    expect(getOverdueDays(assignment, '2024-06-01')).toBe(0);
  });
});
