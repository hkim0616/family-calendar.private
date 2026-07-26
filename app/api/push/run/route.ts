import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import webpush from "web-push";

import { todayKey } from "@/lib/anniversaries";
import { supabaseAnonKey, supabaseUrl } from "@/lib/env";
import { planForFamily, type FamilyPushData } from "@/lib/push/plan";

// web-push needs Node crypto, not the edge runtime.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The scheduled job that actually sends reminders.
 *
 * Called by pg_cron in Supabase, once a day, with the shared scheduler secret
 * as a bearer token. That token is the only credential: it is forwarded to the
 * `push_*` database functions, each of which verifies it before returning
 * anything. There is no service-role key anywhere in this app, so a mistake
 * here still can't read across families arbitrarily.
 *
 * Sending order is claim → send → release-on-total-failure, so a notification
 * goes out at most once, and a run that fails to reach anybody is retried
 * tomorrow rather than being silently lost.
 */

type Subscription = { endpoint: string; p256dh: string; auth: string };
type FamilyRow = FamilyPushData & { subscriptions: Subscription[] };

/** Push services report a gone-away device with one of these. */
const DEAD_SUBSCRIPTION_CODES = new Set([404, 410]);

function bearerToken(request: NextRequest): string | null {
  const header = request.headers.get("authorization") ?? "";
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match ? match[1].trim() : null;
}

async function handle(request: NextRequest) {
  const secret = bearerToken(request);
  if (!secret) {
    return NextResponse.json({ error: "Missing bearer token" }, { status: 401 });
  }

  const vapidPublic = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const vapidPrivate = process.env.VAPID_PRIVATE_KEY;
  if (!vapidPublic || !vapidPrivate) {
    return NextResponse.json(
      { error: "VAPID keys are not configured" },
      { status: 500 },
    );
  }

  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || "mailto:nobody@example.com",
    vapidPublic,
    vapidPrivate,
  );

  // No cookies: this request has no user session, and the RPCs below don't want
  // one — they authorise on the secret instead.
  const supabase = createServerClient(supabaseUrl(), supabaseAnonKey(), {
    cookies: { getAll: () => [], setAll: () => {} },
  });

  const { data, error } = await supabase.rpc("push_due", { secret });
  if (error) {
    // The RPC raises "Unauthorized" for a bad secret; don't leak which.
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const families = (data ?? []) as FamilyRow[];
  const today = todayKey();

  let sent = 0;
  let skipped = 0;
  let failed = 0;
  let pruned = 0;

  for (const family of families) {
    const planned = planForFamily(family, today);
    if (planned.length === 0 || family.subscriptions.length === 0) continue;

    for (const notification of planned) {
      // Claim first: if another run already took this key, stay quiet.
      const { data: claimed, error: claimError } = await supabase.rpc(
        "push_claim",
        {
          secret,
          target_family_id: family.family_id,
          key: notification.dedupeKey,
        },
      );

      if (claimError) {
        failed += 1;
        continue;
      }
      if (claimed !== true) {
        skipped += 1;
        continue;
      }

      const payload = JSON.stringify({
        title: notification.title,
        body: notification.body,
        url: notification.url,
        tag: notification.tag,
      });

      let reachedAnyone = false;

      for (const subscription of family.subscriptions) {
        try {
          await webpush.sendNotification(
            {
              endpoint: subscription.endpoint,
              keys: { p256dh: subscription.p256dh, auth: subscription.auth },
            },
            payload,
            { TTL: 24 * 60 * 60, urgency: "normal" },
          );
          reachedAnyone = true;
          sent += 1;
          await supabase.rpc("push_touch", {
            secret,
            live_endpoint: subscription.endpoint,
          });
        } catch (err) {
          const status = (err as { statusCode?: number }).statusCode;
          if (status && DEAD_SUBSCRIPTION_CODES.has(status)) {
            // The app was uninstalled or the subscription expired.
            await supabase.rpc("push_forget", {
              secret,
              dead_endpoint: subscription.endpoint,
            });
            pruned += 1;
          } else {
            failed += 1;
          }
        }
      }

      // Nobody got it — give the claim back so tomorrow's run tries again.
      if (!reachedAnyone) {
        await supabase.rpc("push_release", {
          secret,
          key: notification.dedupeKey,
        });
      }
    }
  }

  return NextResponse.json({
    ok: true,
    today,
    families: families.length,
    sent,
    skipped,
    failed,
    pruned,
  });
}

// pg_net posts; POST is the real entry point. GET is allowed too so the run can
// be triggered by hand from a browser while setting things up.
export async function POST(request: NextRequest) {
  return handle(request);
}

export async function GET(request: NextRequest) {
  return handle(request);
}
