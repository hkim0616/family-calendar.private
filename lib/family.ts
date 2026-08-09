import { cache } from "react";
import type { User } from "@supabase/supabase-js";

import { createSupabaseServerClient } from "@/lib/supabase/server";

export type CurrentMember = {
  memberId: string;
  displayName: string;
  role: string;
  familyId: string;
  familyName: string;
  inviteCode: string;
  /** Secret for the read-only .ics feed. Never render this outside the app. */
  calendarToken: string;
};

/**
 * The signed-in auth user, or null.
 *
 * Wrapped in React's `cache` so the layout, the page and anything else
 * rendering the same request share a single round trip to Supabase instead of
 * each paying for their own.
 */
export const getSessionUser = cache(async (): Promise<User | null> => {
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
});

/**
 * The signed-in person's membership, or null if they haven't set up a family
 * yet (which is what sends first-time users to /onboarding).
 *
 * The `auth_user_id` filter is load-bearing. RLS on `members` deliberately
 * exposes *everyone in your family* — that's what lets the app show who wrote
 * what — so without it this returns whichever member joined first, and every
 * person in the family is greeted by, and posts as, the family's creator.
 *
 * Cached per request: the app layout and the page beneath it both need this.
 */
export const getCurrentMember = cache(
  async (): Promise<CurrentMember | null> => {
    const user = await getSessionUser();
    if (!user) return null;

    const supabase = createSupabaseServerClient();

    const { data, error } = await supabase
      .from("members")
      .select(
        "id, name, role, family_id, families ( name, invite_code, calendar_token )",
      )
      .eq("auth_user_id", user.id)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (error || !data) return null;

    // A to-one embed comes back as an object; narrow defensively since we don't
    // have generated DB types yet.
    const family = Array.isArray(data.families)
      ? data.families[0]
      : data.families;

    return {
      memberId: data.id,
      displayName: data.name,
      role: data.role,
      familyId: data.family_id,
      familyName: family?.name ?? "Your family",
      inviteCode: family?.invite_code ?? "—",
      calendarToken: family?.calendar_token ?? "",
    };
  },
);
