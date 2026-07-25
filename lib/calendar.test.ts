import assert from "node:assert/strict";
import { test } from "node:test";

import {
  dayKeyToUtcDate,
  eventDayKeys,
  groupByDay,
  localDayKey,
  monthMatrix,
  shiftMonth,
  utcDayKey,
  type CalendarEvent,
} from "./calendar.ts";

/**
 * ISO instant for a wall-clock time in whatever timezone the test runs in.
 * Using literal UTC strings for timed events would make these tests pass or
 * fail depending on the machine's timezone, since timed events group by local
 * date.
 */
const localIso = (
  y: number,
  month: number,
  d: number,
  h: number,
  min = 0,
) => new Date(y, month - 1, d, h, min).toISOString();

const ev = (over: Partial<CalendarEvent> = {}): CalendarEvent => ({
  id: "e1",
  title: "Event",
  starts_at: localIso(2026, 7, 25, 10),
  ends_at: localIso(2026, 7, 25, 11),
  all_day: false,
  note: null,
  ...over,
});

// ── day keys ───────────────────────────────────────────────────────────────

test("pads month and day to two digits", () => {
  assert.equal(localDayKey(new Date(2026, 0, 5)), "2026-01-05");
  assert.equal(utcDayKey(new Date("2026-01-05T00:00:00Z")), "2026-01-05");
});

test("a timed event occupies one day", () => {
  assert.deepEqual(eventDayKeys(ev()), ["2026-07-25"]);
});

test("a timed event ending exactly at midnight does not spill into the next day", () => {
  const keys = eventDayKeys(
    ev({ starts_at: localIso(2026, 7, 25, 23), ends_at: localIso(2026, 7, 26, 0) }),
  );
  assert.deepEqual(keys, ["2026-07-25"]);
});

test("a timed event that genuinely crosses midnight occupies both days", () => {
  const keys = eventDayKeys(
    ev({ starts_at: localIso(2026, 7, 25, 22), ends_at: localIso(2026, 7, 26, 1) }),
  );
  assert.deepEqual(keys, ["2026-07-25", "2026-07-26"]);
});

test("a single-day all-day event occupies exactly one day", () => {
  const keys = eventDayKeys(
    ev({
      all_day: true,
      starts_at: "2026-08-01T00:00:00.000Z",
      ends_at: "2026-08-01T00:00:00.000Z",
    }),
  );
  assert.deepEqual(keys, ["2026-08-01"]);
});

test("a multi-day all-day event occupies every day inclusive", () => {
  const keys = eventDayKeys(
    ev({
      all_day: true,
      starts_at: "2026-08-01T00:00:00.000Z",
      ends_at: "2026-08-04T00:00:00.000Z",
    }),
  );
  assert.deepEqual(keys, ["2026-08-01", "2026-08-02", "2026-08-03", "2026-08-04"]);
});

test("all-day keys use UTC, so the date can't drift by timezone", () => {
  // The whole reason all-day rows are stored at UTC midnight.
  const keys = eventDayKeys(
    ev({
      all_day: true,
      starts_at: "2026-08-01T00:00:00.000Z",
      ends_at: "2026-08-01T00:00:00.000Z",
    }),
  );
  assert.deepEqual(keys, ["2026-08-01"]);
});

test("an all-day span crossing a month boundary is continuous", () => {
  const keys = eventDayKeys(
    ev({
      all_day: true,
      starts_at: "2026-01-30T00:00:00.000Z",
      ends_at: "2026-02-02T00:00:00.000Z",
    }),
  );
  assert.deepEqual(keys, ["2026-01-30", "2026-01-31", "2026-02-01", "2026-02-02"]);
});

test("an all-day span across a leap day includes 29 February", () => {
  const keys = eventDayKeys(
    ev({
      all_day: true,
      starts_at: "2028-02-28T00:00:00.000Z",
      ends_at: "2028-03-01T00:00:00.000Z",
    }),
  );
  assert.deepEqual(keys, ["2028-02-28", "2028-02-29", "2028-03-01"]);
});

test("an end before the start degrades to a single day", () => {
  const keys = eventDayKeys(
    ev({ starts_at: localIso(2026, 7, 25, 10), ends_at: localIso(2026, 7, 20, 10) }),
  );
  assert.equal(keys.length, 1);
});

