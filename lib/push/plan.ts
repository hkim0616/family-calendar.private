/**
 * Decides which notifications are due, given a family's data and today's date.
 *
 * Pure and side-effect free so it can be tested directly — the scheduler that
 * uses it only has to do the sending. See plan.test.ts.
 */

import {
  daysUntilNext,
  nextOccurrence,
  yearsAtNext,
  type Anniversary,
} from "../anniversaries.ts";

export type FamilyPushData = {
  family_id: string;
  family_name: string;
  anniversaries: Anniversary[];
  grocery_to_buy: number;
};

export type PlannedNotification = {
  /** Unique per notification per occurrence — the duplicate-send guard. */
  dedupeKey: string;
  title: string;
  body: string;
  /** Where tapping the notification should open. */
  url: string;
  /** Lets the phone collapse repeats of the same thing. */
  tag: string;
};

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

/**
 * Anniversary reminders fire at most twice per occurrence: once when the lead
 * time is reached, and once on the day itself.
 *
 * Firing on the exact boundary rather than "anywhere inside the window" is what
 * stops a 30-day reminder nagging every morning for a month.
 */
export function planAnniversaryNotifications(
  anniversaries: Anniversary[],
  today: string,
): PlannedNotification[] {
  const planned: PlannedNotification[] = [];

  for (const anniversary of anniversaries) {
    const days = daysUntilNext(anniversary.date, today);
    const occurrence = nextOccurrence(anniversary.date, today);
    const years = yearsAtNext(anniversary.date, today);
    const suffix = years !== null ? ` (${years} years)` : "";

    if (days === 0) {
      planned.push({
        dedupeKey: `ann:${anniversary.id}:${occurrence}:day`,
        title: `Today: ${anniversary.title}`,
        body: years !== null ? `${years} years today.` : "It's today.",
        url: "/anniversaries",
        tag: `ann-${anniversary.id}-${occurrence}`,
      });
      continue;
    }

    // Only on the boundary day, and only when there's a lead time at all.
    if (anniversary.remind_days_before > 0 && days === anniversary.remind_days_before) {
      planned.push({
        dedupeKey: `ann:${anniversary.id}:${occurrence}:lead`,
        title: anniversary.title,
        body: `${plural(days, "day", "days")} away${suffix}.`,
        url: "/anniversaries",
        tag: `ann-${anniversary.id}-${occurrence}`,
      });
    }
  }

  return planned;
}

/** A once-a-day nudge, and only when there's actually something to buy. */
export function planGroceryNotification(
  family: Pick<FamilyPushData, "family_id" | "grocery_to_buy">,
  today: string,
): PlannedNotification | null {
  if (family.grocery_to_buy <= 0) return null;

  return {
    dedupeKey: `groceries:${family.family_id}:${today}`,
    title: "Shopping list",
    body: `${plural(family.grocery_to_buy, "item", "items")} still to buy.`,
    url: "/groceries",
    tag: `groceries-${family.family_id}`,
  };
}

/** Everything due for one family today. */
export function planForFamily(
  family: FamilyPushData,
  today: string,
): PlannedNotification[] {
  const planned = planAnniversaryNotifications(family.anniversaries, today);
  const grocery = planGroceryNotification(family, today);
  if (grocery) planned.push(grocery);
  return planned;
}
