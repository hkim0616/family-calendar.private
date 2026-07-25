/**
 * Date helpers for the schedule screens.
 *
 * A note on how event times are stored, because it drives everything here:
 *
 *   - A **timed** event stores a real instant. It's displayed and grouped in
 *     the viewer's local timezone.
 *   - An **all-day** event stores UTC midnight of its first day, and UTC
 *     midnight of its last day (inclusive). Using UTC for these keeps the date
 *     stable: if we stored local midnight, someone in Seoul creating "1 Aug"
 *     would have it read as 31 July for anyone west of them.
 *
 * So all-day events are grouped by their *UTC* date, timed events by their
 * *local* date. That's the one asymmetry worth remembering.
 */

export type CalendarEvent = {
  id: string;
  title: string;
  starts_at: string;
  ends_at: string;
  all_day: boolean;
  note: string | null;
};

/** "2026-07-25" from a Date, in local time. */
export function localDayKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** "2026-07-25" from a Date, in UTC. */
export function utcDayKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Local midnight for a "2026-07-25" key. */
export function dayKeyToDate(key: string): Date {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

/** UTC midnight for a "2026-07-25" key — used when saving all-day events. */
export function dayKeyToUtcDate(key: string): Date {
  return new Date(`${key}T00:00:00.000Z`);
}

export function todayKey(now: Date = new Date()): string {
  return localDayKey(now);
}

/**
 * Every day an event occupies, as day keys. A single-day event yields one key;
 * a three-day trip yields three, so it appears on each day of the month grid.
 */
export function eventDayKeys(event: CalendarEvent): string[] {
  const start = new Date(event.starts_at);
  const end = new Date(event.ends_at);
  if (Number.isNaN(start.getTime())) return [];

  const keyOf = event.all_day ? utcDayKey : localDayKey;
  const startKey = keyOf(start);

  let endKey: string;
  if (Number.isNaN(end.getTime())) {
    endKey = startKey;
  } else if (!event.all_day && end.getTime() > start.getTime()) {
    // A timed event's end is exclusive: something running 23:00–00:00 belongs
    // to one day, not two. Step back an instant before taking the day key.
    endKey = keyOf(new Date(end.getTime() - 1));
  } else {
    endKey = keyOf(end);
  }

  if (endKey <= startKey) return [startKey];

  const keys: string[] = [];
  // Step a day at a time in whichever calendar the event is anchored to.
  const cursor = event.all_day
    ? dayKeyToUtcDate(startKey)
    : dayKeyToDate(startKey);

  // Guard against a runaway loop from absurd data.
  for (let i = 0; i < 400; i++) {
    const key = keyOf(cursor);
    keys.push(key);
    if (key >= endKey) break;
    if (event.all_day) cursor.setUTCDate(cursor.getUTCDate() + 1);
    else cursor.setDate(cursor.getDate() + 1);
  }
  return keys;
}

/** Groups events by day key, each day's list sorted by start time. */
export function groupByDay(
  events: CalendarEvent[],
): Map<string, CalendarEvent[]> {
  const map = new Map<string, CalendarEvent[]>();
  for (const event of events) {
    for (const key of eventDayKeys(event)) {
      const list = map.get(key);
      if (list) list.push(event);
      else map.set(key, [event]);
    }
  }
  for (const list of map.values()) {
    list.sort((a, b) => {
      // All-day events read best at the top of a day.
      if (a.all_day !== b.all_day) return a.all_day ? -1 : 1;
      return a.starts_at.localeCompare(b.starts_at);
    });
  }
  return map;
}

export type MonthCell = { key: string; date: Date; inMonth: boolean };

/**
 * Cells for a month grid, Sunday-first, padded out to whole weeks.
 *
 * Only as many weeks as the month actually needs, so short months don't leave a
 * dead row of greyed-out dates taking up phone screen.
 */
export function monthMatrix(year: number, monthIndex: number): MonthCell[] {
  const first = new Date(year, monthIndex, 1);
  const leading = first.getDay(); // 0 = Sunday
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
  const weeks = Math.ceil((leading + daysInMonth) / 7);

  const cells: MonthCell[] = [];
  for (let i = 0; i < weeks * 7; i++) {
    const date = new Date(year, monthIndex, 1 - leading + i);
    cells.push({
      key: localDayKey(date),
      date,
      inMonth: date.getMonth() === monthIndex,
    });
  }
  return cells;
}

/** Shifts a year/month pair by whole months, rolling the year over. */
export function shiftMonth(
  year: number,
  monthIndex: number,
  delta: number,
): { year: number; monthIndex: number } {
  const d = new Date(year, monthIndex + delta, 1);
  return { year: d.getFullYear(), monthIndex: d.getMonth() };
}
