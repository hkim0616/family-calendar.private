"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { createSupabaseServerClient } from "@/lib/supabase/server";

export type CreateFamilyState = { error: string | null };

/**
 * Creates the family and the caller's owner membership in one shot.
 *
 * The work happens inside the `create_family` database function rather than as
 * two inserts from here: writing a `members` row for a family you don't belong
 * to yet is something Row-Level Security rightly forbids, and the function is
 * the one vetted way through. It also means the two rows can't half-succeed.
 */
export async function createFamilyAction(
  _prev: CreateFamilyState,
  formData: FormData,
): Promise<CreateFamilyState> {
  const familyName = String(formData.get("familyName") ?? "").trim();
  const displayName = String(formData.get("displayName") ?? "").trim();

  if (!familyName) return { error: "Please give your family a name." };
  if (!displayName) return { error: "Please enter your own name." };

  const supabase = createSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { error } = await supabase.rpc("create_family", {
    family_name: familyName,
    display_name: displayName,
  });

  if (error) return { error: error.message };

  revalidatePath("/");
  redirect("/");
}
