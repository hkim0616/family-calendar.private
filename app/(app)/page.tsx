import Link from "next/link";
import { redirect } from "next/navigation";
import { format } from "date-fns";

import { BOTTOM_NAV_SPACER } from "@/components/bottom-nav";
import { InviteLink } from "@/components/invite-link";
import { NotificationSettings } from "@/components/notification-settings";
import { RefreshOnFocus } from "@/components/refresh-on-focus";
import {
  countdownLabel,
  daysUntilNext,
  isWithinReminder,
  todayKey as annTodayKey,
  upcoming,
  yearsAtNext,
  type Anniversary,
} from "@/lib/anniversaries";
import { eventDayKeys, type CalendarEvent } from "@/lib/calendar";
import { getCurrentMember } from "@/lib/family";
import { createSupabaseServerClient } from "@/lib/supabase/server";

// Aggregates live data, so never statically cached.
export const dynamic = "force-dynamic";

/** How far ahead the dashboard looks for anniversaries. */
const ANNIVERSARY_WINDOW_DAYS = 30;
/** Cap on memos listed before linking through to the full board. */
const MEMO_PREVIEW = 4;

function SectionHeading({
  title,
  href,
  action,
}: {
  title: string;
  href: string;
  action: string;
}) {
  return (
    <div className="mb-2 flex items-baseline justify-between px-1">
      <h2 className="muted text-xs font-medium uppercase tracking-wide">
        {title}
      </h2>
      <Link
        href={href}
        className="text-[11px] font-medium"
        style={{ color: "var(--accent)" }}
      >
        {action}
      </Link>
    </div>
  );
}

