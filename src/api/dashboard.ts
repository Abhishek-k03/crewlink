import type { DashboardSummary } from '@/domain/reporting';

import { apiClient } from './client';

export const dashboardApi = {
  summary: () => apiClient.get<DashboardSummary>('/dashboard'),
};
