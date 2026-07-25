/**
 * Builds an iCalendar (.ics) feed — RFC 5545.
 *
 * Hand-rolled rather than pulled from a library because the format has a few
 * unforgiving rules, and a feed that breaks one of them doesn't error: Apple
 * Calendar just silently refuses to subscribe. The rules that matter here:
 *
 *   - Lines end with CRLF, not LF.
 *   - No line may exceed 75 octets; longer ones are "folded" onto continuation
 *     lines that begin with a single space.
 *   - In TEXT values, backslash, semicolon and comma must be escaped, and
 *     newlines become a literal \n.
 *   - Timed events are emitted in UTC ("...Z") so no VTIMEZONE is needed.
 *   - All-day events use VALUE=DATE, and DTEND is *exclusive* — the day after
 *     the last day.
 *
 * See ics.test.ts, which checks each of those.
 */

export type IcsEvent = {
  id: string;
  title: string;
  /** ISO timestamp. For all-day events this is UTC midnight of the first day. */
  startsAt: string;
  /** ISO timestamp. For all-day events this is UTC midnight of the last day. */
  endsAt: string;
  allDay: boolean;
  note?: string | null;
  updatedAt?: string | null;
};

const CRLF = "\r\n";

/** Escapes a TEXT value. Order matters: backslashes first. */
export function escapeText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r\n|\r|\n/g, "\\n");
}

/**
 * Folds a content line to 75 octets, never splitting a multi-byte character.
 * Continuation lines start with a space, which itself counts toward the limit.
 */
export function foldLine(line: string): string {
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  const bytes = encoder.encode(line);
  if (bytes.length <= 75) return line;

  const pieces: string[] = [];
  let offset = 0;
  let limit = 75;

  while (offset < bytes.length) {
    let end = Math.min(offset + limit, bytes.length);

    // Don't cut mid-character: 0b10xxxxxx bytes are continuations, so walk back
    // until `end` sits on the start of a character.
    while (end > offset && end < bytes.length && (bytes[end] & 0xc0) === 0x80) {
      end--;
    }

    pieces.push(decoder.decode(bytes.subarray(offset, end)));
    offset = end;
    limit = 74; // Subsequent lines lose one octet to the leading space.
  }

  return pieces.join(`${CRLF} `);
}

function pad(n: number, width = 2): string {
  return String(n).padStart(width, "0");
}

/** 20260725T143000Z */
export function formatUtcStamp(date: Date): string {
  return (
    `${pad(date.getUTCFullYear(), 4)}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}` +
    `T${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}Z`
  );
}

/** 20260725 — uses UTC parts, which is why all-day rows are stored at UTC midnight. */
export function formatUtcDate(date: Date): string {
  return `${pad(date.getUTCFullYear(), 4)}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}`;
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date.getTime());
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

export function buildIcs({
  calendarName,
  events,
  now = new Date(),
}: {
  calendarName: string;
  events: IcsEvent[];
  now?: Date;
}): string {
  const stamp = formatUtcStamp(now);

  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Family Hub//Family Calendar//EN",
    "CALSCALE:GREGORIAN",
    `X-WR-CALNAME:${escapeText(calendarName)}`,
    // Hints to the subscriber about how often to re-poll. Apple treats these as
    // advisory and applies its own floor.
    "REFRESH-INTERVAL;VALUE=DURATION:PT1H",
    "X-PUBLISHED-TTL:PT1H",
  ];

  for (const event of events) {
    const start = new Date(event.startsAt);
    const end = new Date(event.endsAt);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) continue;

    lines.push("BEGIN:VEVENT");
    // Stable across regenerations so subscribers update rather than duplicate.
    lines.push(`UID:${event.id}@family-hub`);
    lines.push(`DTSTAMP:${stamp}`);

    if (event.allDay) {
      lines.push(`DTSTART;VALUE=DATE:${formatUtcDate(start)}`);
      // DTEND is exclusive, so a one-day event ends the following day.
      lines.push(`DTEND;VALUE=DATE:${formatUtcDate(addDays(end, 1))}`);
    } else {
      lines.push(`DTSTART:${formatUtcStamp(start)}`);
      lines.push(`DTEND:${formatUtcStamp(end)}`);
    }

    lines.push(`SUMMARY:${escapeText(event.title)}`);
    if (event.note && event.note.trim()) {
      lines.push(`DESCRIPTION:${escapeText(event.note)}`);
    }
    if (event.updatedAt) {
      const modified = new Date(event.updatedAt);
      if (!Number.isNaN(modified.getTime())) {
        lines.push(`LAST-MODIFIED:${formatUtcStamp(modified)}`);
      }
    }
    lines.push("END:VEVENT");
  }

  lines.push("END:VCALENDAR");

  // Trailing CRLF: the body must end with one.
  return lines.map(foldLine).join(CRLF) + CRLF;
}
