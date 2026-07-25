import { createSupabaseServerClient } from "@/lib/supabase/server";

// Auth state is per-request, so this page must never be statically cached.
export const dynamic = "force-dynamic";

type Membership = {
  name: string;
  role: string;
  familyName: string;
  inviteCode: string;
};

type DbCheck =
  | { ok: true; membership: Membership | null }
  | { ok: false; reason: string };

async function loadMembership(): Promise<DbCheck> {
  try {
    const supabase = createSupabaseServerClient();

    // RLS limits this to the signed-in user's own membership rows, so there's
    // no need to filter by user id here.
    const { data, error } = await supabase
      .from("members")
      .select("name, role, families ( name, invite_code )")
      .limit(1)
      .maybeSingle();

    if (error) return { ok: false, reason: error.message };
    if (!data) return { ok: true, membership: null };

    // The embedded family comes back as an object for a to-one relationship,
    // but generated DB types aren't in play yet — narrow defensively.
    const family = Array.isArray(data.families)
      ? data.families[0]
      : data.families;

    return {
      ok: true,
      membership: {
        name: data.name,
        role: data.role,
        familyName: family?.name ?? "Unknown family",
        inviteCode: family?.invite_code ?? "—",
      },
    };
  } catch (err) {
    return {
      ok: false,
      reason: err instanceof Error ? err.message : "Unknown error",
    };
  }
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2.5">
      <span className="muted shrink-0 text-sm">{label}</span>
      <span className="text-right text-sm font-medium">{value}</span>
    </div>
  );
}

export default async function Home() {
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const check = await loadMembership();

  return (
    <main className="mx-auto max-w-md px-5 py-8 pb-[max(2rem,env(safe-area-inset-bottom))]">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Family Hub</h1>
        <p className="muted mt-1 text-sm">
          Foundation is in place. Features arrive over the next phases.
        </p>
      </header>

      <section
        className="card mb-4 divide-y px-4 py-2"
        style={{ borderColor: "var(--border)" }}
      >
        <Row label="Signed in as" value={user?.email ?? "—"} />
        <Row
          label="Database"
          value={
            check.ok ? (
              <span style={{ color: "var(--success)" }}>Connected</span>
            ) : (
              <span style={{ color: "var(--danger)" }}>Problem</span>
            )
          }
        />
        {check.ok && (
          <Row
            label="Family"
            value={
              check.membership ? (
                check.membership.familyName
              ) : (
                <span className="muted font-normal">Not set up yet</span>
              )
            }
          />
        )}
        {check.ok && check.membership && (
          <Row label="Invite code" value={check.membership.inviteCode} />
        )}
      </section>

      {!check.ok && (
        <section className="card mb-4 p-4">
          <h2
            className="mb-2 text-sm font-semibold"
            style={{ color: "var(--danger)" }}
          >
            Database not reachable
          </h2>
          <p className="muted break-all text-xs">{check.reason}</p>
          <p className="muted mt-3 text-xs">
            Most likely <code>supabase/schema.sql</code> hasn&apos;t been run in
            the Supabase SQL Editor yet — see <code>SETUP.md</code> step 3.
          </p>
        </section>
      )}

      {check.ok && !check.membership && (
        <section className="card mb-4 p-4">
          <h2 className="mb-1 text-sm font-semibold">What&apos;s next</h2>
          <p className="muted text-sm">
            You&apos;re signed in and the database is responding. Creating your
            family and inviting members comes in the next phase.
          </p>
        </section>
      )}

      <form action="/auth/signout" method="post">
        <button type="submit" className="btn btn-secondary w-full">
          Sign out
        </button>
      </form>
    </main>
  );
}
