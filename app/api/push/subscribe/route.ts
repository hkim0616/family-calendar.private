import { NextResponse, type NextRequest } from "next/server";

import { getCurrentMember } from "@/lib/family";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

/**
 * Stores or removes this device's push subscription.
 *
 * Runs as the signed-in user, so Row-Level Security keeps each member's device
 * endpoints to themselves — an endpoint is a capability URL, and anyone holding
 * it can push to that phone.
 */

type SubscribeBody = {
  endpoint?: unknown;
  keys?: { p256dh?: unknown; auth?: unknown };
  deviceLabel?: unknown;
};

function asString(value: unknown, max = 1000): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > max) return null;
  return trimmed;
}

export async function POST(request: NextRequest) {
  const member = await getCurrentMember();
  if (!member) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  let body: SubscribeBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const endpoint = asString(body.endpoint, 2000);
  const p256dh = asString(body.keys?.p256dh, 500);
  const auth = asString(body.keys?.auth, 500);
  const deviceLabel = asString(body.deviceLabel, 80);

  if (!endpoint || !p256dh || !auth) {
    return NextResponse.json(
      { error: "Missing subscription details" },
      { status: 400 },
    );
  }

  // Push endpoints are always https. Refuse anything else outright.
  if (!endpoint.startsWith("https://")) {
    return NextResponse.json({ error: "Invalid endpoint" }, { status: 400 });
  }

  const supabase = createSupabaseServerClient();

  // The same phone re-subscribing should update its row, not create a second.
  const { error } = await supabase.from("push_subscriptions").upsert(
    {
      family_id: member.familyId,
      member_id: member.memberId,
      endpoint,
      p256dh,
      auth,
      device_label: deviceLabel,
    },
    { onConflict: "endpoint" },
  );

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(request: NextRequest) {
  const member = await getCurrentMember();
  if (!member) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  let body: SubscribeBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const endpoint = asString(body.endpoint, 2000);
  if (!endpoint) {
    return NextResponse.json({ error: "Missing endpoint" }, { status: 400 });
  }

  const supabase = createSupabaseServerClient();
  // RLS restricts this to the caller's own rows.
  const { error } = await supabase
    .from("push_subscriptions")
    .delete()
    .eq("endpoint", endpoint);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
