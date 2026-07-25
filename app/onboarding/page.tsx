import { redirect } from "next/navigation";

import { getCurrentMember } from "@/lib/family";
import { createSupabaseServerClient } from "@/lib/supabase/server";

import { CreateFamilyForm } from "./create-family-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "Set up your family — Family Hub" };

/** "hyun.kim@gmail.com" → "Hyun Kim", as a starting suggestion only. */
function guessNameFromEmail(email: string | undefined): string {
  if (!email) return "";
  const local = email.split("@")[0] ?? "";
  return local
    .split(/[._-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

export default async function OnboardingPage() {
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  // Already set up — nothing to do here.
  const member = await getCurrentMember();
  if (member) redirect("/");

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-5 py-10">
      <div className="mb-6 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">
          Set up your family
        </h1>
        <p className="muted mt-2 text-sm">
          Start a new family, or join one someone already made. Everything in
          Family Hub is shared inside your family and visible to nobody else.
        </p>
      </div>

      <div className="card p-5">
        <CreateFamilyForm suggestedName={guessNameFromEmail(user.email)} />
      </div>

      <form action="/auth/signout" method="post" className="mt-4">
        <button
          type="submit"
          className="muted w-full text-center text-xs underline"
        >
          Sign out
        </button>
      </form>
    </main>
  );
}
