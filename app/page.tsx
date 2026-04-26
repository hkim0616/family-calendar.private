import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type HealthStatus =
  | { ok: true; eventCount: number }
  | { ok: false; reason: string };

async function checkSupabase(): Promise<HealthStatus> {
  try {
    const supabase = createSupabaseServerClient();
    const { count, error } = await supabase
      .from("events")
      .select("*", { count: "exact", head: true });

    if (error) {
      return { ok: false, reason: error.message };
    }
    return { ok: true, eventCount: count ?? 0 };
  } catch (err) {
    return {
      ok: false,
      reason: err instanceof Error ? err.message : "Unknown error",
    };
  }
}

export default async function Home() {
  const status = await checkSupabase();

  return (
    <main className="min-h-screen p-8 sm:p-16 max-w-2xl mx-auto">
      <h1 className="text-3xl font-bold mb-2">Family Calendar</h1>
      <p className="text-sm text-gray-500 mb-8">
        Scaffolding healthcheck — the real UI lands in the next step.
      </p>

      <section className="rounded-lg border border-gray-200 p-4">
        <h2 className="text-lg font-semibold mb-2">Supabase connection</h2>
        {status.ok ? (
          <p className="text-green-600">
            ✓ Connected — events table reachable ({status.eventCount} rows)
          </p>
        ) : (
          <div>
            <p className="text-red-600 mb-2">✗ Not connected</p>
            <p className="text-sm text-gray-600 break-all">{status.reason}</p>
            <p className="text-xs text-gray-500 mt-2">
              Check <code>.env.local</code> and that{" "}
              <code>supabase/schema.sql</code> has been applied.
            </p>
          </div>
        )}
      </section>
    </main>
  );
}
