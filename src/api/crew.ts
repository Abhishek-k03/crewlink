import type { CrewInput } from '@/domain/schemas';
import type { CrewMember, CrewStatus, Rank } from '@/domain/types';

import { apiClient, type Paginated, toQueryString } from './client';

export interface CrewListParams {
  search?: string;
  status?: CrewStatus;
  rank?: Rank;
  nationality?: string;
  page?: number;
  pageSize?: number;
  sort?: string;
  order?: 'asc' | 'desc';
}

export const crewApi = {
  list: (params: CrewListParams = {}) =>
    apiClient.get<Paginated<CrewMember>>(`/crew${toQueryString({ ...params })}`),
  get: (id: string) => apiClient.get<CrewMember>(`/crew/${id}`),
  create: (input: CrewInput) => apiClient.post<CrewMember>('/crew', input),
  update: (id: string, input: Partial<CrewInput>) =>
    apiClient.patch<CrewMember>(`/crew/${id}`, input),
  remove: (id: string) => apiClient.delete(`/crew/${id}`),
};
