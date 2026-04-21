import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';

import { type CrewListParams, crewApi } from '@/api/crew';
import type { CrewInput } from '@/domain/schemas';

import { crewKeys } from './queryKeys';

/** Large enough that scrolling rarely waits, small enough to stay responsive. */
const CREW_PAGE_SIZE = 100;

// Pages through the API rather than loading 1,200 records at once, and the list
// is virtualised on top of that — pagination keeps the network honest,
// virtualisation keeps the DOM honest.
export function useCrewInfinite(params: Omit<CrewListParams, 'page' | 'pageSize'> = {}) {
  return useInfiniteQuery({
    queryKey: [...crewKeys.lists(), 'infinite', params] as const,
    queryFn: ({ pageParam }) =>
      crewApi.list({ ...params, page: pageParam, pageSize: CREW_PAGE_SIZE }),
    initialPageParam: 1,
    getNextPageParam: (lastPage) => {
      const loaded = lastPage.page * lastPage.pageSize;
      return loaded < lastPage.total ? lastPage.page + 1 : undefined;
    },
  });
}

export function useCrewMember(id: string | undefined) {
  return useQuery({
    queryKey: crewKeys.detail(id ?? ''),
    queryFn: () => crewApi.get(id as string),
    enabled: Boolean(id),
  });
}

export function useCreateCrewMember() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CrewInput) => crewApi.create(input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: crewKeys.all }),
  });
}

export function useUpdateCrewMember() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: Partial<CrewInput> }) =>
      crewApi.update(id, input),
    // Paged infinite lists are not patched optimistically: a record can move
    // between pages when the field it is sorted by changes, and guessing where
    // is worse than a brief refetch.
    onSuccess: () => queryClient.invalidateQueries({ queryKey: crewKeys.all }),
  });
}

export function useDeleteCrewMember() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => crewApi.remove(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: crewKeys.all }),
  });
}
