import { DEMO_CREW_MEMBER_CREW_ID } from '@/auth/users';
import { addDays, todayIso } from '@/domain/dates';
import { imoCheckDigit } from '@/domain/imo';
import { REQUIRED_CERTIFICATIONS_BY_RANK } from '@/domain/rules';
import {
  type Assignment,
  type Certification,
  CERTIFICATION_TYPES,
  type CrewMember,
  type CrewStatus,
  type IsoDate,
  type Rank,
  RANKS,
  type Vessel,
  VESSEL_STATUSES,
  VESSEL_TYPES,
} from '@/domain/types';

import { chance, createRandom, pick, type Random, randomInt } from './random';
import { db } from './schema';
import {
  FAMILY_NAMES,
  FLAGS,
  GIVEN_NAMES,
  ISSUING_AUTHORITIES,
  NATIONALITIES,
  PORTS,
  VESSEL_PREFIXES,
  VESSEL_SUFFIXES,
} from './seedData';

/** Bump to rebuild the database from a changed generator. */
const SEED_VERSION = '3';
const SEED_KEY = 'seedVersion';
const RANDOM_SEED = 20260821;

const VESSEL_COUNT = 20;
const CREW_COUNT = 1200;
const ASSIGNMENT_COUNT = 1500;

/** Ratios roughly matching a real crew list: more ratings than officers. */
const RANK_WEIGHTS: Record<Rank, number> = {
  Master: 1,
  'Chief Officer': 1,
  'Chief Engineer': 1,
  '2nd Engineer': 1,
  AB: 5,
  Oiler: 3,
  Cook: 1,
};

const WEIGHTED_RANKS: Rank[] = RANKS.flatMap((rank) =>
  Array.from({ length: RANK_WEIGHTS[rank] }, () => rank),
);

function paddedId(prefix: string, index: number): string {
  return `${prefix}-${String(index).padStart(4, '0')}`;
}

/** Builds a 7-digit IMO number whose check digit is correct. */
function makeImoNumber(random: Random): string {
  const base = String(randomInt(random, 900000, 989999));
  return `${base}${imoCheckDigit(base)}`;
}

function generateVessels(random: Random): Vessel[] {
  return Array.from({ length: VESSEL_COUNT }, (_unused, index) => {
    const type = pick(random, VESSEL_TYPES);
    // Larger vessels carry more ratings; the officer core is the same everywhere.
    const abRequirement = type === 'Container' || type === 'Tanker' ? 6 : 4;

    return {
      id: paddedId('vessel', index + 1),
      name: `MV ${pick(random, VESSEL_PREFIXES)} ${pick(random, VESSEL_SUFFIXES)}`,
      imoNumber: makeImoNumber(random),
      flag: pick(random, FLAGS),
      type,
      status: chance(random, 0.8) ? 'In Service' : pick(random, VESSEL_STATUSES),
      minimumSafeManning: {
        Master: 1,
        'Chief Officer': 1,
        'Chief Engineer': 1,
        '2nd Engineer': 1,
        AB: abRequirement,
        Oiler: 2,
        Cook: 1,
      },
      readyToSail: false,
    } satisfies Vessel;
  });
}

function generateCrew(random: Random): CrewMember[] {
  return Array.from({ length: CREW_COUNT }, (_unused, index) => {
    const given = pick(random, GIVEN_NAMES);
    const family = pick(random, FAMILY_NAMES);
    const birthYear = randomInt(random, 1968, 2003);

    return {
      // The first record uses the fixed id the demo Crew Member account maps to.
      id: index === 0 ? DEMO_CREW_MEMBER_CREW_ID : paddedId('crew', index + 1),
      name: index === 0 ? 'Ariel Santos' : `${given} ${family}`,
      rank: index === 0 ? 'Chief Officer' : pick(random, WEIGHTED_RANKS),
      nationality: pick(random, NATIONALITIES),
      dateOfBirth: `${birthYear}-${String(randomInt(random, 1, 12)).padStart(2, '0')}-${String(
        randomInt(random, 1, 28),
      ).padStart(2, '0')}`,
      status: 'Available' satisfies CrewStatus,
      email: `${given}.${family}${index}`.toLowerCase() + '@crewlink.dev',
      phone: `+63 9${randomInt(random, 10, 99)} ${randomInt(random, 100, 999)} ${randomInt(random, 1000, 9999)}`,
    } satisfies CrewMember;
  });
}

