import { AlertTriangle, Bell, Info, X } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';

import { Button } from '@/components/ui/Button';
import type { NotificationSeverity } from '@/domain/notifications';
import { useNotifications } from '@/hooks/useNotifications';

const SEVERITY_ICON: Record<NotificationSeverity, typeof Info> = {
  critical: AlertTriangle,
  warning: AlertTriangle,
  info: Info,
};

const SEVERITY_COLOR: Record<NotificationSeverity, string> = {
  critical: 'text-danger',
  warning: 'text-warn',
  info: 'text-brand',
};

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const { notifications, dismiss, dismissAll } = useNotifications();

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="relative rounded-md p-2 transition-colors hover:bg-elevated"
        aria-label={`Notifications${notifications.length > 0 ? `, ${notifications.length} unread` : ''}`}
        aria-expanded={open}
      >
        <Bell className="size-5" aria-hidden />
        {notifications.length > 0 && (
          <span className="absolute top-1 right-1 flex min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[0.625rem] font-semibold text-white tabular-nums">
            {notifications.length > 99 ? '99+' : notifications.length}
          </span>
        )}
      </button>

      {open && (
        <>
          {/* Click-away target. Rendered as a button so Escape-free dismissal
              still works for keyboard users tabbing past it. */}
          <button
            type="button"
            className="fixed inset-0 z-40 cursor-default"
            onClick={() => setOpen(false)}
            aria-label="Close notifications"
          />

          <div className="absolute right-0 z-50 mt-2 flex max-h-96 w-80 flex-col rounded-lg border border-line bg-surface shadow-lg">
            <div className="flex items-center justify-between border-b border-line px-3 py-2">
              <h2 className="text-sm font-semibold">Notifications</h2>
              {notifications.length > 0 && (
                <Button variant="ghost" onClick={dismissAll} className="px-2 py-1 text-xs">
                  Dismiss all
                </Button>
              )}
            </div>

            {notifications.length === 0 ? (
              <p className="px-3 py-8 text-center text-sm text-muted">Nothing needs attention.</p>
            ) : (
              <ul className="overflow-y-auto">
                {notifications.map((notification) => {
                  const Icon = SEVERITY_ICON[notification.severity];
                  return (
                    <li
                      key={notification.id}
                      className="flex items-start gap-2 border-b border-line p-3 last:border-0"
                    >
                      <Icon
                        className={`mt-0.5 size-4 shrink-0 ${SEVERITY_COLOR[notification.severity]}`}
                        aria-hidden
                      />
                      <div className="min-w-0 flex-1">
                        <Link
                          to={notification.href}
                          onClick={() => setOpen(false)}
                          className="text-sm font-medium hover:underline"
                        >
                          {notification.title}
                        </Link>
                        <p className="text-xs text-muted">{notification.description}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => dismiss(notification.id)}
                        className="rounded p-0.5 transition-colors hover:bg-elevated"
                        aria-label={`Dismiss: ${notification.title}`}
                      >
                        <X className="size-3.5" aria-hidden />
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </>
      )}
    </div>
  );
}
