import assert from "node:assert/strict";
import { test } from "node:test";

import {
  countdownLabel,
  daysBetween,
  daysUntilNext,
  isWithinReminder,
  nextOccurrence,
  sortByUpcoming,
  todayKey,
  upcoming,
  yearsAtNext,
  type Anniversary,
} from "./anniversaries.ts";

const ann = (over: Partial<Anniversary> = {}): Anniversary => ({
  id: "a1",
  title: "Anniversary",
  date: "1990-05-05",
  remind_days_before: 7,
  ...over,
});

// ── next occurrence ────────────────────────────────────────────────────────

test("a date later this year recurs this year", () => {
  assert.equal(nextOccurrence("1990-05-05", "2026-01-01"), "2026-05-05");
});

test("a date already past this year rolls to next year", () => {
  assert.equal(nextOccurrence("1990-05-05", "2026-06-01"), "2027-05-05");
});

test("the anniversary itself counts as the next occurrence", () => {
  // On the day, it must show as today rather than jumping a year ahead.
  assert.equal(nextOccurrence("1990-05-05", "2026-05-05"), "2026-05-05");
  assert.equal(daysUntilNext("1990-05-05", "2026-05-05"), 0);
});

test("the day after, it rolls to next year", () => {
  assert.equal(nextOccurrence("1990-05-05", "2026-05-06"), "2027-05-05");
});

test("31 December from 31 December is today", () => {
  assert.equal(nextOccurrence("2000-12-31", "2026-12-31"), "2026-12-31");
});

test("1 January is a day away on 31 December", () => {
  assert.equal(nextOccurrence("2000-01-01", "2026-12-31"), "2027-01-01");
  assert.equal(daysUntilNext("2000-01-01", "2026-12-31"), 1);
});

test("a date in the same year as the reference still works", () => {
  assert.equal(nextOccurrence("2026-11-20", "2026-01-05"), "2026-11-20");
});

test("a malformed date degrades to today rather than throwing", () => {
  assert.equal(nextOccurrence("nonsense", "2026-05-05"), "2026-05-05");
});

// ── 29 February ────────────────────────────────────────────────────────────

test("29 February is observed on the 28th in a non-leap year", () => {
  assert.equal(nextOccurrence("2000-02-29", "2026-01-01"), "2026-02-28");
});

test("29 February is observed on the 29th in a leap year", () => {
  assert.equal(nextOccurrence("2000-02-29", "2028-01-01"), "2028-02-29");
});

test("29 February rolls to the next year's observed date once past", () => {
  assert.equal(nextOccurrence("2000-02-29", "2026-03-01"), "2027-02-28");
});

test("2100 is not a leap year (century rule)", () => {
  assert.equal(nextOccurrence("2000-02-29", "2100-01-01"), "2100-02-28");
});

test("2000 was a leap year (400 rule)", () => {
  assert.equal(nextOccurrence("1996-02-29", "2000-01-01"), "2000-02-29");
});

// ── day arithmetic ─────────────────────────────────────────────────────────

test("counts whole days between keys", () => {
  assert.equal(daysBetween("2026-05-01", "2026-05-08"), 7);
  assert.equal(daysBetween("2026-05-08", "2026-05-01"), -7);
  assert.equal(daysBetween("2026-05-01", "2026-05-01"), 0);
});

test("day arithmetic spans month and year boundaries", () => {
  assert.equal(daysBetween("2026-01-31", "2026-02-01"), 1);
  assert.equal(daysBetween("2026-12-31", "2027-01-01"), 1);
  assert.equal(daysBetween("2026-01-01", "2027-01-01"), 365);
  assert.equal(daysBetween("2028-01-01", "2029-01-01"), 366, "2028 is a leap year");
});

test("a daylight-saving change does not shift the day count", () => {
  // UK clocks go forward on 29 March 2026 and back on 25 October 2026.
  assert.equal(daysBetween("2026-03-28", "2026-03-30"), 2);
  assert.equal(daysBetween("2026-10-24", "2026-10-26"), 2);
});

// ── years count ────────────────────────────────────────────────────────────

test("reports which anniversary it will be", () => {
  assert.equal(yearsAtNext("1990-05-05", "2026-01-01"), 36);
});

