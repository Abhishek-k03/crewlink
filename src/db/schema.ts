import Dexie, { type EntityTable } from 'dexie';

import type { Assignment, Certification, CrewMember, Vessel } from '@/domain/types';

/** Records the seed revision so a changed generator can rebuild the database. */
export interface MetaRecord {
  key: string;
  value: string;
}

export type CrewLinkDatabase = Dexie & {
  vessels: EntityTable<Vessel, 'id'>;
  crew: EntityTable<CrewMember, 'id'>;
  assignments: EntityTable<Assignment, 'id'>;
  certifications: EntityTable<Certification, 'id'>;
  meta: EntityTable<MetaRecord, 'key'>;
};

export const db = new Dexie('crewlink') as CrewLinkDatabase;

// Only indexed fields are listed, not every column — indexes cost write time and
// storage. Compound indexes serve the compliance engine's per-crew/per-vessel lookups.
db.version(1).stores({
  vessels: 'id, name, imoNumber, status, type',
  crew: 'id, name, rank, nationality, status',
  assignments:
    'id, crewId, vesselId, status, signOnDate, signOffDate, [crewId+status], [vesselId+status]',
  certifications: 'id, crewId, type, expiryDate, [crewId+type]',
  meta: 'key',
});
