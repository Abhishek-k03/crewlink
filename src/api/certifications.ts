import type { ExpiryBucket } from '@/domain/reporting';
import type { CertificationInput } from '@/domain/schemas';
import type { Certification, CertificationType, IsoDate } from '@/domain/types';

import { apiClient, type Paginated, toQueryString } from './client';

export interface CertificationListParams {
  /** Matches crew name, issuing authority or certificate type. */
  search?: string;
  crewId?: string;
  type?: CertificationType;
  expiringBefore?: IsoDate;
  /** Colour-coding band, computed server-side against today. */
  bucket?: ExpiryBucket;
  page?: number;
  pageSize?: number;
  sort?: string;
  order?: 'asc' | 'desc';
}

export const certificationsApi = {
  list: (params: CertificationListParams = {}) =>
    apiClient.get<Paginated<Certification>>(`/certifications${toQueryString({ ...params })}`),
  get: (id: string) => apiClient.get<Certification>(`/certifications/${id}`),
  create: (input: CertificationInput) => apiClient.post<Certification>('/certifications', input),
  update: (id: string, input: Partial<CertificationInput>) =>
    apiClient.patch<Certification>(`/certifications/${id}`, input),
  remove: (id: string) => apiClient.delete(`/certifications/${id}`),
};