test("counts against next year when the date has passed", () => {
  assert.equal(yearsAtNext("1990-05-05", "2026-06-01"), 37);
});

test("no count for a date with no earlier year", () => {
  assert.equal(yearsAtNext("2026-11-20", "2026-01-05"), null);
});

// ── reminder window ────────────────────────────────────────────────────────

test("inside the reminder window when close enough", () => {
  const a = ann({ date: "1990-05-05", remind_days_before: 7 });
  assert.equal(isWithinReminder(a, "2026-04-29"), true, "6 days out, window 7");
});

test("outside the window when still far off", () => {
  const a = ann({ date: "1990-05-05", remind_days_before: 7 });
  assert.equal(isWithinReminder(a, "2026-04-20"), false, "15 days out");
});

test("the boundary day is inside the window", () => {
  const a = ann({ date: "1990-05-05", remind_days_before: 7 });
  assert.equal(isWithinReminder(a, "2026-04-28"), true, "exactly 7 days out");
});

test("a zero-day window only fires on the day itself", () => {
  const a = ann({ date: "1990-05-05", remind_days_before: 0 });
  assert.equal(isWithinReminder(a, "2026-05-04"), false);
  assert.equal(isWithinReminder(a, "2026-05-05"), true);
});

// ── labels ─────────────────────────────────────────────────────────────────

test("countdown reads naturally", () => {
  assert.equal(countdownLabel(0), "Today");
  assert.equal(countdownLabel(1), "Tomorrow");
  assert.equal(countdownLabel(6), "in 6 days");
  assert.equal(countdownLabel(13), "in 13 days");
  assert.equal(countdownLabel(21), "in 3 weeks");
  assert.equal(countdownLabel(90), "in 3 months");
});

test("a negative countdown still reads as today, never a negative number", () => {
  assert.equal(countdownLabel(-3), "Today");
});

// ── sorting and filtering ──────────────────────────────────────────────────

test("sorts soonest first", () => {
  const list = [
    ann({ id: "far", date: "1990-12-25" }),
    ann({ id: "soon", date: "1990-01-10" }),
    ann({ id: "middle", date: "1990-06-01" }),
  ];
  assert.deepEqual(
    sortByUpcoming(list, "2026-01-01").map((a) => a.id),
    ["soon", "middle", "far"],
  );
});

test("sorting is stable by title when two fall on the same day", () => {
  const list = [
    ann({ id: "b", title: "Bob", date: "1990-03-03" }),
    ann({ id: "a", title: "Alice", date: "1980-03-03" }),
  ];
  assert.deepEqual(
    sortByUpcoming(list, "2026-01-01").map((a) => a.title),
    ["Alice", "Bob"],
  );
});

test("sorting wraps the year correctly", () => {
  // From December, a January date is sooner than a later-December one.
  const list = [
    ann({ id: "dec", date: "1990-12-28" }),
    ann({ id: "jan", date: "1990-01-05" }),
  ];
  assert.deepEqual(
    sortByUpcoming(list, "2026-12-20").map((a) => a.id),
    ["dec", "jan"],
  );
});

test("upcoming() keeps only what falls in the window", () => {
  const list = [
    ann({ id: "in", date: "1990-01-20" }), // 19 days out
    ann({ id: "out", date: "1990-06-01" }),
  ];
  assert.deepEqual(
    upcoming(list, 30, "2026-01-01").map((a) => a.id),
    ["in"],
  );
});

test("upcoming() includes something happening today", () => {
  const list = [ann({ id: "today", date: "1990-01-01" })];
  assert.deepEqual(
    upcoming(list, 30, "2026-01-01").map((a) => a.id),
    ["today"],
  );
});

test("upcoming() spans the new year", () => {
  const list = [ann({ id: "jan", date: "1990-01-05" })];
  assert.deepEqual(
    upcoming(list, 30, "2026-12-20").map((a) => a.id),
    ["jan"],
    "a January date must appear in December's 30-day window",
  );
});

test("upcoming() returns nothing when the list is empty", () => {
  assert.deepEqual(upcoming([], 30, "2026-01-01"), []);
});

// ── today key ──────────────────────────────────────────────────────────────

test("todayKey pads to a sortable ISO date", () => {
  assert.equal(todayKey(new Date(2026, 0, 5, 23, 59)), "2026-01-05");
});