export default async function Home() {
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // middleware.ts already redirects signed-out visitors, but a page that shows
  // family data shouldn't rely on that alone.
  if (!user) redirect("/login");

  const member = await getCurrentMember();
  if (!member) redirect("/onboarding");

  const now = new Date();
  const today = annTodayKey(now);

  // Fetch a day either side of today so an event near a timezone boundary is
  // still caught; the exact same-day filter happens below.
  const windowStart = new Date(now);
  windowStart.setDate(windowStart.getDate() - 1);
  const windowEnd = new Date(now);
  windowEnd.setDate(windowEnd.getDate() + 2);

  // RLS scopes every one of these to the caller's family.
  const [eventsResult, memosResult, anniversariesResult, groceryResult] =
    await Promise.all([
      supabase
        .from("events")
        .select("id, title, starts_at, ends_at, all_day, note")
        .gte("starts_at", windowStart.toISOString())
        .lte("starts_at", windowEnd.toISOString())
        .order("starts_at", { ascending: true }),
      supabase
        .from("memos")
        .select("id, body, created_at", { count: "exact" })
        .eq("done", false)
        .order("created_at", { ascending: false })
        .limit(MEMO_PREVIEW),
      supabase
        .from("anniversaries")
        .select("id, title, date, remind_days_before")
        .limit(300),
      supabase
        .from("grocery_items")
        .select("*", { count: "exact", head: true })
        .eq("checked", false),
    ]);

  const todaysEvents = ((eventsResult.data ?? []) as CalendarEvent[]).filter(
    (event) => eventDayKeys(event).includes(today),
  );

  const openMemos = (memosResult.data ?? []) as {
    id: string;
    body: string;
    created_at: string;
  }[];
  const openMemoCount = memosResult.count ?? openMemos.length;

  const soonDates = upcoming(
    (anniversariesResult.data ?? []) as Anniversary[],
    ANNIVERSARY_WINDOW_DAYS,
    today,
  );

  const toBuy = groceryResult.count ?? 0;

  const nothingAtAll =
    todaysEvents.length === 0 &&
    openMemoCount === 0 &&
    soonDates.length === 0 &&
    toBuy === 0;

  return (
    <main className={`mx-auto max-w-md px-5 py-8 ${BOTTOM_NAV_SPACER}`}>
      <RefreshOnFocus />

      <header className="mb-6">
        <p className="muted text-sm">{member.familyName}</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">
          Hello, {member.displayName} 👋
        </h1>
        <p className="muted mt-1 text-xs">{format(now, "EEEE d MMMM")}</p>
      </header>

      {nothingAtAll && (
        <section className="card mb-5 p-4">
          <h2 className="text-sm font-semibold">Nothing on today</h2>
          <p className="muted mt-1 text-sm">
            No events, memos, dates or shopping. Add something from the tabs
            below and it&apos;ll show up here.
          </p>
        </section>
      )}

      {/* ── Today's schedule ── */}
      {todaysEvents.length > 0 && (
        <section className="mb-5">
          <SectionHeading title="Today" href="/schedule" action="Schedule" />
          <ul className="space-y-2">
            {todaysEvents.map((event) => (
              <li key={event.id} className="card">
                <Link
                  href="/schedule"
                  className="flex items-start gap-3 px-3 py-2"
                  style={{ minHeight: 52 }}
                >
                  <span
                    className="mt-0.5 shrink-0 text-xs font-semibold tabular-nums"
                    style={{ color: "var(--accent)", minWidth: 48 }}
                  >
                    {event.all_day
                      ? "All day"
                      : format(new Date(event.starts_at), "HH:mm")}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium">
                      {event.title}
                    </span>
                    {event.note && (
                      <span className="muted mt-0.5 block text-xs">
                        {event.note}
                      </span>
                    )}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* ── Upcoming anniversaries ── */}
      {soonDates.length > 0 && (
        <section className="mb-5">
          <SectionHeading
            title={`Coming up · next ${ANNIVERSARY_WINDOW_DAYS} days`}
            href="/anniversaries"
            action="All dates"
          />
          <ul className="space-y-2">
            {soonDates.map((item) => {
              const days = daysUntilNext(item.date, today);
              const soon = isWithinReminder(item, today);
              const years = yearsAtNext(item.date, today);
              return (
                <li
                  key={item.id}
                  className="card"
                  style={
                    soon
                      ? { borderColor: "var(--accent)", borderWidth: 2 }
                      : undefined
                  }
                >
                  <Link
                    href="/anniversaries"
                    className="flex items-center gap-3 px-3 py-2"
                    style={{ minHeight: 52 }}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium">
                        {item.title}
                      </span>
                      {years !== null && (
                        <span className="muted mt-0.5 block text-xs">
                          {years} years
                        </span>
                      )}
                    </span>
                    <span
                      className="shrink-0 rounded-full px-2 py-1 text-[11px] font-semibold"
                      style={
                        soon
                          ? {
                              background: "var(--accent)",
                              color: "var(--accent-text)",
                            }
                          : {
                              background: "var(--bg)",
                              color: "var(--text-muted)",
                            }
                      }
                    >
                      {countdownLabel(days)}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {/* ── Open memos ── */}
      {openMemoCount > 0 && (
        <section className="mb-5">
          <SectionHeading
            title={`Open memos · ${openMemoCount}`}
            href="/memos"
            action="All memos"
          />
          <ul className="space-y-2">
            {openMemos.map((memo) => (
              <li key={memo.id} className="card">
                <Link
                  href="/memos"
                  className="block px-3 py-2 text-sm"
                  style={{ minHeight: 44 }}
                >
                  {memo.body}
                </Link>
              </li>
            ))}
          </ul>
          {openMemoCount > openMemos.length && (
            <Link
              href="/memos"
              className="muted mt-2 block px-1 text-xs underline"
            >
              {openMemoCount - openMemos.length} more
            </Link>
          )}
        </section>
      )}

      {/* ── Groceries ── */}
      <section className="mb-5">
        <SectionHeading title="Groceries" href="/groceries" action="Open list" />
        <Link href="/groceries" className="card flex items-center gap-3 p-4">
          <span className="text-2xl font-semibold">{toBuy}</span>
          <span className="muted text-sm">
            {toBuy === 0
              ? "nothing to buy"
              : `item${toBuy === 1 ? "" : "s"} to buy`}
          </span>
        </Link>
      </section>

      {/* Only shown once push is configured on the server. */}
      {process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && (
        <div className="mb-4">
          <NotificationSettings
            vapidPublicKey={process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY}
          />
        </div>
      )}

      <section className="card mb-4 p-4">
        <h2 className="text-sm font-semibold">Invite your family</h2>
        <p className="muted mb-3 mt-1 text-xs">
          Send the link. They sign in with their own email and land straight in
          this family — nothing to type in.
        </p>
        <InviteLink code={member.inviteCode} />
      </section>

      <div
        className="mt-6 border-t pt-4"
        style={{ borderColor: "var(--border)" }}
      >
        <p className="muted mb-3 text-center text-xs">
          Signed in as {user.email}
        </p>
        <form action="/auth/signout" method="post">
          <button type="submit" className="btn btn-secondary w-full">
            Sign out
          </button>
        </form>
      </div>
    </main>
  );
}
