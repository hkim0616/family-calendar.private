import { redirect } from "next/navigation";

import { getCurrentMember } from "@/lib/family";
import type { CalendarEvent } from "@/lib/calendar";
import { createSupabaseServerClient } from "@/lib/supabase/server";

import { ScheduleView } from "./schedule-view";

export const dynamic = "force-dynamic";
export const metadata = { title: "Schedule — Family Hub" };

export default async function SchedulePage() {
  const member = await getCurrentMember();
  if (!member) redirect("/onboarding");

  const supabase = createSupabaseServerClient();

  // RLS scopes this to the caller's family automatically. A generous window
  // rather than everything, so the payload stays small on a phone.
  const from = new Date();
  from.setMonth(from.getMonth() - 6);
  const to = new Date();
  to.setMonth(to.getMonth() + 18);

  const { data: events } = await supabase
    .from("events")
    .select("id, title, starts_at, ends_at, all_day, note")
    .gte("starts_at", from.toISOString())
    .lte("starts_at", to.toISOString())
    .order("starts_at", { ascending: true })
    .limit(1000);

  return (
    <ScheduleView
      familyId={member.familyId}
      currentMemberId={member.memberId}
      calendarToken={member.calendarToken}
      initialEvents={(events ?? []) as CalendarEvent[]}
    />
  );
}
