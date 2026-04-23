import { describe, expect, it } from 'vitest';

import { buildMonthGrid, buildWeek } from './monthGrid';

describe('buildMonthGrid', () => {
  it('always returns six whole weeks so the grid height never changes', () => {
    for (const month of ['2024-02-01', '2024-06-15', '2025-03-09', '2024-09-30']) {
      const grid = buildMonthGrid(month, '2024-06-01');
      expect(grid).toHaveLength(6);
      expect(grid.every((week) => week.length === 7)).toBe(true);
    }
  });

  it('starts the grid on the Monday on or before the first of the month', () => {
    // 1 June 2024 is a Saturday, so the grid opens on Monday 27 May.
    const grid = buildMonthGrid('2024-06-10', '2024-06-01');

    expect(grid[0]?.[0]?.date).toBe('2024-05-27');
    expect(grid[0]?.[0]?.inMonth).toBe(false);
  });

  it('starts exactly on the first when the month already begins on a Monday', () => {
    // 1 July 2024 is a Monday: no leading days are borrowed.
    const grid = buildMonthGrid('2024-07-01', '2024-07-01');

    expect(grid[0]?.[0]?.date).toBe('2024-07-01');
    expect(grid[0]?.[0]?.inMonth).toBe(true);
  });

  it('runs consecutive days with no gaps or repeats across week boundaries', () => {
    const dates = buildMonthGrid('2024-06-01', '2024-06-01').flat().map((day) => day.date);

    expect(new Set(dates).size).toBe(42);
    expect(dates[0]).toBe('2024-05-27');
    expect(dates[41]).toBe('2024-07-07');
  });

  it('marks only days inside the anchor month as inMonth', () => {
    const grid = buildMonthGrid('2024-02-05', '2024-06-01');
    const inMonth = grid.flat().filter((day) => day.inMonth);

    // 2024 is a leap year.
    expect(inMonth).toHaveLength(29);
    expect(inMonth[0]?.date).toBe('2024-02-01');
    expect(inMonth.at(-1)?.date).toBe('2024-02-29');
  });

  it('marks today, and only today', () => {
    const marked = buildMonthGrid('2024-06-01', '2024-06-14')
      .flat()
      .filter((day) => day.isToday);

    expect(marked).toHaveLength(1);
    expect(marked[0]?.date).toBe('2024-06-14');
  });

  it('handles a month that needs leading days from the previous year', () => {
    // 1 January 2024 is a Monday; check the December 2023 boundary from the other side.
    const grid = buildMonthGrid('2023-12-01', '2024-06-01');

    expect(grid[0]?.[0]?.date).toBe('2023-11-27');
    expect(grid.flat().some((day) => day.date === '2023-12-31')).toBe(true);
  });
});

describe('buildWeek', () => {
  it('returns Monday to Sunday containing the anchor', () => {
    const week = buildWeek('2024-06-13', '2024-06-01');

    expect(week).toHaveLength(7);
    expect(week[0]?.date).toBe('2024-06-10');
    expect(week[6]?.date).toBe('2024-06-16');
  });

  it('treats Sunday as the last day of its week, not the first', () => {
    // 16 June 2024 is a Sunday.
    const week = buildWeek('2024-06-16', '2024-06-01');

    expect(week[0]?.date).toBe('2024-06-10');
    expect(week[6]?.date).toBe('2024-06-16');
  });

  it('spans a month boundary without resetting', () => {
    const week = buildWeek('2024-07-31', '2024-06-01');

    expect(week[0]?.date).toBe('2024-07-29');
    expect(week[6]?.date).toBe('2024-08-04');
    expect(week.filter((day) => day.inMonth)).toHaveLength(3);
  });
});
