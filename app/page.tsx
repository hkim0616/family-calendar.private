import { redirect } from "next/navigation";

import { getCurrentMember } from "@/lib/family";
import { createSupabaseServerClient } from "@/lib/supabase/server";

// Auth state is per-request, so this page must never be statically cached.
export const dynamic = "force-dynamic";

/** Placeholder for a feature that lands in a later phase. */
function ComingSoon({
  title,
  description,
  phase,
}: {
  title: string;
  description: string;
  phase: string;
}) {
  return (
    <div className="card flex items-start justify-between gap-3 p-4">
      <div>
        <h3 className="text-sm font-semibold">{title}</h3>
        <p className="muted mt-0.5 text-xs">{description}</p>
      </div>
      <span
        className="shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium"
        style={{ background: "var(--bg)", color: "var(--text-muted)" }}
      >
        {phase}
      </span>
    </div>
  );
}

export default async function Home() {
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // middleware.ts already redirects signed-out visitors, but a page that shows
  // family data shouldn't rely on that alone.
  if (!user) redirect("/login");

  const member = await getCurrentMember();

  // First time in: no family yet.
  if (!member) redirect("/onboarding");

  return (
    <main className="mx-auto max-w-md px-5 py-8 pb-[max(2rem,env(safe-area-inset-bottom))]">
      <header className="mb-6">
        <p className="muted text-sm">{member.familyName}</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">
          Hello, {member.displayName} 👋
        </h1>
      </header>

      <section className="card mb-6 p-4">
        <h2 className="text-sm font-semibold">You&apos;re all set up</h2>
        <p className="muted mt-1 text-sm">
          Your family is created and everything below is shared privately
          between its members.
        </p>
        <div
          className="mt-3 flex items-center justify-between border-t pt-3"
          style={{ borderColor: "var(--border)" }}
        >
          <span className="muted text-xs">Invite code</span>
          <code className="text-sm font-semibold tracking-widest">
            {member.inviteCode}
          </code>
        </div>
        <p className="muted mt-2 text-xs">
          Sharing this with family comes in the next phase.
        </p>
      </section>

      <h2 className="muted mb-3 px-1 text-xs font-medium uppercase tracking-wide">
        Coming next
      </h2>
      <div className="space-y-3">
        <ComingSoon
          title="Memos"
          description="Shared notes and to-dos for the family board."
          phase="P2"
        />
        <ComingSoon
          title="Grocery list"
          description="Add items and check them off live."
          phase="P2"
        />
        <ComingSoon
          title="Schedule"
          description="Shared calendar with month and agenda views."
          phase="P3"
        />
        <ComingSoon
          title="Anniversaries"
          description="Yearly dates with reminders ahead of time."
          phase="P3"
        />
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
