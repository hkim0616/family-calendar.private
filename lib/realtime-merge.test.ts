import assert from "node:assert/strict";
import { test } from "node:test";

import { removeRow, removeRows, upsertRow } from "./realtime-merge.ts";

type Row = { id: string; name: string; checked: boolean; created_at: string };

const row = (id: string, created_at: string, checked = false): Row => ({
  id,
  name: `item-${id}`,
  checked,
  created_at,
});

/** Same ordering the grocery list uses: unchecked first, then oldest first. */
const shoppingOrder = (a: Row, b: Row) => {
  if (a.checked !== b.checked) return a.checked ? 1 : -1;
  return a.created_at.localeCompare(b.created_at);
};

const byNewest = (a: Row, b: Row) => b.created_at.localeCompare(a.created_at);

test("adds a new row in sorted position", () => {
  const rows = [row("a", "2026-01-01"), row("c", "2026-01-03")];
  const next = upsertRow(rows, row("b", "2026-01-02"), shoppingOrder);
  assert.deepEqual(
    next.map((r) => r.id),
    ["a", "b", "c"],
  );
});

test("replaces rather than duplicates when the same id arrives twice", () => {
  // This is the realtime echo of our own insert: we already added it locally.
  const rows = [row("a", "2026-01-01")];
  const next = upsertRow(rows, row("a", "2026-01-01"), shoppingOrder);
  assert.equal(next.length, 1, "row must not be duplicated");
});

test("an update moves a row to its new sorted position", () => {
  const rows = [
    row("a", "2026-01-01"),
    row("b", "2026-01-02"),
    row("c", "2026-01-03"),
  ];
  // Someone on another phone ticks "a" off — it should drop below the unchecked.
  const next = upsertRow(rows, row("a", "2026-01-01", true), shoppingOrder);
  assert.deepEqual(
    next.map((r) => r.id),
    ["b", "c", "a"],
  );
  assert.equal(next[2].checked, true);
});

test("newest-first ordering puts a fresh memo on top", () => {
  const rows = [row("old", "2026-01-01")];
  const next = upsertRow(rows, row("new", "2026-06-01"), byNewest);
  assert.deepEqual(
    next.map((r) => r.id),
    ["new", "old"],
  );
});

test("does not mutate the array it was given", () => {
  const rows = [row("a", "2026-01-02"), row("b", "2026-01-01")];
  const snapshot = rows.map((r) => r.id);
  upsertRow(rows, row("c", "2026-01-03"), shoppingOrder);
  assert.deepEqual(
    rows.map((r) => r.id),
    snapshot,
    "input array must be left alone",
  );
});

test("removes a row by id", () => {
  const rows = [row("a", "2026-01-01"), row("b", "2026-01-02")];
  assert.deepEqual(
    removeRow(rows, "a").map((r) => r.id),
    ["b"],
  );
});

test("removing an unknown id is a no-op", () => {
  // Happens when a delete event arrives for a row this device never loaded.
  const rows = [row("a", "2026-01-01")];
  assert.deepEqual(removeRow(rows, "nope"), rows);
});

test("clears several rows at once", () => {
  const rows = [
    row("a", "2026-01-01", true),
    row("b", "2026-01-02"),
    row("c", "2026-01-03", true),
  ];
  const next = removeRows(
    rows,
    rows.filter((r) => r.checked).map((r) => r.id),
  );
  assert.deepEqual(
    next.map((r) => r.id),
    ["b"],
  );
});
