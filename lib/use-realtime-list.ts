"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";

import {
  removeRow,
  upsertRow,
  type WithId,
} from "@/lib/realtime-merge";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

export type { WithId };

export type LiveStatus = "connecting" | "live" | "offline";

/**
 * Keeps a list of rows in sync with a Postgres table in real time.
 *
 * Server components fetch the first page so the screen paints immediately; this
 * hook takes over from there, applying inserts, updates and deletes as they
 * happen on any device in the family.
 *
 * Row-Level Security applies to the realtime stream too, so a subscriber only
 * ever receives changes for rows they're allowed to read. The `family_id`
 * filter below is therefore about avoiding pointless traffic, not access
 * control.
 */
export function useRealtimeList<T extends WithId>({
  table,
  familyId,
  initial,
  sort,
}: {
  table: string;
  familyId: string;
  initial: T[];
  /** Ordering applied after every change, so all devices agree on the order. */
  sort: (a: T, b: T) => number;
}) {
  const [rows, setRows] = useState<T[]>(() => [...initial].sort(sort));
  const [status, setStatus] = useState<LiveStatus>("connecting");

  // Held in a ref so changing the sort function doesn't tear down the
  // subscription and reconnect.
  const sortRef = useRef(sort);
  sortRef.current = sort;

  /** Insert-or-replace by id, then re-sort. Safe to call for any event. */
  const upsert = useCallback((row: T) => {
    setRows((current) => upsertRow(current, row, sortRef.current));
  }, []);

  const remove = useCallback((id: string) => {
    setRows((current) => removeRow(current, id));
  }, []);

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    let channel: RealtimeChannel | null = null;
    let cancelled = false;

    (async () => {
      // Hand the realtime socket the user's access token before subscribing.
      // Without this it can connect as an anonymous user, in which case RLS
      // correctly filters out every row and the stream looks silently dead.
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (cancelled) return;
      if (session?.access_token) {
        await supabase.realtime.setAuth(session.access_token);
      }

      channel = supabase
        .channel(`${table}-${familyId}`)
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table,
            filter: `family_id=eq.${familyId}`,
          },
          (payload) => {
            if (payload.eventType === "DELETE") {
              // Needs REPLICA IDENTITY FULL on the table, otherwise old rows
              // arrive with only their primary key — see supabase/schema.sql.
              const oldRow = payload.old as Partial<T> | null;
              if (oldRow?.id) remove(oldRow.id);
              return;
            }
            upsert(payload.new as T);
          },
        )
        .subscribe((state) => {
          if (cancelled) return;
          if (state === "SUBSCRIBED") setStatus("live");
          else if (state === "CHANNEL_ERROR" || state === "TIMED_OUT")
            setStatus("offline");
          else if (state === "CLOSED") setStatus("connecting");
        });
    })();

    return () => {
      cancelled = true;
      if (channel) supabase.removeChannel(channel);
    };
  }, [table, familyId, upsert, remove]);

  return { rows, setRows, status, upsert, remove };
}
