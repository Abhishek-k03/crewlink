import { daysBetween } from './dates';
import { EXPIRING_SOON_DAYS } from './reporting';
import { getOverdueDays } from './rules';
import type { Assignment, Certification, CrewMember, IsoDate } from './types';

export type NotificationSeverity = 'critical' | 'warning' | 'info';

export interface Notification {
  /** Derived from the record it concerns, not random, so a dismissal survives reloads. */
  id: string;
  severity: NotificationSeverity;
  title: string;
  description: string;
  href: string;
}

/** Rotations starting within this window are worth flagging as upcoming. */
const UPCOMING_DAYS = 7;
const MAX_NOTIFICATIONS = 50;

const SEVERITY_ORDER: Record<NotificationSeverity, number> = {
  critical: 0,
  warning: 1,
  info: 2,
};

// Computed from current data rather than stored — an expiring certificate is a
// fact that's true right now, not an event, so there's no notifications table
// to keep in sync. Only dismissals are persisted, client-side, since they're
// per-viewer. This can't cover "assignment changed" — that's a real event and
// would need an audit log (see README's future work).
export function buildNotifications(
  assignments: readonly Assignment[],
  certifications: readonly Certification[],
  crew: readonly CrewMember[],
  today: IsoDate,
): Notification[] {
  const nameOf = new Map(crew.map((member) => [member.id, member.name]));
  const notifications: Notification[] = [];

  for (const assignment of assignments) {
    const overdue = getOverdueDays(assignment, today);
    if (overdue > 0) {
      notifications.push({
        id: `rotation-overdue:${assignment.id}`,
        severity: 'critical',
        title: 'Rotation overdue',
        description: `${nameOf.get(assignment.crewId) ?? 'A crew member'} should have signed off ${overdue} day${overdue === 1 ? '' : 's'} ago.`,
        href: `/crew/${assignment.crewId}`,
      });
      continue;
    }

    if (assignment.status === 'Planned') {
      const until = daysBetween(today, assignment.signOnDate);
      if (until >= 0 && until <= UPCOMING_DAYS) {
        notifications.push({
          id: `rotation-upcoming:${assignment.id}`,
          severity: 'info',
          title: 'Rotation starting soon',
          description: `${nameOf.get(assignment.crewId) ?? 'A crew member'} signs on in ${until} day${until === 1 ? '' : 's'} at ${assignment.port}.`,
          href: '/calendar',
        });
      }
    }
  }

  for (const certification of certifications) {
    const days = daysBetween(today, certification.expiryDate);
    const holder = nameOf.get(certification.crewId) ?? 'A crew member';

    if (days < 0) {
      notifications.push({
        id: `certification-expired:${certification.id}`,
        severity: 'critical',
        title: `${certification.type} expired`,
        description: `${holder}'s ${certification.type} expired ${Math.abs(days)} days ago.`,
        href: `/crew/${certification.crewId}`,
      });
    } else if (days <= EXPIRING_SOON_DAYS) {
      notifications.push({
        id: `certification-expiring:${certification.id}`,
        severity: 'warning',
        title: `${certification.type} expiring`,
        description: `${holder}'s ${certification.type} expires in ${days} day${days === 1 ? '' : 's'}.`,
        href: `/crew/${certification.crewId}`,
      });
    }
  }

  // Most severe first, then stable by id so the order does not shuffle between
  // requests and make the list feel unreliable.
  notifications.sort(
    (a, b) =>
      SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] || a.id.localeCompare(b.id),
  );

  return notifications.slice(0, MAX_NOTIFICATIONS);
}