// Generated per crew member rather than at random, so nobody ends up
// double-booked — the seed has to satisfy the same overlap rule the app enforces.
function generateAssignments(random: Random, crew: CrewMember[], vessels: Vessel[]): Assignment[] {
  const assignments: Assignment[] = [];
  const today = todayIso();
  let sequence = 0;

  for (const member of crew) {
    if (assignments.length >= ASSIGNMENT_COUNT) break;

    const isDemo = member.id === DEMO_CREW_MEMBER_CREW_ID;
    // A minority of the pool has never sailed with this operator.
    if (!isDemo && chance(random, 0.1)) continue;

    // A chain of contracts, each starting after the last ends — satisfies the
    // overlap rule by construction rather than by rejection sampling.
    const contracts = randomInt(random, 1, 3);
    // The demo account is anchored so that one of its contracts covers today.
    let cursor: IsoDate = isDemo
      ? addDays(today, -60)
      : addDays(today, -randomInt(random, 60, 900));

    for (let index = 0; index < contracts; index += 1) {
      if (assignments.length >= ASSIGNMENT_COUNT) break;

      const signOnDate = cursor;
      const signOffDate = addDays(signOnDate, randomInt(random, 120, 240));

      let status: Assignment['status'];
      if (signOnDate > today) status = 'Planned';
      else if (signOffDate < today) status = 'Completed';
      else status = 'Active';

      sequence += 1;
      assignments.push({
        id: paddedId('assignment', sequence),
        crewId: member.id,
        vesselId: pick(random, vessels).id,
        // Occasionally somebody sails one rank above their substantive rank.
        rankOnboard: chance(random, 0.08) ? pick(random, WEIGHTED_RANKS) : member.rank,
        signOnDate,
        signOffDate,
        port: pick(random, PORTS),
        status,
      });

      // Shore leave between contracts, which also keeps the next range clear of
      // this one rather than merely adjacent to it.
      cursor = addDays(signOffDate, randomInt(random, 21, 150));

      // Nobody is scheduled years ahead; stop the chain once it runs past the
      // planning horizon.
      if (cursor > addDays(today, 240)) break;
    }
  }

  return assignments;
}

