import { useQuery } from '@tanstack/react-query';

import { type AssignmentListParams, assignmentsApi } from '@/api/assignments';

import { assignmentKeys } from './queryKeys';

export function useAssignments(params: AssignmentListParams = {}) {
  return useQuery({
    queryKey: assignmentKeys.list(params),
    queryFn: () => assignmentsApi.list(params),
  });
}
