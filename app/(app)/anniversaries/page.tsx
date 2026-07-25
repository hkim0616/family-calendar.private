import { redirect } from "next/navigation";

import type { Anniversary } from "@/lib/anniversaries";
import { getCurrentMember } from "@/lib/family";
import { createSupabaseServerClient } from "@/lib/supabase/server";

import { AnniversariesList } from "./anniversaries-list";

export const dynamic = "force-dynamic";
export const metadata = { title: "Dates — Family Hub" };

export default async function AnniversariesPage() {
  const member = await getCurrentMember();
  if (!member) redirect("/onboarding");

  const supabase = createSupabaseServerClient();

  // RLS scopes this to the caller's family automatically.
  const { data } = await supabase
    .from("anniversaries")
    .select("id, title, date, remind_days_before")
    .order("date", { ascending: true })
    .limit(300);

  return (
    <AnniversariesList
      familyId={member.familyId}
      initialItems={(data ?? []) as Anniversary[]}
    />
  );
}
