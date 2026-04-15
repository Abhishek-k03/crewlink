import { describe, expect, it } from 'vitest';

import { makeAssignment, makeCertification, makeCrewMember } from '@/test/factories';

import { addDays } from './dates';
import { buildNotifications } from './notifications';

const TODAY = '2024-06-15';

describe('buildNotifications', () => {
  it('flags an overdue rotation and names the crew member', () => {
    const member = makeCrewMember({ name: 'Ariel Santos' });
    const assignment = makeAssignment({
      crewId: member.id,
      status: 'Active',
      signOffDate: addDays(TODAY, -3),
    });

    const [notification] = buildNotifications([assignment], [], [member], TODAY);

    expect(notification?.severity).toBe('critical');
    expect(notification?.description).toContain('Ariel Santos');
    expect(notification?.description).toContain('3 days ago');
  });

  it('does not raise both an overdue and an upcoming alert for one rotation', () => {
    const assignment = makeAssignment({ status: 'Active', signOffDate: addDays(TODAY, -1) });

    expect(buildNotifications([assignment], [], [], TODAY)).toHaveLength(1);
  });

  it('flags a rotation starting within the week, but not one further out', () => {
    const soon = makeAssignment({ status: 'Planned', signOnDate: addDays(TODAY, 3) });
    const later = makeAssignment({ status: 'Planned', signOnDate: addDays(TODAY, 30) });

    const notifications = buildNotifications([soon, later], [], [], TODAY);

    expect(notifications).toHaveLength(1);
    expect(notifications[0]?.id).toContain(soon.id);
  });

  it('separates expired certificates from expiring ones', () => {
    const expired = makeCertification({ type: 'STCW', expiryDate: addDays(TODAY, -5) });
    const expiring = makeCertification({ type: 'GMDSS', expiryDate: addDays(TODAY, 10) });
    const fine = makeCertification({ type: 'Passport', expiryDate: addDays(TODAY, 400) });

    const notifications = buildNotifications([], [expired, expiring, fine], [], TODAY);

    expect(notifications).toHaveLength(2);
    expect(notifications[0]?.severity).toBe('critical');
    expect(notifications[1]?.severity).toBe('warning');
  });

  it('orders the most severe first', () => {
    const upcoming = makeAssignment({ status: 'Planned', signOnDate: addDays(TODAY, 1) });
    const expiring = makeCertification({ expiryDate: addDays(TODAY, 10) });
    const overdue = makeAssignment({ status: 'Active', signOffDate: addDays(TODAY, -1) });

    const severities = buildNotifications(
      [upcoming, overdue],
      [expiring],
      [],
      TODAY,
    ).map((notification) => notification.severity);

    expect(severities).toEqual(['critical', 'warning', 'info']);
  });

  it('derives ids from the record so a dismissal can persist', () => {
    const certification = makeCertification({ expiryDate: addDays(TODAY, 10) });

    const first = buildNotifications([], [certification], [], TODAY);
    const second = buildNotifications([], [certification], [], TODAY);

    expect(first[0]?.id).toBe(second[0]?.id);
    expect(first[0]?.id).toContain(certification.id);
  });
});
