"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Re-fetches the current server-rendered page when the app comes back to the
 * foreground.
 *
 * The dashboard aggregates four things and is the first screen you see, so a
 * stale snapshot is noticeable — you'd reopen the app to yesterday's numbers.
 * A refresh on return is far cheaper than four realtime subscriptions, and
 * matches how the screen is actually used: glanced at on opening.
 */
export function RefreshOnFocus({
  /** Ignore returns sooner than this, so tab-switching doesn't spam the server. */
  minIntervalMs = 15_000,
}: {
  minIntervalMs?: number;
}) {
  const router = useRouter();

  useEffect(() => {
    let lastRefresh = Date.now();

    const maybeRefresh = () => {
      if (document.visibilityState !== "visible") return;
      if (Date.now() - lastRefresh < minIntervalMs) return;
      lastRefresh = Date.now();
      router.refresh();
    };

    document.addEventListener("visibilitychange", maybeRefresh);
    window.addEventListener("focus", maybeRefresh);
    return () => {
      document.removeEventListener("visibilitychange", maybeRefresh);
      window.removeEventListener("focus", maybeRefresh);
    };
  }, [router, minIntervalMs]);

  return null;
}
