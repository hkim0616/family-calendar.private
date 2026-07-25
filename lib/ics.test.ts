import assert from "node:assert/strict";
import { test } from "node:test";

import {
  buildIcs,
  escapeText,
  foldLine,
  formatUtcDate,
  formatUtcStamp,
  type IcsEvent,
} from "./ics.ts";

const NOW = new Date("2026-07-25T09:00:00Z");

const timedEvent = (over: Partial<IcsEvent> = {}): IcsEvent => ({
  id: "11111111-1111-1111-1111-111111111111",
  title: "Dinner with the Parks",
  startsAt: "2026-07-25T18:30:00Z",
  endsAt: "2026-07-25T20:00:00Z",
  allDay: false,
  ...over,
});

/** Split a feed into logical lines, undoing RFC 5545 folding. */
function unfold(ics: string): string[] {
  return ics.replace(/\r\n[ \t]/g, "").split("\r\n").filter(Boolean);
}

// ── structure ──────────────────────────────────────────────────────────────

test("wraps events in a VCALENDAR with the required properties", () => {
  const lines = unfold(
    buildIcs({ calendarName: "The Kim Family", events: [timedEvent()], now: NOW }),
  );
  assert.equal(lines[0], "BEGIN:VCALENDAR");
  assert.equal(lines.at(-1), "END:VCALENDAR");
  assert.ok(lines.includes("VERSION:2.0"));
  assert.ok(lines.includes("CALSCALE:GREGORIAN"));
  assert.ok(lines.some((l) => l.startsWith("PRODID:")));
  assert.ok(lines.includes("X-WR-CALNAME:The Kim Family"));
});

test("every line ends with CRLF, including the last", () => {
  const ics = buildIcs({ calendarName: "F", events: [timedEvent()], now: NOW });
  assert.ok(ics.endsWith("\r\n"), "feed must end with CRLF");
  // A bare LF anywhere would break strict parsers.
  assert.equal(ics.split("\n").length - 1, ics.split("\r\n").length - 1);
});

test("emits one VEVENT per event, balanced", () => {
  const ics = buildIcs({
    calendarName: "F",
    events: [timedEvent(), timedEvent({ id: "22222222-2222-2222-2222-222222222222" })],
    now: NOW,
  });
  assert.equal(ics.match(/BEGIN:VEVENT/g)?.length, 2);
  assert.equal(ics.match(/END:VEVENT/g)?.length, 2);
});

test("UID is stable and derived from the row id", () => {
  const lines = unfold(buildIcs({ calendarName: "F", events: [timedEvent()], now: NOW }));
  assert.ok(
    lines.includes("UID:11111111-1111-1111-1111-111111111111@family-hub"),
    "a changing UID would make subscribers duplicate events instead of updating",
  );
});

// ── times ──────────────────────────────────────────────────────────────────

test("timed events are emitted in UTC", () => {
  const lines = unfold(buildIcs({ calendarName: "F", events: [timedEvent()], now: NOW }));
  assert.ok(lines.includes("DTSTART:20260725T183000Z"));
  assert.ok(lines.includes("DTEND:20260725T200000Z"));
});

test("all-day events use VALUE=DATE with an exclusive end", () => {
  const lines = unfold(
    buildIcs({
      calendarName: "F",
      events: [
        timedEvent({
          allDay: true,
          startsAt: "2026-08-01T00:00:00Z",
          endsAt: "2026-08-01T00:00:00Z", // single day, stored inclusive
        }),
      ],
      now: NOW,
    }),
  );
  assert.ok(lines.includes("DTSTART;VALUE=DATE:20260801"));
  assert.ok(
    lines.includes("DTEND;VALUE=DATE:20260802"),
    "DTEND is exclusive, so a one-day event must end the next day",
  );
});

test("a multi-day all-day event spans the right dates", () => {
  const lines = unfold(
    buildIcs({
      calendarName: "F",
      events: [
        timedEvent({
          allDay: true,
          startsAt: "2026-08-01T00:00:00Z",
          endsAt: "2026-08-03T00:00:00Z",
        }),
      ],
      now: NOW,
    }),
  );
  assert.ok(lines.includes("DTSTART;VALUE=DATE:20260801"));
  assert.ok(lines.includes("DTEND;VALUE=DATE:20260804"));
});

test("month and day are zero-padded", () => {
  assert.equal(formatUtcDate(new Date("2026-01-05T00:00:00Z")), "20260105");
  assert.equal(formatUtcStamp(new Date("2026-01-05T04:07:09Z")), "20260105T040709Z");
});

