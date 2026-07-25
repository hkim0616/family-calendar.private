"use client";

import type { LiveStatus } from "@/lib/use-realtime-list";

const LOOK: Record<LiveStatus, { label: string; color: string; pulse: boolean }> =
  {
    live: { label: "Live", color: "var(--success)", pulse: true },
    connecting: { label: "Connecting…", color: "var(--text-muted)", pulse: false },
    offline: { label: "Not live", color: "var(--danger)", pulse: false },
  };

/**
 * Small dot showing whether this screen is receiving live updates.
 *
 * Worth the pixels: without it, "the other phone didn't update" is
 * indistinguishable from "the connection dropped".
 */
export function LiveBadge({ status }: { status: LiveStatus }) {
  const { label, color, pulse } = LOOK[status];

  return (
    <span className="inline-flex items-center gap-1.5" title={label}>
      <span
        className={`inline-block h-1.5 w-1.5 rounded-full ${pulse ? "animate-pulse" : ""}`}
        style={{ background: color }}
      />
      <span className="text-[11px] font-medium" style={{ color }}>
        {label}
      </span>
    </span>
  );
}