// Every crew member gets the certificates their rank requires; a minority are
// expired or expiring soon, so the compliance views have something to show.
// Anyone with a Planned/Active rotation gets certificates that outlast it —
// otherwise the seed would open the app already in breach of rule 3.
function generateCertifications(
  random: Random,
  crew: CrewMember[],
  assignments: Assignment[],
): Certification[] {
  const certifications: Certification[] = [];
  const today = todayIso();
  let sequence = 0;

  // The furthest sign-off and every rank each crew member is committed to
  // sailing — rank onboard can exceed substantive rank, and rule 3 checks the
  // rank actually sailed.
  const commitmentEnd = new Map<string, IsoDate>();
  const committedRanks = new Map<string, Set<Rank>>();
  for (const assignment of assignments) {
    if (assignment.status === 'Completed') continue;

    const current = commitmentEnd.get(assignment.crewId);
    if (!current || assignment.signOffDate > current) {
      commitmentEnd.set(assignment.crewId, assignment.signOffDate);
    }

    const ranks = committedRanks.get(assignment.crewId) ?? new Set<Rank>();
    ranks.add(assignment.rankOnboard);
    committedRanks.set(assignment.crewId, ranks);
  }

  for (const member of crew) {
    const required = new Set(REQUIRED_CERTIFICATIONS_BY_RANK[member.rank]);
    for (const rank of committedRanks.get(member.id) ?? []) {
      for (const type of REQUIRED_CERTIFICATIONS_BY_RANK[rank]) required.add(type);
    }
    const mustOutlast = commitmentEnd.get(member.id);

    for (const type of required) {
      let expiryDate: IsoDate;

      if (mustOutlast) {
        // Valid for the whole contract, plus a realistic margin beyond it.
        expiryDate = addDays(mustOutlast, randomInt(random, 30, 900));
      } else {
        const roll = random();
        let expiryOffset: number;
        if (roll < 0.12) expiryOffset = randomInt(random, -400, -1); // already expired
        else if (roll < 0.26) expiryOffset = randomInt(random, 1, 30); // expiring within a month
        else if (roll < 0.42) expiryOffset = randomInt(random, 31, 90); // within a quarter
        else expiryOffset = randomInt(random, 120, 1500);
        expiryDate = addDays(today, expiryOffset);
      }
      sequence += 1;
      certifications.push({
        id: paddedId('certification', sequence),
        crewId: member.id,
        type,
        issueDate: addDays(expiryDate, -randomInt(random, 730, 1825)),
        expiryDate,
        issuingAuthority: pick(random, ISSUING_AUTHORITIES),
      });
    }

    // A few hold extras beyond what their rank strictly requires.
    if (chance(random, 0.15)) {
      const extra = pick(random, CERTIFICATION_TYPES);
      if (!required.has(extra)) {
        const expiryDate = addDays(today, randomInt(random, 200, 1500));
        sequence += 1;
        certifications.push({
          id: paddedId('certification', sequence),
          crewId: member.id,
          type: extra,
          issueDate: addDays(expiryDate, -1095),
          expiryDate,
          issuingAuthority: pick(random, ISSUING_AUTHORITIES),
        });
      }
    }
  }

  return certifications;
}

export interface SeedDataset {
  vessels: Vessel[];
  crew: CrewMember[];
  assignments: Assignment[];
  certifications: Certification[];
}

/** Pure generator, separated from persistence so it can be tested without IndexedDB. */
export function generateSeedData(seed: number = RANDOM_SEED): SeedDataset {
  const random = createRandom(seed);
  const vessels = generateVessels(random);
  const crew = generateCrew(random);
  const assignments = generateAssignments(random, crew, vessels);
  // Certificates are generated last so they can be made to outlast the rotations
  // their holders are committed to.
  const certifications = generateCertifications(random, crew, assignments);

  // Crew status is derived from the rotations rather than rolled independently,
  // so nobody is "On Leave" while holding an active contract.
  const activeCrewIds = new Set(
    assignments.filter((item) => item.status === 'Active').map((item) => item.crewId),
  );
  for (const member of crew) {
    member.status = activeCrewIds.has(member.id) ? 'Onboard' : 'Available';
  }

  return { vessels, crew, assignments, certifications };
}

/** Populates IndexedDB on first run, and rebuilds it when the seed version changes. */
export async function ensureSeeded(): Promise<void> {
  const existing = await db.meta.get(SEED_KEY);
  if (existing?.value === SEED_VERSION) return;

  const data = generateSeedData();

  await db.transaction(
    'rw',
    [db.vessels, db.crew, db.assignments, db.certifications, db.meta],
    async () => {
      await Promise.all([
        db.vessels.clear(),
        db.crew.clear(),
        db.assignments.clear(),
        db.certifications.clear(),
      ]);
      // bulkAdd writes in one operation; adding 5,000 records individually would
      // mean 5,000 round trips through the IndexedDB transaction queue.
      await Promise.all([
        db.vessels.bulkAdd(data.vessels),
        db.crew.bulkAdd(data.crew),
        db.assignments.bulkAdd(data.assignments),
        db.certifications.bulkAdd(data.certifications),
      ]);
      await db.meta.put({ key: SEED_KEY, value: SEED_VERSION });
    },
  );
}