test("skips events with unparseable dates rather than emitting garbage", () => {
  const ics = buildIcs({
    calendarName: "F",
    events: [timedEvent({ startsAt: "not a date" })],
    now: NOW,
  });
  assert.equal(ics.match(/BEGIN:VEVENT/g), null);
  assert.ok(ics.includes("END:VCALENDAR"));
});

// ── escaping ───────────────────────────────────────────────────────────────

test("escapes backslash, semicolon and comma in TEXT", () => {
  assert.equal(escapeText("a,b;c\\d"), "a\\,b\\;c\\\\d");
});

test("escapes backslashes before the other characters", () => {
  // Getting the order wrong turns "\" into "\\," and corrupts the value.
  assert.equal(escapeText("\\,"), "\\\\\\,");
});

test("turns real newlines into literal \\n", () => {
  assert.equal(escapeText("line1\nline2"), "line1\\nline2");
  assert.equal(escapeText("line1\r\nline2"), "line1\\nline2");
});

test("does not escape colons", () => {
  // Colons are legal in TEXT values; escaping them shows a stray backslash.
  assert.equal(escapeText("Meeting: 9am"), "Meeting: 9am");
});

test("a title with commas survives into SUMMARY", () => {
  const lines = unfold(
    buildIcs({
      calendarName: "F",
      events: [timedEvent({ title: "Buy milk, eggs; bread" })],
      now: NOW,
    }),
  );
  assert.ok(lines.includes("SUMMARY:Buy milk\\, eggs\\; bread"));
});

test("a multi-line note becomes a single DESCRIPTION", () => {
  const lines = unfold(
    buildIcs({
      calendarName: "F",
      events: [timedEvent({ note: "Bring:\n- wine\n- dessert" })],
      now: NOW,
    }),
  );
  assert.ok(lines.includes("DESCRIPTION:Bring:\\n- wine\\n- dessert"));
});

test("omits DESCRIPTION when there is no note", () => {
  const ics = buildIcs({
    calendarName: "F",
    events: [timedEvent({ note: "   " })],
    now: NOW,
  });
  assert.ok(!ics.includes("DESCRIPTION:"));
});

// ── folding ────────────────────────────────────────────────────────────────

test("short lines are left alone", () => {
  assert.equal(foldLine("SUMMARY:short"), "SUMMARY:short");
});

test("long lines fold at 75 octets with a leading space on continuations", () => {
  const folded = foldLine("SUMMARY:" + "x".repeat(200));
  const physical = folded.split("\r\n");
  assert.ok(physical.length > 1, "must actually fold");
  assert.ok(
    physical.every((l) => new TextEncoder().encode(l).length <= 75),
    "no physical line may exceed 75 octets",
  );
  physical.slice(1).forEach((l) => assert.ok(l.startsWith(" ")));
});

test("folding is reversible", () => {
  const original = "DESCRIPTION:" + "abcdefghij".repeat(30);
  assert.equal(foldLine(original).replace(/\r\n /g, ""), original);
});

test("folding never splits a multi-byte character", () => {
  // Korean text: 3 bytes per character, so a naive 75-char cut lands mid-glyph.
  const original = "SUMMARY:" + "가나다라마".repeat(20);
  const folded = foldLine(original);
  assert.ok(!folded.includes("�"), "no replacement characters");
  assert.equal(folded.replace(/\r\n /g, ""), original);
  assert.ok(
    folded
      .split("\r\n")
      .every((l) => new TextEncoder().encode(l).length <= 75),
  );
});

test("emoji survive folding intact", () => {
  const original = "SUMMARY:" + "🎂".repeat(40);
  const folded = foldLine(original);
  assert.equal(folded.replace(/\r\n /g, ""), original);
  assert.ok(!folded.includes("�"));
});

test("a long real title folds inside the full feed", () => {
  const ics = buildIcs({
    calendarName: "F",
    events: [timedEvent({ title: "Mina's school concert " + "and rehearsal ".repeat(8) })],
    now: NOW,
  });
  assert.ok(
    ics.split("\r\n").every((l) => new TextEncoder().encode(l).length <= 75),
  );
  // And it still round-trips to the original SUMMARY.
  assert.ok(
    unfold(ics).some((l) => l.startsWith("SUMMARY:Mina's school concert and rehearsal")),
  );
});

test("an empty calendar is still valid", () => {
  const lines = unfold(buildIcs({ calendarName: "Empty", events: [], now: NOW }));
  assert.equal(lines[0], "BEGIN:VCALENDAR");
  assert.equal(lines.at(-1), "END:VCALENDAR");
  assert.ok(!lines.some((l) => l.startsWith("BEGIN:VEVENT")));
});
