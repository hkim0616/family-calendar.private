import { createSupabaseServerClient } from "@/lib/supabase/server";

export type CurrentMember = {
  memberId: string;
  displayName: string;
  role: string;
  familyId: string;
  familyName: string;
  inviteCode: string;
};

/**
 * The signed-in person's membership, or null if they haven't set up a family
 * yet (which is what sends first-time users to /onboarding).
 *
 * Row-Level Security already limits `members` to the current user's own rows,
 * so no user filter is needed here.
 */
export async function getCurrentMember(): Promise<CurrentMember | null> {
  const supabase = createSupabaseServerClient();

  const { data, error } = await supabase
    .from("members")
    .select("id, name, role, family_id, families ( name, invite_code )")
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
  };
}
