// @vitest-environment jsdom
import 'fake-indexeddb/auto';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { setupServer } from 'msw/node';
import type { ReactNode } from 'react';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { assignmentsApi } from '@/api/assignments';
import { apiConfig, type Paginated } from '@/api/client';
import { ensureSeeded } from '@/db/seed';
import type { Assignment } from '@/domain/types';
import { handlers } from '@/mocks/handlers';
import { networkSimulation } from '@/mocks/network';

import { assignmentKeys } from './queryKeys';
import { useUpdateAssignmentStatus } from './useUpdateAssignmentStatus';

// Drag-and-drop itself can't be exercised in jsdom — dnd-kit needs real pointer
// geometry. What's testable is the consequence: an instant patch, undone on failure.
const server = setupServer(...handlers);
const LIST_PARAMS = { pageSize: 300 };

let queryClient: QueryClient;
let assignment: Assignment;

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

function cachedBoard(): Paginated<Assignment> | undefined {
  return queryClient.getQueryData<Paginated<Assignment>>(assignmentKeys.list(LIST_PARAMS));
}

function cardStatus(): string | undefined {
  return cachedBoard()?.items.find((item) => item.id === assignment.id)?.status;
}

beforeAll(async () => {
  server.listen({ onUnhandledRequest: 'error' });
  apiConfig.baseUrl = 'http://localhost/api';
  networkSimulation.latencyMinMs = 0;
  networkSimulation.latencyMaxMs = 0;
  networkSimulation.writeFailureRate = 0;

  await ensureSeeded();
  const planned = (await assignmentsApi.list({ status: 'Planned', pageSize: 1 })).items[0];
  if (!planned) throw new Error('Seed produced no planned rotations');
  assignment = planned;
});

beforeEach(() => {
  queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  queryClient.setQueryData<Paginated<Assignment>>(assignmentKeys.list(LIST_PARAMS), {
    items: [{ ...assignment }],
    total: 1,
    page: 1,
    pageSize: 300,
  });
});

afterAll(() => {
  networkSimulation.writeFailureRate = 0;
  server.close();
});

describe('moving a rotation between columns', () => {
  it('moves the card to the new column when the write succeeds', async () => {
    networkSimulation.writeFailureRate = 0;
    const { result } = renderHook(() => useUpdateAssignmentStatus(), { wrapper });

    await result.current.mutateAsync({ id: assignment.id, status: 'Active' });

    await waitFor(() => {
      expect(cardStatus()).toBe('Active');
    });

    await assignmentsApi.update(assignment.id, { status: assignment.status });
  });

  it('puts the card back in its original column when the write fails', async () => {
    networkSimulation.writeFailureRate = 1;
    const { result } = renderHook(() => useUpdateAssignmentStatus(), { wrapper });

    const before = cachedBoard();

    await expect(
      result.current.mutateAsync({ id: assignment.id, status: 'Completed' }),
    ).rejects.toThrow();

    networkSimulation.writeFailureRate = 0;

    expect(cachedBoard()).toEqual(before);
    expect(cardStatus()).toBe(assignment.status);
  });

  it('leaves the stored rotation untouched when the write fails', async () => {
    networkSimulation.writeFailureRate = 1;
    const { result } = renderHook(() => useUpdateAssignmentStatus(), { wrapper });

    await expect(
      result.current.mutateAsync({ id: assignment.id, status: 'Completed' }),
    ).rejects.toThrow();

    networkSimulation.writeFailureRate = 0;

    expect((await assignmentsApi.get(assignment.id)).status).toBe(assignment.status);
  });
});
