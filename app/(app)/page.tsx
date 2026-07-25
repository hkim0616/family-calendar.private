import Link from "next/link";
import { redirect } from "next/navigation";

import { BOTTOM_NAV_SPACER } from "@/components/bottom-nav";
import { InviteCode } from "@/components/invite-code";
import { getCurrentMember } from "@/lib/family";
import { createSupabaseServerClient } from "@/lib/supabase/server";

// Auth state is per-request, so this page must never be statically cached.
export const dynamic = "force-dynamic";

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

  // Small counts so Home is useful at a glance. The full dashboard is P4.
  const [{ count: openMemos }, { count: toBuy }, { count: memberCount }] =
    await Promise.all([
      supabase
        .from("memos")
        .select("*", { count: "exact", head: true })
        .eq("done", false),
      supabase
        .from("grocery_items")
        .select("*", { count: "exact", head: true })
        .eq("checked", false),
      supabase.from("members").select("*", { count: "exact", head: true }),
    ]);

  return (
    <main className={`mx-auto max-w-md px-5 py-8 ${BOTTOM_NAV_SPACER}`}>
      <header className="mb-6">
        <p className="muted text-sm">{member.familyName}</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">
          Hello, {member.displayName} 👋
        </h1>
      </header>

      <div className="mb-4 grid grid-cols-2 gap-3">
        <Link href="/memos" className="card p-4">
          <p className="text-2xl font-semibold">{openMemos ?? 0}</p>
          <p className="muted mt-0.5 text-xs">
            open memo{openMemos === 1 ? "" : "s"}
          </p>
        </Link>
        <Link href="/groceries" className="card p-4">
          <p className="text-2xl font-semibold">{toBuy ?? 0}</p>
          <p className="muted mt-0.5 text-xs">
            item{toBuy === 1 ? "" : "s"} to buy
          </p>
        </Link>
      </div>

      <section className="card mb-4 px-4 py-3">
        <h2 className="text-sm font-semibold">
          {memberCount === 1
            ? "Invite your family"
            : `${memberCount} people in this family`}
        </h2>
        <p className="muted mb-1 mt-1 text-xs">
          {memberCount === 1
            ? "Share this code — they enter it on their own phone under “Join with a code”."
            : "Anyone with this code can join the family."}
        </p>
        <div className="border-t pt-1" style={{ borderColor: "var(--border)" }}>
          <InviteCode code={member.inviteCode} />
        </div>
      </section>

      <h2 className="muted mb-3 px-1 text-xs font-medium uppercase tracking-wide">
        Coming next
      </h2>
      <div className="space-y-3">
        {[
          {
            title: "Schedule",
            description: "Shared calendar with month and agenda views.",
          },
          {
            title: "Anniversaries",
            description: "Yearly dates with reminders ahead of time.",
          },
        ].map(({ title, description }) => (
          <div
            key={title}
            className="card flex items-start justify-between gap-3 p-4"
          >
            <div>
              <h3 className="text-sm font-semibold">{title}</h3>
              <p className="muted mt-0.5 text-xs">{description}</p>
            </div>
            <span
              className="shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium"
              style={{ background: "var(--bg)", color: "var(--text-muted)" }}
            >
              Next
            </span>
          </div>
        ))}
      </div>

      <div
        className="mt-8 border-t pt-4"
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
