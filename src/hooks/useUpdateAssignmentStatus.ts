import { useMutation, useQueryClient } from '@tanstack/react-query';

import { assignmentsApi } from '@/api/assignments';
import type { Paginated } from '@/api/client';
import type { Assignment, AssignmentStatus } from '@/domain/types';

import { assignmentKeys } from './queryKeys';

interface Variables {
  id: string;
  status: AssignmentStatus;
}

// Moving a card between Kanban columns — the board responds to a drop
// instantly and visibly undoes itself if the write fails.
export function useUpdateAssignmentStatus() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, status }: Variables) => assignmentsApi.update(id, { status }),

    async onMutate({ id, status }) {
      // A refetch already in flight would land after this patch and undo it.
      await queryClient.cancelQueries({ queryKey: assignmentKeys.all });

      const previousLists = queryClient.getQueriesData<Paginated<Assignment>>({
        queryKey: assignmentKeys.lists(),
      });

      queryClient.setQueriesData<Paginated<Assignment>>(
        { queryKey: assignmentKeys.lists() },
        (current) =>
          current
            ? {
                ...current,
                items: current.items.map((assignment) =>
                  assignment.id === id ? { ...assignment, status } : assignment,
                ),
              }
            : current,
      );

      return { previousLists };
    },

    onError(_error, _variables, context) {
      for (const [queryKey, data] of context?.previousLists ?? []) {
        queryClient.setQueryData(queryKey, data);
      }
    },

    onSettled: () => queryClient.invalidateQueries({ queryKey: assignmentKeys.all }),
  });
}
