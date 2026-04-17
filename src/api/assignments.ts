import type { AssignmentInput } from '@/domain/schemas';
import type { Assignment, AssignmentStatus, IsoDate } from '@/domain/types';

import { apiClient, type Paginated, toQueryString } from './client';

export interface AssignmentListParams {
  crewId?: string;
  vesselId?: string;
  status?: AssignmentStatus;
  /** Window filter for the calendar: rotations overlapping [from, to]. */
  from?: IsoDate;
  to?: IsoDate;
  page?: number;
  pageSize?: number;
  sort?: string;
  order?: 'asc' | 'desc';
}

export const assignmentsApi = {
  list: (params: AssignmentListParams = {}) =>
    apiClient.get<Paginated<Assignment>>(`/assignments${toQueryString({ ...params })}`),
  get: (id: string) => apiClient.get<Assignment>(`/assignments/${id}`),
  create: (input: AssignmentInput) => apiClient.post<Assignment>('/assignments', input),
  update: (id: string, input: Partial<AssignmentInput>) =>
    apiClient.patch<Assignment>(`/assignments/${id}`, input),
  remove: (id: string) => apiClient.delete(`/assignments/${id}`),
};
