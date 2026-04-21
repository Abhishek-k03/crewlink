// @vitest-environment jsdom
import 'fake-indexeddb/auto';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { setupServer } from 'msw/node';
import type { ReactNode } from 'react';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { apiConfig, type Paginated } from '@/api/client';
import { vesselsApi } from '@/api/vessels';
import { ensureSeeded } from '@/db/seed';
import type { Vessel } from '@/domain/types';
import { handlers } from '@/mocks/handlers';
import { networkSimulation } from '@/mocks/network';

import { vesselKeys } from './queryKeys';
import { useUpdateVessel } from './useVessels';

const server = setupServer(...handlers);

let queryClient: QueryClient;
let vessel: Vessel;

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

/** The cached list the optimistic update is expected to patch and then restore. */
function cachedList(): Paginated<Vessel> | undefined {
  return queryClient.getQueryData<Paginated<Vessel>>(vesselKeys.list({}));
}

beforeAll(async () => {
  server.listen({ onUnhandledRequest: 'error' });
  apiConfig.baseUrl = 'http://localhost/api';
  networkSimulation.latencyMinMs = 0;
  networkSimulation.latencyMaxMs = 0;
  networkSimulation.writeFailureRate = 0;

  await ensureSeeded();
  const first = (await vesselsApi.list({ pageSize: 1 })).items[0];
  if (!first) throw new Error('Seed produced no vessels');
  vessel = first;
});

beforeEach(() => {
  queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  queryClient.setQueryData<Paginated<Vessel>>(vesselKeys.list({}), {
    items: [{ ...vessel }],
    total: 1,
    page: 1,
    pageSize: 25,
  });
});

afterAll(() => {
  networkSimulation.writeFailureRate = 0;
  server.close();
});

describe('useUpdateVessel', () => {
  it('applies the change to the cached list on success', async () => {
    networkSimulation.writeFailureRate = 0;
    const { result } = renderHook(() => useUpdateVessel(), { wrapper });

    await result.current.mutateAsync({ id: vessel.id, input: { name: 'MV Renamed' } });

    await waitFor(() => {
      expect(cachedList()?.items[0]?.name).toBe('MV Renamed');
    });

    // Put the seeded name back so the shared database stays as the other tests expect.
    await vesselsApi.update(vessel.id, { name: vessel.name });
  });

  it('restores the cache exactly when the write fails', async () => {
    networkSimulation.writeFailureRate = 1;
    const { result } = renderHook(() => useUpdateVessel(), { wrapper });

    const before = cachedList();

    await expect(
      result.current.mutateAsync({ id: vessel.id, input: { name: 'MV Never Applied' } }),
    ).rejects.toThrow();

    networkSimulation.writeFailureRate = 0;

    // The optimistic patch is undone: not merely absent, but byte-identical to
    // what was cached beforehand.
    expect(cachedList()).toEqual(before);
    expect(cachedList()?.items[0]?.name).toBe(vessel.name);
  });

  it('leaves the server unchanged when the write fails', async () => {
    networkSimulation.writeFailureRate = 1;
    const { result } = renderHook(() => useUpdateVessel(), { wrapper });

    await expect(
      result.current.mutateAsync({ id: vessel.id, input: { name: 'MV Never Applied' } }),
    ).rejects.toThrow();

    networkSimulation.writeFailureRate = 0;

    expect((await vesselsApi.get(vessel.id)).name).toBe(vessel.name);
  });
});
