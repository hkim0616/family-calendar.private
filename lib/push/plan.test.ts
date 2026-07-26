import assert from "node:assert/strict";
import { test } from "node:test";

import {
  planAnniversaryNotifications,
  planForFamily,
  planGroceryNotification,
  type FamilyPushData,
} from "./plan.ts";
import type { Anniversary } from "../anniversaries.ts";

const ann = (over: Partial<Anniversary> = {}): Anniversary => ({
  id: "a1",
  title: "Mina's birthday",
  date: "2018-05-05",
  remind_days_before: 7,
  ...over,
});

const family = (over: Partial<FamilyPushData> = {}): FamilyPushData => ({
  family_id: "f1",
  family_name: "The Kim Family",
  anniversaries: [],
  grocery_to_buy: 0,
  ...over,
});

// ── anniversary timing ─────────────────────────────────────────────────────

test("fires on the lead-time boundary", () => {
  // 7-day reminder, and the birthday is exactly 7 days away.
  const planned = planAnniversaryNotifications([ann()], "2026-04-28");
  assert.equal(planned.length, 1);
  assert.match(planned[0].body, /7 days away/);
  assert.match(planned[0].title, /Mina's birthday/);
});

test("does not fire the day before the boundary", () => {
  assert.deepEqual(planAnniversaryNotifications([ann()], "2026-04-27"), []);
});

test("does not fire again inside the window", () => {
  // This is the anti-nagging rule: 6, 5, 4… days out must all be silent.
  for (const day of ["2026-04-29", "2026-04-30", "2026-05-01", "2026-05-04"]) {
    assert.deepEqual(
      planAnniversaryNotifications([ann()], day),
      [],
      `should be silent on ${day}`,
    );
  }
});

test("fires again on the day itself", () => {
  const planned = planAnniversaryNotifications([ann()], "2026-05-05");
  assert.equal(planned.length, 1);
  assert.match(planned[0].title, /^Today: /);
  assert.match(planned[0].body, /8 years today/);
});

test("the two firings have different dedupe keys", () => {
  const lead = planAnniversaryNotifications([ann()], "2026-04-28")[0];
  const day = planAnniversaryNotifications([ann()], "2026-05-05")[0];
  assert.notEqual(lead.dedupeKey, day.dedupeKey);
  assert.match(lead.dedupeKey, /:lead$/);
  assert.match(day.dedupeKey, /:day$/);
});

test("a zero-day lead time only fires on the day", () => {
  const a = ann({ remind_days_before: 0 });
  assert.deepEqual(planAnniversaryNotifications([a], "2026-05-04"), []);
  assert.equal(planAnniversaryNotifications([a], "2026-05-05").length, 1);
});

test("dedupe keys include the occurrence year, so next year fires again", () => {
  const thisYear = planAnniversaryNotifications([ann()], "2026-04-28")[0];
  const nextYear = planAnniversaryNotifications([ann()], "2027-04-28")[0];
  assert.notEqual(
    thisYear.dedupeKey,
    nextYear.dedupeKey,
    "an unchanging key would silence the reminder forever after the first year",
  );
  assert.match(thisYear.dedupeKey, /2026-05-05/);
  assert.match(nextYear.dedupeKey, /2027-05-05/);
});

test("the lead-time reminder works across the new year", () => {
  // 5 January, reminded 7 days before, evaluated on 29 December.
  const a = ann({ date: "2010-01-05", remind_days_before: 7 });
  const planned = planAnniversaryNotifications([a], "2025-12-29");
  assert.equal(planned.length, 1);
  assert.match(planned[0].dedupeKey, /2026-01-05/);
});

test("a 29 February anniversary fires on its observed date", () => {
  const a = ann({ date: "2000-02-29", remind_days_before: 3 });
  // 2027 is not a leap year, so it's observed on the 28th: 3 days before is 25 Feb.
  const planned = planAnniversaryNotifications([a], "2027-02-25");
  assert.equal(planned.length, 1);
  assert.match(planned[0].dedupeKey, /2027-02-28/);
});

test("several anniversaries on the same day each get their own notification", () => {
  const planned = planAnniversaryNotifications(
    [
      ann({ id: "a1", title: "Mina" }),
      ann({ id: "a2", title: "Dad" }),
    ],
    "2026-04-28",
  );
  assert.equal(planned.length, 2);
  assert.equal(new Set(planned.map((p) => p.dedupeKey)).size, 2);
});

test("no years count when the stored date has no earlier year", () => {
  const a = ann({ date: "2026-05-05" });
  const planned = planAnniversaryNotifications([a], "2026-04-28");
  assert.ok(
    !planned[0].body.includes("years"),
    `should omit a meaningless year count (got "${planned[0].body}")`,
  );
});

test("an empty list plans nothing", () => {
  assert.deepEqual(planAnniversaryNotifications([], "2026-04-28"), []);
});

// ── grocery nudge ──────────────────────────────────────────────────────────

test("nudges when there is something to buy", () => {
  const planned = planGroceryNotification(
    { family_id: "f1", grocery_to_buy: 3 },
    "2026-05-05",
  );
  assert.ok(planned);
  assert.match(planned.body, /3 items still to buy/);
  assert.equal(planned.url, "/groceries");
});

test("stays quiet when the list is empty", () => {
  assert.equal(
    planGroceryNotification({ family_id: "f1", grocery_to_buy: 0 }, "2026-05-05"),
    null,
  );
});

test("singular wording for one item", () => {
  const planned = planGroceryNotification(
    { family_id: "f1", grocery_to_buy: 1 },
    "2026-05-05",
  );
  assert.ok(planned);
  assert.match(planned.body, /1 item still/);
});

test("the grocery nudge is once per day", () => {
  const a = planGroceryNotification({ family_id: "f1", grocery_to_buy: 2 }, "2026-05-05");
  const b = planGroceryNotification({ family_id: "f1", grocery_to_buy: 5 }, "2026-05-05");
  assert.ok(a && b);
  assert.equal(a.dedupeKey, b.dedupeKey, "same day must reuse the key");

  const tomorrow = planGroceryNotification(
    { family_id: "f1", grocery_to_buy: 2 },
    "2026-05-06",
  );
  assert.ok(tomorrow);
  assert.notEqual(a.dedupeKey, tomorrow.dedupeKey, "a new day is a new nudge");
});

test("each family gets its own grocery key", () => {
  const one = planGroceryNotification({ family_id: "f1", grocery_to_buy: 1 }, "2026-05-05");
  const two = planGroceryNotification({ family_id: "f2", grocery_to_buy: 1 }, "2026-05-05");
  assert.ok(one && two);
  assert.notEqual(one.dedupeKey, two.dedupeKey);
});

// ── whole-family plan ──────────────────────────────────────────────────────

test("combines anniversaries and the grocery nudge", () => {
  const planned = planForFamily(
    family({ anniversaries: [ann()], grocery_to_buy: 4 }),
    "2026-04-28",
  );
  assert.equal(planned.length, 2);
  assert.deepEqual(
    planned.map((p) => p.url).sort(),
    ["/anniversaries", "/groceries"],
  );
});

test("a quiet day plans nothing at all", () => {
  assert.deepEqual(
    planForFamily(family({ anniversaries: [ann()], grocery_to_buy: 0 }), "2026-04-27"),
    [],
  );
});

test("every planned notification has the fields the sender needs", () => {
  const planned = planForFamily(
    family({ anniversaries: [ann(), ann({ id: "a2", remind_days_before: 0, date: "2018-04-28" })], grocery_to_buy: 2 }),
    "2026-04-28",
  );
  assert.ok(planned.length >= 2);
  for (const p of planned) {
    assert.ok(p.dedupeKey && p.dedupeKey.length > 0, "dedupeKey");
    assert.ok(p.title && p.title.length > 0, "title");
    assert.ok(p.body && p.body.length > 0, "body");
    assert.ok(p.url.startsWith("/"), "url is app-relative");
    assert.ok(p.tag && p.tag.length > 0, "tag");
  }
  assert.equal(
    new Set(planned.map((p) => p.dedupeKey)).size,
    planned.length,
    "dedupe keys must be unique within one run",
  );
});

test("a year of daily runs sends exactly two reminders per anniversary", () => {
  // The strongest guard against the nagging failure mode: walk every day of a
  // year and count how often one anniversary would fire.
  const a = ann({ date: "2018-05-05", remind_days_before: 7 });
  const keys = new Set<string>();
  const cursor = new Date(Date.UTC(2026, 0, 1));
  for (let i = 0; i < 365; i++) {
    const today = cursor.toISOString().slice(0, 10);
    for (const p of planAnniversaryNotifications([a], today)) keys.add(p.dedupeKey);
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  assert.equal(
    keys.size,
    2,
    `expected one lead + one day-of reminder in a year, got ${[...keys].join(", ")}`,
  );
});
