/**
 * Pure list-merge helpers used by useRealtimeList.
 *
 * Kept separate from the hook (and free of React) so the fiddly part — keeping
 * one ordered, duplicate-free list while changes stream in from several devices
 * — can be unit-tested directly. See realtime-merge.test.ts.
 */

export type WithId = { id: string };

/**
 * Insert `row`, or replace the existing row with the same id, then re-sort.
 *
 * Being id-keyed is what makes it safe to call for both our own writes and the
 * realtime echo of those same writes: whichever lands second overwrites rather
 * than duplicating.
 */
export function upsertRow<T extends WithId>(
  rows: readonly T[],
  row: T,
  sort: (a: T, b: T) => number,
): T[] {
  const index = rows.findIndex((r) => r.id === row.id);
  const next = index === -1 ? [...rows, row] : rows.map((r, i) => (i === index ? row : r));
  return next.sort(sort);
}

/** Drop the row with this id, if present. */
export function removeRow<T extends WithId>(
  rows: readonly T[],
  id: string,
): T[] {
  return rows.filter((r) => r.id !== id);
}

/** Remove several ids at once — used by "clear bought items". */
export function removeRows<T extends WithId>(
  rows: readonly T[],
  ids: readonly string[],
): T[] {
  const doomed = new Set(ids);
  return rows.filter((r) => !doomed.has(r.id));
}
