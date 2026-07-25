/**
 * Recurring yearly dates — birthdays, wedding anniversaries and the like.
 *
 * Everything here works on "YYYY-MM-DD" strings rather than Date objects.
 * That's deliberate: an anniversary is a date on a calendar, not an instant in
 * time, and the `date` column stores it that way. Converting to Date and back
 * is how these end up a day out for anyone not in UTC.
 */

export type Anniversary = {
  id: string;
  title: string;
  /** The original date, e.g. a birth date: "1990-05-05". */
  date: string;
  remind_days_before: number;
};

const DAY_MS = 86_400_000;

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/** Today as a "YYYY-MM-DD" key in the viewer's own timezone. */
export function todayKey(now: Date = new Date()): string {
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/**
 * Whole days from one day key to another. Computed at UTC midnight so a
 * daylight-saving change in between can't make it 23 or 25 hours and round to
 * the wrong number.
 */
export function daysBetween(fromKey: string, toKey: string): number {
  const [fy, fm, fd] = fromKey.split("-").map(Number);
  const [ty, tm, td] = toKey.split("-").map(Number);
  const from = Date.UTC(fy, (fm ?? 1) - 1, fd ?? 1);
  const to = Date.UTC(ty, (tm ?? 1) - 1, td ?? 1);
  return Math.round((to - from) / DAY_MS);
}

/**
 * The next time this date comes round, on or after `from`.
 *
 * 29 February is the awkward one: in a non-leap year it's observed on the 28th,
 * which is the common convention and keeps the anniversary inside the same
 * month.
 */
export function nextOccurrence(
  date: string,
  fromKey: string = todayKey(),
): string {
  const [, monthStr, dayStr] = date.split("-");
  const month = Number(monthStr);
  const day = Number(dayStr);
  if (!month || !day) return fromKey;

  const observedIn = (year: number): string => {
    const observedDay =
      month === 2 && day === 29 && !isLeapYear(year) ? 28 : day;
    return `${year}-${pad(month)}-${pad(observedDay)}`;
  };

  const fromYear = Number(fromKey.slice(0, 4));
  const thisYear = observedIn(fromYear);
  // String comparison is safe on zero-padded ISO dates.
  return thisYear >= fromKey ? thisYear : observedIn(fromYear + 1);
}

/** Whole days until the next occurrence. 0 means today. */
export function daysUntilNext(
  date: string,
  fromKey: string = todayKey(),
): number {
  return daysBetween(fromKey, nextOccurrence(date, fromKey));
}

/**
 * Which anniversary this will be — a 1990 birth date turning up in 2026 gives
 * 36. Returns null when the stored date is in the same year or later, where a
 * count would be meaningless.
 */
export function yearsAtNext(
  date: string,
  fromKey: string = todayKey(),
): number | null {
  const originalYear = Number(date.slice(0, 4));
  const occurrenceYear = Number(nextOccurrence(date, fromKey).slice(0, 4));
  const years = occurrenceYear - originalYear;
  return years > 0 ? years : null;
}

/** True when the next occurrence is inside its own reminder window. */
export function isWithinReminder(
  anniversary: Anniversary,
  fromKey: string = todayKey(),
): boolean {
  const days = daysUntilNext(anniversary.date, fromKey);
  return days <= anniversary.remind_days_before;
}

/** "Today", "Tomorrow", "in 6 days", "in 3 weeks". */
export function countdownLabel(days: number): string {
  if (days <= 0) return "Today";
  if (days === 1) return "Tomorrow";
  if (days < 14) return `in ${days} days`;
  if (days < 60) {
    const weeks = Math.round(days / 7);
    return `in ${weeks} weeks`;
  }
  const months = Math.round(days / 30);
  return `in ${months} months`;
}

/** Soonest first. */
export function sortByUpcoming(
  list: Anniversary[],
  fromKey: string = todayKey(),
): Anniversary[] {
  return [...list].sort((a, b) => {
    const diff =
      daysUntilNext(a.date, fromKey) - daysUntilNext(b.date, fromKey);
    return diff !== 0 ? diff : a.title.localeCompare(b.title);
  });
}

/** Anniversaries falling within the next `withinDays` days, soonest first. */
export function upcoming(
  list: Anniversary[],
  withinDays: number,
  fromKey: string = todayKey(),
): Anniversary[] {
  return sortByUpcoming(
    list.filter((a) => daysUntilNext(a.date, fromKey) <= withinDays),
    fromKey,
  );
}
