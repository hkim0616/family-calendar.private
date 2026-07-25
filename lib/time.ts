import { differenceInSeconds, format, isToday, isYesterday } from "date-fns";

/**
 * Short, glanceable timestamps for list rows: "just now", "14:32",
 * "Yesterday 09:10", "12 Mar".
 */
export function shortTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";

  if (differenceInSeconds(new Date(), date) < 60) return "just now";
  if (isToday(date)) return format(date, "HH:mm");
  if (isYesterday(date)) return `Yesterday ${format(date, "HH:mm")}`;
  return format(date, "d MMM");
}
