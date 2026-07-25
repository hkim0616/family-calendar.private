import { redirect } from "next/navigation";

import { getCurrentMember } from "@/lib/family";
import { createSupabaseServerClient } from "@/lib/supabase/server";

import { GroceryList, type GroceryItem } from "./grocery-list";

export const dynamic = "force-dynamic";
export const metadata = { title: "Groceries — Family Hub" };

export default async function GroceriesPage() {
  const member = await getCurrentMember();
  if (!member) redirect("/onboarding");

  const supabase = createSupabaseServerClient();

  // RLS scopes this to the caller's family automatically.
  const { data: items } = await supabase
    .from("grocery_items")
    .select("id, name, checked, added_by, created_at")
    .order("created_at", { ascending: true })
    .limit(300);

  return (
    <GroceryList
      familyId={member.familyId}
      currentMemberId={member.memberId}
      initialItems={(items ?? []) as GroceryItem[]}
    />
  );
}