test("an unparseable start yields no days rather than throwing", () => {
  assert.deepEqual(eventDayKeys(ev({ starts_at: "nonsense" })), []);
});

// ── grouping ───────────────────────────────────────────────────────────────

test("groups events under each day they touch", () => {
  const trip = ev({
    id: "trip",
    all_day: true,
    starts_at: "2026-08-01T00:00:00.000Z",
    ends_at: "2026-08-02T00:00:00.000Z",
  });
  const grouped = groupByDay([trip]);
  assert.equal(grouped.get("2026-08-01")?.length, 1);
  assert.equal(grouped.get("2026-08-02")?.length, 1);
});

test("all-day events sort above timed ones on the same day", () => {
  const timed = ev({ id: "timed", starts_at: localIso(2026, 8, 1, 9), ends_at: localIso(2026, 8, 1, 10) });
  const allDay = ev({
    id: "allday",
    all_day: true,
    starts_at: "2026-08-01T00:00:00.000Z",
    ends_at: "2026-08-01T00:00:00.000Z",
  });
  const day = groupByDay([timed, allDay]).get("2026-08-01");
  assert.deepEqual(day?.map((e) => e.id), ["allday", "timed"]);
});

test("timed events on one day sort by start time", () => {
  const late = ev({ id: "late", starts_at: localIso(2026, 8, 1, 18), ends_at: localIso(2026, 8, 1, 19) });
  const early = ev({ id: "early", starts_at: localIso(2026, 8, 1, 8), ends_at: localIso(2026, 8, 1, 9) });
  const day = groupByDay([late, early]).get("2026-08-01");
  assert.deepEqual(day?.map((e) => e.id), ["early", "late"]);
});

// ── month grid ─────────────────────────────────────────────────────────────

test("the grid is a whole number of weeks", () => {
  for (let m = 0; m < 12; m++) {
    const cells = monthMatrix(2026, m);
    assert.equal(cells.length % 7, 0, `month ${m} is not whole weeks`);
  }
});

test("the grid starts on a Sunday", () => {
  for (let m = 0; m < 12; m++) {
    assert.equal(monthMatrix(2026, m)[0].date.getDay(), 0);
  }
});

test("the grid contains every day of the month exactly once", () => {
  const cells = monthMatrix(2026, 6); // July 2026, 31 days
  const inMonth = cells.filter((c) => c.inMonth);
  assert.equal(inMonth.length, 31);
  assert.equal(new Set(inMonth.map((c) => c.key)).size, 31);
});

test("February 2028 (leap) contains 29 days", () => {
  const inMonth = monthMatrix(2028, 1).filter((c) => c.inMonth);
  assert.equal(inMonth.length, 29);
  assert.ok(inMonth.some((c) => c.key === "2028-02-29"));
});

test("no dead trailing week", () => {
  // February 2026 starts on a Sunday and has 28 days — exactly 4 weeks.
  assert.equal(monthMatrix(2026, 1).length, 28);
});

test("days outside the month are flagged", () => {
  const cells = monthMatrix(2026, 6);
  assert.ok(cells.some((c) => !c.inMonth), "padding days should exist");
  cells
    .filter((c) => !c.inMonth)
    .forEach((c) => assert.notEqual(c.date.getMonth(), 6));
});

// ── month navigation ───────────────────────────────────────────────────────

test("stepping forward from December rolls into January", () => {
  assert.deepEqual(shiftMonth(2026, 11, 1), { year: 2027, monthIndex: 0 });
});

test("stepping back from January rolls into December", () => {
  assert.deepEqual(shiftMonth(2026, 0, -1), { year: 2025, monthIndex: 11 });
});

test("stepping twelve months lands on the same month next year", () => {
  assert.deepEqual(shiftMonth(2026, 6, 12), { year: 2027, monthIndex: 6 });
});

// ── saving all-day events ──────────────────────────────────────────────────

test("a day key converts to UTC midnight for storage", () => {
  assert.equal(dayKeyToUtcDate("2026-08-01").toISOString(), "2026-08-01T00:00:00.000Z");
});
