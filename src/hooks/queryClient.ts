import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Seeded data only changes when this app changes it, so there's no need
      // to refetch aggressively.
      staleTime: 30_000,
      refetchOnWindowFocus: false,
      retry: 1,
    },
    mutations: {
      // No retry — the mock API fails ~7% of writes on purpose, and silently
      // retrying would hide the rollback behaviour this project demonstrates.
      retry: 0,
    },
  },
});
