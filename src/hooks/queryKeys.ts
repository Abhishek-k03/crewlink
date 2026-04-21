import type { AssignmentListParams } from '@/api/assignments';
import type { CertificationListParams } from '@/api/certifications';
import type { CrewListParams } from '@/api/crew';
import type { VesselListParams } from '@/api/vessels';

// Query keys as hierarchies, so a broad key invalidates everything under it —
// vesselKeys.lists() refreshes every filter/page combination at once.
export const vesselKeys = {
  all: ['vessels'] as const,
  lists: () => [...vesselKeys.all, 'list'] as const,
  list: (params: VesselListParams) => [...vesselKeys.lists(), params] as const,
  details: () => [...vesselKeys.all, 'detail'] as const,
  detail: (id: string) => [...vesselKeys.details(), id] as const,
  lookup: () => [...vesselKeys.all, 'lookup'] as const,
};

export const crewKeys = {
  all: ['crew'] as const,
  lists: () => [...crewKeys.all, 'list'] as const,
  list: (params: CrewListParams) => [...crewKeys.lists(), params] as const,
  details: () => [...crewKeys.all, 'detail'] as const,
  detail: (id: string) => [...crewKeys.details(), id] as const,
};

export const assignmentKeys = {
  all: ['assignments'] as const,
  lists: () => [...assignmentKeys.all, 'list'] as const,
  list: (params: AssignmentListParams) => [...assignmentKeys.lists(), params] as const,
  details: () => [...assignmentKeys.all, 'detail'] as const,
  detail: (id: string) => [...assignmentKeys.details(), id] as const,
};

export const certificationKeys = {
  all: ['certifications'] as const,
  lists: () => [...certificationKeys.all, 'list'] as const,
  list: (params: CertificationListParams) => [...certificationKeys.lists(), params] as const,
  details: () => [...certificationKeys.all, 'detail'] as const,
  detail: (id: string) => [...certificationKeys.details(), id] as const,
};
