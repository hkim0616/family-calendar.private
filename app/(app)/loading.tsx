import { BOTTOM_NAV_SPACER } from "@/components/bottom-nav";

/**
 * Shown the instant a tab is tapped, while the real screen is fetched.
 *
 * Without this file the App Router has nothing to render during a navigation,
 * so it keeps the *previous* screen on display until the server responds —
 * which reads as a dead button and gets tapped again. Every screen here is
 * `force-dynamic` and queries Supabase, so that gap is real, and on a phone on
 * mobile data it is long enough to matter.
 */
export default function Loading() {
  return (
    <main
      data-testid="screen-skeleton"
      className={`mx-auto max-w-md px-5 py-8 ${BOTTOM_NAV_SPACER}`}
    >
      <div className="animate-pulse space-y-4" aria-hidden="true">
        <div
          className="h-7 w-40 rounded-lg"
          style={{ background: "var(--border)" }}
        />
        <div className="space-y-2">
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className="card"
              style={{ height: 60, opacity: 1 - i * 0.18 }}
            />
          ))}
        </div>
      </div>
      <span className="sr-only" role="status">
        Loading
      </span>
    </main>
  );
}
