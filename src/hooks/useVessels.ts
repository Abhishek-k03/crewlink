import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';

import type { Paginated } from '@/api/client';
import { type VesselListParams, vesselsApi } from '@/api/vessels';
import type { VesselInput } from '@/domain/schemas';
import type { Vessel } from '@/domain/types';

import { vesselKeys } from './queryKeys';

export function useVessels(params: VesselListParams = {}) {
  return useQuery({
    queryKey: vesselKeys.list(params),
    queryFn: () => vesselsApi.list(params),
    // Keeps the previous page on screen while the next one loads, so paging and
    // typing in the search box do not blank the table on every keystroke.
    placeholderData: keepPreviousData,
  });
}

// A vessel id to name map, for pages that only need the name. Held for an hour
// since vessel names rarely change.
export function useVesselNames() {
  const query = useQuery({
    queryKey: vesselKeys.lookup(),
    queryFn: () => vesselsApi.lookup(),
    staleTime: 60 * 60 * 1000,
  });

  const names = useMemo(() => {
    const map = new Map<string, string>();
    for (const vessel of query.data ?? []) map.set(vessel.id, vessel.name);
    return map;
  }, [query.data]);

  return { names, isPending: query.isPending, isError: query.isError };
}

export function useVessel(id: string | undefined) {
  return useQuery({
    queryKey: vesselKeys.detail(id ?? ''),
    queryFn: () => vesselsApi.get(id as string),
    enabled: Boolean(id),
  });
}

export function useCreateVessel() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: VesselInput) => vesselsApi.create(input),
    // Not optimistic: the server assigns the id, and inserting a placeholder row
    // means guessing where it sorts and paginates. A pending button is honest and
    // costs one round trip.
    onSuccess: () => queryClient.invalidateQueries({ queryKey: vesselKeys.lists() }),
  });
}

interface UpdateVesselVariables {
  id: string;
  input: Partial<VesselInput>;
}

export function useUpdateVessel() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, input }: UpdateVesselVariables) => vesselsApi.update(id, input),

    async onMutate({ id, input }) {
      // In-flight refetches would otherwise land after the optimistic write and
      // overwrite it with stale server data.
      await queryClient.cancelQueries({ queryKey: vesselKeys.all });

      const previousLists = queryClient.getQueriesData<Paginated<Vessel>>({
        queryKey: vesselKeys.lists(),
      });
      const previousDetail = queryClient.getQueryData<Vessel>(vesselKeys.detail(id));

      queryClient.setQueriesData<Paginated<Vessel>>({ queryKey: vesselKeys.lists() }, (current) =>
        current
          ? {
              ...current,
              items: current.items.map((vessel) =>
                vessel.id === id ? { ...vessel, ...input } : vessel,
              ),
            }
          : current,
      );
      if (previousDetail) {
        queryClient.setQueryData<Vessel>(vesselKeys.detail(id), {
          ...previousDetail,
          ...input,
        });
      }

      // Returned as context so onError can put everything back exactly as it was.
      return { previousLists, previousDetail, id };
    },

    onError(_error, _variables, context) {
      if (!context) return;
      for (const [queryKey, data] of context.previousLists) {
        queryClient.setQueryData(queryKey, data);
      }
      if (context.previousDetail) {
        queryClient.setQueryData(vesselKeys.detail(context.id), context.previousDetail);
      }
    },

    // Runs after success and failure alike: the server is the authority on what
    // the record actually looks like now.
    onSettled: () => queryClient.invalidateQueries({ queryKey: vesselKeys.all }),
  });
}

export function useDeleteVessel() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => vesselsApi.remove(id),

    async onMutate(id) {
      await queryClient.cancelQueries({ queryKey: vesselKeys.lists() });
      const previousLists = queryClient.getQueriesData<Paginated<Vessel>>({
        queryKey: vesselKeys.lists(),
      });

      queryClient.setQueriesData<Paginated<Vessel>>({ queryKey: vesselKeys.lists() }, (current) =>
        current
          ? {
              ...current,
              items: current.items.filter((vessel) => vessel.id !== id),
              total: Math.max(0, current.total - 1),
            }
          : current,
      );

      return { previousLists };
    },

    onError(_error, _id, context) {
      if (!context) return;
      for (const [queryKey, data] of context.previousLists) {
        queryClient.setQueryData(queryKey, data);
      }
    },

    onSettled: () => queryClient.invalidateQueries({ queryKey: vesselKeys.all }),
  });
}
