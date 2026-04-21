import { useQuery } from '@tanstack/react-query';
import { useCallback, useMemo, useState } from 'react';

import { apiClient } from '@/api/client';
import type { Notification } from '@/domain/notifications';

const DISMISSED_KEY = 'crewlink.dismissedNotifications';

function readDismissed(): Set<string> {
  try {
    const raw = localStorage.getItem(DISMISSED_KEY);
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}

// Notifications are derived server-side; dismissals are per-viewer state and
// stay client-side, so one person dismissing an alert doesn't hide it from everyone.
export function useNotifications() {
  const [dismissed, setDismissed] = useState<Set<string>>(readDismissed);

  const query = useQuery({
    queryKey: ['notifications'] as const,
    queryFn: () => apiClient.get<Notification[]>('/notifications'),
    staleTime: 60_000,
  });

  const dismiss = useCallback((id: string) => {
    setDismissed((current) => {
      const next = new Set(current).add(id);
      try {
        localStorage.setItem(DISMISSED_KEY, JSON.stringify([...next]));
      } catch {
        // Dismissal is lost on reload, but the panel still updates now.
      }
      return next;
    });
  }, []);

  const dismissAll = useCallback(() => {
    const ids = (query.data ?? []).map((notification) => notification.id);
    setDismissed((current) => {
      const next = new Set([...current, ...ids]);
      try {
        localStorage.setItem(DISMISSED_KEY, JSON.stringify([...next]));
      } catch {
        // As above.
      }
      return next;
    });
  }, [query.data]);

  const visible = useMemo(
    () => (query.data ?? []).filter((notification) => !dismissed.has(notification.id)),
    [query.data, dismissed],
  );

  return { notifications: visible, dismiss, dismissAll, isPending: query.isPending };
}
