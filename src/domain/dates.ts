import type { IsoDate } from './types';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

// Parses via `Date.UTC` rather than `new Date(iso)` so every calculation stays
// in one timezone, avoiding the usual off-by-one-day bugs.
function toUtcMillis(iso: IsoDate): number {
  return Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10)));
}

function fromUtcMillis(millis: number): IsoDate {
  return new Date(millis).toISOString().slice(0, 10);
}

/** Whole days from `from` to `to`; negative when `to` is earlier. */
export function daysBetween(from: IsoDate, to: IsoDate): number {
  return Math.round((toUtcMillis(to) - toUtcMillis(from)) / MS_PER_DAY);
}

export function addDays(iso: IsoDate, days: number): IsoDate {
  return fromUtcMillis(toUtcMillis(iso) + days * MS_PER_DAY);
}

// Business rules never call this — they take `today` as an argument so they
// stay testable without mocking the clock. This is for callers at the edge.
export function todayIso(): IsoDate {
  const now = new Date();
  return fromUtcMillis(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
}

/** 0 = Sunday, matching `Date.prototype.getDay`. */
export function dayOfWeek(iso: IsoDate): number {
  return new Date(toUtcMillis(iso)).getUTCDay();
}

export function startOfMonth(iso: IsoDate): IsoDate {
  return `${iso.slice(0, 7)}-01`;
}

/** Clamps to the last day of the target month, so 31 Jan + 1 month is 28/29 Feb. */
export function addMonths(iso: IsoDate, months: number): IsoDate {
  const year = Number(iso.slice(0, 4));
  const monthIndex = Number(iso.slice(5, 7)) - 1;
  const day = Number(iso.slice(8, 10));

  const target = new Date(Date.UTC(year, monthIndex + months, 1));
  const daysInTargetMonth = new Date(
    Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0),
  ).getUTCDate();

  return fromUtcMillis(
    Date.UTC(target.getUTCFullYear(), target.getUTCMonth(), Math.min(day, daysInTargetMonth)),
  );
}

/** `YYYY-MM`, the bucket key for grouping by month. */
export function monthKey(iso: IsoDate): string {
  return iso.slice(0, 7);
}
