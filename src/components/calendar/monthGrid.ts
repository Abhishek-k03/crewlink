import { addDays, dayOfWeek, startOfMonth } from '@/domain/dates';
import type { IsoDate } from '@/domain/types';

export interface CalendarDay {
  date: IsoDate;
  /** False for the leading and trailing days borrowed from adjacent months. */
  inMonth: boolean;
  isToday: boolean;
}

/** Monday-first, which is the convention in shipping and most of Europe. */
export const WEEKDAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;

const WEEK_STARTS_ON = 1;

// Builds the day grid for the month containing `anchor`, padded to whole weeks.
// A pure function over IsoDate strings, not a hook over Date objects, so the
// arithmetic can be tested without rendering anything.
export function buildMonthGrid(anchor: IsoDate, today: IsoDate): CalendarDay[][] {
  const first = startOfMonth(anchor);
  const month = first.slice(0, 7);

  // Step back to the start of the week containing the 1st.
  const leadingDays = (dayOfWeek(first) - WEEK_STARTS_ON + 7) % 7;
  const gridStart = addDays(first, -leadingDays);

  const weeks: CalendarDay[][] = [];
  let cursor = gridStart;

  // Six rows always, so the grid does not change height between months and the
  // page does not jump when navigating.
  for (let week = 0; week < 6; week += 1) {
    const days: CalendarDay[] = [];
    for (let day = 0; day < 7; day += 1) {
      days.push({ date: cursor, inMonth: cursor.slice(0, 7) === month, isToday: cursor === today });
      cursor = addDays(cursor, 1);
    }
    weeks.push(days);
  }

  return weeks;
}

/** The seven days of the week containing `anchor`. */
export function buildWeek(anchor: IsoDate, today: IsoDate): CalendarDay[] {
  const offset = (dayOfWeek(anchor) - WEEK_STARTS_ON + 7) % 7;
  const weekStart = addDays(anchor, -offset);
  const month = startOfMonth(anchor).slice(0, 7);

  return Array.from({ length: 7 }, (_unused, index) => {
    const date = addDays(weekStart, index);
    return { date, inMonth: date.slice(0, 7) === month, isToday: date === today };
  });
}
