import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { supabaseAnonKey, supabaseUrl } from "@/lib/env";
import { buildIcs, type IcsEvent } from "@/lib/ics";

/**
 * The .ics calendar feed: GET /api/calendar/<calendar_token>.ics
 *
 * Deliberately unauthenticated — a subscribing calendar app can't sign in, so
 * the random token in the path is the credential. It reaches the data through
 * the `calendar_feed` database function, which is scoped to exactly one family.
 *
 * Read-only. There is no way to write anything through this route.
 */

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type FeedRow = {
  family_name: string;
  event_id: string | null;
  title: string | null;
  starts_at: string | null;
  ends_at: string | null;
  all_day: boolean | null;
  note: string | null;
  updated_at: string | null;
};

export async function GET(
  _request: NextRequest,
  { params }: { params: { token: string } },
) {
  // The URL ends in .ics so calendar apps recognise it; strip that to get the token.
  const token = params.token.replace(/\.ics$/i, "");

  // Reject malformed tokens before touching the database.
  if (!UUID_RE.test(token)) {
    return new NextResponse("Not found", { status: 404 });
  }

  // A bare client with no cookie handling: this request has no session, and the
  // feed function doesn't want one.
  const supabase = createServerClient(supabaseUrl(), supabaseAnonKey(), {
    cookies: { getAll: () => [], setAll: () => {} },
  });

  const { data, error } = await supabase.rpc("calendar_feed", { token });

  if (error) {
    return new NextResponse("Calendar unavailable", { status: 502 });
  }

  const rows = (data ?? []) as FeedRow[];

  // No rows at all means the token matched no family.
  if (rows.length === 0) {
    return new NextResponse("Not found", { status: 404 });
  }

  const calendarName = `${rows[0].family_name} — Family Hub`;

  const events: IcsEvent[] = rows
    // The LEFT JOIN yields one all-null event row for a family with no events.
    .filter((r): r is FeedRow & { event_id: string } => r.event_id !== null)
    .map((r) => ({
      id: r.event_id,
      title: r.title ?? "(untitled)",
      startsAt: r.starts_at ?? "",
      endsAt: r.ends_at ?? r.starts_at ?? "",
      allDay: r.all_day ?? false,
      note: r.note,
      updatedAt: r.updated_at,
    }));

  const body = buildIcs({ calendarName, events });

  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      // Lets a browser save it as a file while calendar apps stream it.
      "Content-Disposition": 'inline; filename="family-hub.ics"',
      // Short cache: subscribers poll on their own schedule, and we don't want
      // a CDN pinning a stale calendar for long.
      "Cache-Control": "private, max-age=300, must-revalidate",
      // The URL is a secret; keep it out of search engines and referrers.
      "X-Robots-Tag": "noindex, nofollow",
      "Referrer-Policy": "no-referrer",
    },
  });
}
