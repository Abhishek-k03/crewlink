import type { VesselInput } from '@/domain/schemas';
import type { Vessel, VesselStatus, VesselType } from '@/domain/types';

import { apiClient, type Paginated, toQueryString } from './client';

export interface VesselListParams {
  search?: string;
  status?: VesselStatus;
  type?: VesselType;
  page?: number;
  pageSize?: number;
  sort?: string;
  order?: 'asc' | 'desc';
}

/** Just enough of a vessel to render its name against a rotation. */
export interface VesselSummary {
  id: string;
  name: string;
}

export const vesselsApi = {
  list: (params: VesselListParams = {}) =>
    apiClient.get<Paginated<Vessel>>(`/vessels${toQueryString({ ...params })}`),
  /** Names only, readable by any role — used to resolve a rotation's vesselId to a name. */
  lookup: () => apiClient.get<VesselSummary[]>('/vessels/lookup'),
  get: (id: string) => apiClient.get<Vessel>(`/vessels/${id}`),
  create: (input: VesselInput) => apiClient.post<Vessel>('/vessels', input),
  update: (id: string, input: Partial<VesselInput>) =>
    apiClient.patch<Vessel>(`/vessels/${id}`, input),
  remove: (id: string) => apiClient.delete(`/vessels/${id}`),
};
