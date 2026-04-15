import { describe, expect, it } from 'vitest';

import { makeAssignment, makeCertification, makeCrewMember, makeVessel } from '@/test/factories';

import { addDays } from './dates';
import { buildDashboardSummary, expiryBucket } from './reporting';

const TODAY = '2024-06-15';

describe('expiryBucket', () => {
  it('classifies by days remaining, with the boundaries in the later bucket', () => {
    expect(expiryBucket('2024-06-14', TODAY)).toBe('Expired');
    expect(expiryBucket(TODAY, TODAY)).toBe('Within 30 days');
    expect(expiryBucket(addDays(TODAY, 30), TODAY)).toBe('Within 30 days');
    expect(expiryBucket(addDays(TODAY, 31), TODAY)).toBe('Within 90 days');
    expect(expiryBucket(addDays(TODAY, 90), TODAY)).toBe('Within 90 days');
    expect(expiryBucket(addDays(TODAY, 91), TODAY)).toBe('Valid');
  });
});

describe('buildDashboardSummary', () => {
  it('counts distinct crew onboard, not active assignments', () => {
    const crew = makeCrewMember();
    // Same person, two active rows: a data error, but the KPI must not
    // double-count a human being because of it.
    const assignments = [
      makeAssignment({ crewId: crew.id, status: 'Active', signOnDate: '2024-01-01', signOffDate: '2024-12-01' }),
      makeAssignment({ crewId: crew.id, status: 'Active', signOnDate: '2024-02-01', signOffDate: '2024-11-01' }),
    ];

    const summary = buildDashboardSummary([], [crew], assignments, [], TODAY);

    expect(summary.crewOnboard).toBe(1);
  });

  it('excludes active rotations whose dates do not cover today', () => {
    const assignments = [
      makeAssignment({ status: 'Active', signOnDate: '2024-01-01', signOffDate: '2024-03-01' }),
    ];

    expect(buildDashboardSummary([], [], assignments, [], TODAY).crewOnboard).toBe(0);
  });

  it('counts vessels below minimum safe manning', () => {
    const manned = makeVessel({ minimumSafeManning: { Master: 1 } });
    const short = makeVessel({ minimumSafeManning: { Master: 1 } });
    const assignments = [
      makeAssignment({
        vesselId: manned.id,
        rankOnboard: 'Master',
        status: 'Active',
        signOnDate: '2024-01-01',
        signOffDate: '2024-12-01',
      }),
    ];

    const summary = buildDashboardSummary([manned, short], [], assignments, [], TODAY);

    expect(summary.vesselsBelowManning).toBe(1);
    expect(summary.fleetCompliance).toEqual({ compliant: 1, belowManning: 1 });
  });

  it('counts only rotations that have actually overrun', () => {
    const assignments = [
      makeAssignment({ status: 'Active', signOffDate: '2024-06-01' }),
      makeAssignment({ status: 'Active', signOffDate: '2024-07-01' }),
      // Past its dates but never started: a planning error, not an overrun.
      makeAssignment({ status: 'Planned', signOffDate: '2024-01-01' }),
    ];

    expect(buildDashboardSummary([], [], assignments, [], TODAY).overdueRotations).toBe(1);
  });

  it('counts certificates expiring within 30 days but not those already expired', () => {
    const certifications = [
      makeCertification({ expiryDate: addDays(TODAY, -1) }),
      makeCertification({ expiryDate: addDays(TODAY, 10) }),
      makeCertification({ expiryDate: addDays(TODAY, 30) }),
      makeCertification({ expiryDate: addDays(TODAY, 31) }),
    ];

    const summary = buildDashboardSummary([], [], [], certifications, TODAY);

    expect(summary.certificationsExpiringSoon).toBe(2);
    expect(summary.certificationStatus).toEqual([
      { bucket: 'Expired', count: 1 },
      { bucket: 'Within 30 days', count: 2 },
      { bucket: 'Within 90 days', count: 1 },
      { bucket: 'Valid', count: 0 },
    ]);
  });

  it('reports every rank, including those with nobody in them', () => {
    const summary = buildDashboardSummary([], [makeCrewMember({ rank: 'Cook' })], [], [], TODAY);

    expect(summary.crewByRank).toHaveLength(7);
    expect(summary.crewByRank.find((entry) => entry.rank === 'Cook')?.count).toBe(1);
    expect(summary.crewByRank.find((entry) => entry.rank === 'Master')?.count).toBe(0);
  });

  it('returns a fixed twelve-month window ending on the current month', () => {
    const summary = buildDashboardSummary([], [], [], [], TODAY);

    expect(summary.rotationsOverTime).toHaveLength(12);
    expect(summary.rotationsOverTime[0]?.month).toBe('2023-07');
    expect(summary.rotationsOverTime.at(-1)?.month).toBe('2024-06');
  });

  it('keeps months with no movements as zeroes rather than dropping them', () => {
    const assignments = [
      makeAssignment({ signOnDate: '2024-06-02', signOffDate: '2024-06-20' }),
    ];

    const trend = buildDashboardSummary([], [], assignments, [], TODAY).rotationsOverTime;
    const june = trend.find((entry) => entry.month === '2024-06');
    const may = trend.find((entry) => entry.month === '2024-05');

    expect(june).toEqual({ month: '2024-06', signOns: 1, signOffs: 1 });
    expect(may).toEqual({ month: '2024-05', signOns: 0, signOffs: 0 });
  });
});
