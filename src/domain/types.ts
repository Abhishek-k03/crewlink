// The vocabulary of the domain. Kept free of React, Dexie, and fetch so the UI,
// the mock server, and the tests can all import it.

// Primitives

/** Calendar date, no time/timezone, `YYYY-MM-DD`. Never a `Date` object — see rules.ts. */
export type IsoDate = string;

/** UUID. Aliased per-entity so signatures document what they expect. */
export type VesselId = string;
export type CrewId = string;
export type AssignmentId = string;
export type CertificationId = string;

// Enumerations

/** `const` array + derived union type, not a TS `enum` — stays iterable for building `<select>`s. */
export const RANKS = [
  'Master',
  'Chief Officer',
  'Chief Engineer',
  '2nd Engineer',
  'AB',
  'Oiler',
  'Cook',
] as const;
export type Rank = (typeof RANKS)[number];

export const VESSEL_TYPES = ['Bulk Carrier', 'Tanker', 'Container', 'RoRo'] as const;
export type VesselType = (typeof VESSEL_TYPES)[number];

export const VESSEL_STATUSES = ['In Service', 'Dry Dock', 'Laid Up'] as const;
export type VesselStatus = (typeof VESSEL_STATUSES)[number];

export const CREW_STATUSES = ['Onboard', 'On Leave', 'Available'] as const;
export type CrewStatus = (typeof CREW_STATUSES)[number];

export const ASSIGNMENT_STATUSES = ['Planned', 'Active', 'Completed'] as const;
export type AssignmentStatus = (typeof ASSIGNMENT_STATUSES)[number];

export const CERTIFICATION_TYPES = [
  'STCW',
  'Medical Fitness',
  'GMDSS',
  "Seaman's Book",
  'Passport',
] as const;
export type CertificationType = (typeof CERTIFICATION_TYPES)[number];

export const ROLES = ['Fleet Manager', 'Crewing Officer', 'Crew Member'] as const;
export type Role = (typeof ROLES)[number];

// Entities

export interface Vessel {
  id: VesselId;
  name: string;
  /** Seven digits, unique across the fleet; carries an IMO check digit. */
  imoNumber: string;
  flag: string;
  type: VesselType;
  status: VesselStatus;
  /** Minimum crew required per rank to sail legally. Unlisted ranks read as `?? 0`. */
  minimumSafeManning: Partial<Record<Rank, number>>;
  readyToSail: boolean;
}

export interface CrewMember {
  id: CrewId;
  name: string;
  /** Substantive rank, may differ from the rank they sail in on a given contract. */
  rank: Rank;
  nationality: string;
  dateOfBirth: IsoDate;
  status: CrewStatus;
  email: string;
  phone: string;
}

export interface Assignment {
  id: AssignmentId;
  crewId: CrewId;
  vesselId: VesselId;
  /** The rank actually filled on this contract; may differ from the crew's own rank. */
  rankOnboard: Rank;
  signOnDate: IsoDate;
  signOffDate: IsoDate;
  port: string;
  status: AssignmentStatus;
}

/** An uploaded scan. Keeps filename/MIME type alongside the data, unlike a bare base64 string. */
export interface CertificationDocument {
  fileName: string;
  mimeType: string;
  /** Size of the original file, before base64 inflates it ~33%. */
  sizeBytes: number;
  /** base64-encoded, without the `data:` URL prefix. */
  data: string;
}

export interface Certification {
  id: CertificationId;
  crewId: CrewId;
  type: CertificationType;
  issueDate: IsoDate;
  expiryDate: IsoDate;
  issuingAuthority: string;
  document?: CertificationDocument;
}
