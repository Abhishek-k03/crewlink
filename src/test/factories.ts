/** Test data builders: pass only the fields a test cares about, the rest default. */

import type { Assignment, Certification, CrewMember, Vessel } from '@/domain/types';

let sequence = 0;
/** Deterministic, unlike `crypto.randomUUID()`. */
function nextId(prefix: string): string {
  sequence += 1;
  return `${prefix}-${sequence}`;
}

export function makeVessel(overrides: Partial<Vessel> = {}): Vessel {
  return {
    id: nextId('vessel'),
    name: 'MV Test',
    imoNumber: '9074729',
    flag: 'Panama',
    type: 'Bulk Carrier',
    status: 'In Service',
    minimumSafeManning: { Master: 1, 'Chief Officer': 1, 'Chief Engineer': 1, AB: 4 },
    readyToSail: false,
    ...overrides,
  };
}

export function makeCrewMember(overrides: Partial<CrewMember> = {}): CrewMember {
  return {
    id: nextId('crew'),
    name: 'Test Seafarer',
    rank: 'AB',
    nationality: 'Philippines',
    dateOfBirth: '1990-01-01',
    status: 'Available',
    email: 'test@crewlink.dev',
    phone: '+63 900 000 0000',
    ...overrides,
  };
}

export function makeAssignment(overrides: Partial<Assignment> = {}): Assignment {
  return {
    id: nextId('assignment'),
    crewId: 'crew-1',
    vesselId: 'vessel-1',
    rankOnboard: 'AB',
    signOnDate: '2024-01-01',
    signOffDate: '2024-06-30',
    port: 'Singapore',
    status: 'Planned',
    ...overrides,
  };
}

export function makeCertification(overrides: Partial<Certification> = {}): Certification {
  return {
    id: nextId('certification'),
    crewId: 'crew-1',
    type: 'STCW',
    issueDate: '2020-01-01',
    expiryDate: '2030-01-01',
    issuingAuthority: 'MARINA',
    ...overrides,
  };
}
