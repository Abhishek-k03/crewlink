import { ChevronLeft, ChevronRight } from 'lucide-react';
import { type ReactNode, useMemo } from 'react';

import { Button } from '@/components/ui/Button';
import { addDays, addMonths, startOfMonth } from '@/domain/dates';
import type { IsoDate } from '@/domain/types';

import { buildMonthGrid, buildWeek, type CalendarDay, WEEKDAY_LABELS } from './monthGrid';

export type CalendarView = 'month' | 'week';

interface CalendarProps<TEvent> {
  events: readonly TEvent[];
  /** How to read a date off an event. Keeps the calendar ignorant of the domain. */
  getEventDate: (event: TEvent) => IsoDate;
  renderEvent: (event: TEvent) => ReactNode;
  today: IsoDate;
  anchor: IsoDate;
  onAnchorChange: (anchor: IsoDate) => void;
  view: CalendarView;
  onViewChange: (view: CalendarView) => void;
  selectedDate?: IsoDate;
  onSelectDate?: (date: IsoDate) => void;
  /** Shown per day when there are more events than fit. */
  maxEventsPerDay?: number;
}

const MONTH_LABEL = new Intl.DateTimeFormat('en-GB', {
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
});
const DAY_LABEL = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  timeZone: 'UTC',
});

function toUtcDate(iso: IsoDate): Date {
  return new Date(`${iso}T00:00:00Z`);
}

export function Calendar<TEvent>({
  events,
  getEventDate,
  renderEvent,
  today,
  anchor,
  onAnchorChange,
  view,
  onViewChange,
  selectedDate,
  onSelectDate,
  maxEventsPerDay = 3,
}: CalendarProps<TEvent>) {
  // Bucketing once beats scanning every event for each of 42 cells.
  const eventsByDate = useMemo(() => {
    const buckets = new Map<IsoDate, TEvent[]>();
    for (const event of events) {
      const date = getEventDate(event);
      const bucket = buckets.get(date);
      if (bucket) bucket.push(event);
      else buckets.set(date, [event]);
    }
    return buckets;
  }, [events, getEventDate]);

  const weeks: CalendarDay[][] =
    view === 'month' ? buildMonthGrid(anchor, today) : [buildWeek(anchor, today)];

  const step = (direction: number) => {
    onAnchorChange(
      view === 'month'
        ? startOfMonth(addMonths(anchor, direction))
        : addDays(anchor, direction * 7),
    );
  };

  const heading =
    view === 'month'
      ? MONTH_LABEL.format(toUtcDate(anchor))
      : `Week of ${DAY_LABEL.format(toUtcDate(buildWeek(anchor, today)[0]?.date ?? anchor))}`;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Button variant="ghost" onClick={() => step(-1)} aria-label="Previous period">
            <ChevronLeft className="size-4" aria-hidden />
          </Button>
          <h2 className="min-w-40 text-center font-semibold">{heading}</h2>
          <Button variant="ghost" onClick={() => step(1)} aria-label="Next period">
            <ChevronRight className="size-4" aria-hidden />
          </Button>
          <Button variant="secondary" onClick={() => onAnchorChange(today)}>
            Today
          </Button>
        </div>

        <div className="flex gap-1" role="group" aria-label="Calendar view">
          {(['month', 'week'] as const).map((option) => (
            <Button
              key={option}
              variant={view === option ? 'primary' : 'ghost'}
              onClick={() => onViewChange(option)}
              aria-pressed={view === option}
              className="capitalize"
            >
              {option}
            </Button>
          ))}
        </div>
      </div>

      <div className="overflow-x-auto">
        <div className="min-w-[44rem]">
          <div className="grid grid-cols-7 gap-px">
            {WEEKDAY_LABELS.map((label) => (
              <div key={label} className="px-2 py-1.5 text-xs font-medium text-muted">
                {label}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-px overflow-hidden rounded-lg border border-line bg-line">
            {weeks.flat().map((day) => {
              const dayEvents = eventsByDate.get(day.date) ?? [];
              const hidden = Math.max(0, dayEvents.length - maxEventsPerDay);
              const isSelected = day.date === selectedDate;

              return (
                <button
                  key={day.date}
                  type="button"
                  onClick={() => onSelectDate?.(day.date)}
                  aria-label={`${day.date}, ${dayEvents.length} movement${dayEvents.length === 1 ? '' : 's'}`}
                  aria-pressed={isSelected}
                  className={[
                    'flex min-h-24 flex-col items-stretch gap-1 p-1.5 text-left transition-colors',
                    view === 'week' ? 'min-h-48' : '',
                    day.inMonth ? 'bg-surface' : 'bg-elevated/60 text-muted',
                    isSelected ? 'ring-2 ring-accent ring-inset' : '',
                  ].join(' ')}
                >
                  <span
                    className={[
                      'self-start rounded px-1 text-xs font-medium tabular-nums',
                      day.isToday ? 'bg-primary text-on-primary' : '',
                    ].join(' ')}
                  >
                    {Number(day.date.slice(8, 10))}
                  </span>

                  {dayEvents.slice(0, maxEventsPerDay).map((event, index) => (
                    <span key={index} className="block">
                      {renderEvent(event)}
                    </span>
                  ))}

                  {hidden > 0 && <span className="text-xs text-muted">+{hidden} more</span>}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
