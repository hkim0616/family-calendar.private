import { redirect } from "next/navigation";

import { getCurrentMember } from "@/lib/family";
import { createSupabaseServerClient } from "@/lib/supabase/server";

import { MemosBoard, type Memo } from "./memos-board";

export const dynamic = "force-dynamic";
export const metadata = { title: "Memos — Family Hub" };

export default async function MemosPage() {
  const member = await getCurrentMember();
  if (!member) redirect("/onboarding");

  const supabase = createSupabaseServerClient();

  // RLS scopes both of these to the caller's family automatically.
  const [{ data: memos }, { data: members }] = await Promise.all([
    supabase
      .from("memos")
      .select("id, body, done, author_id, created_at")
      .order("created_at", { ascending: false })
      .limit(200),
    supabase.from("members").select("id, name"),
  ]);

  // Realtime payloads carry author_id but not the author's name, so hand the
  // client a lookup table up front.
  const authorNames: Record<string, string> = {};
  for (const m of members ?? []) authorNames[m.id] = m.name;

  return (
    <MemosBoard
      familyId={member.familyId}
      currentMemberId={member.memberId}
      authorNames={authorNames}
      initialMemos={(memos ?? []) as Memo[]}
    />
  );
}
