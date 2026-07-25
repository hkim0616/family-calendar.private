"use client";

import { useEffect, useState } from "react";

import { createSupabaseBrowserClient } from "@/lib/supabase/client";

/**
 * "Export to calendar" — the .ics subscription link.
 *
 * Two links, because they do different things:
 *   - webcal:// hands iOS/macOS straight to the Calendar subscribe dialog, and
 *     the calendar then keeps polling for changes.
 *   - https:// downloads a one-off snapshot, which is what other apps want.
 */
export function SubscribeCard({ initialToken }: { initialToken: string }) {
  const [token, setToken] = useState(initialToken);
  const [origin, setOrigin] = useState("");
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // window isn't available during server rendering.
  useEffect(() => setOrigin(window.location.origin), []);

  const httpsUrl = origin ? `${origin}/api/calendar/${token}.ics` : "";
  const webcalUrl = httpsUrl.replace(/^https?:\/\//, "webcal://");

  async function copy() {
    try {
      await navigator.clipboard.writeText(httpsUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // Clipboard access can be refused; the URL is on screen to copy by hand.
    }
  }

  async function resetToken() {
    if (
      !window.confirm(
        "Create a new link? Anyone still using the old link — including calendars already subscribed — will stop receiving updates.",
      )
    )
      return;

    setBusy(true);
    setError(null);
    const supabase = createSupabaseBrowserClient();
    const { data, error } = await supabase.rpc("reset_calendar_token");
    setBusy(false);

    if (error) {
      setError(error.message);
      return;
    }
    if (typeof data === "string") setToken(data);
  }

  return (
    <section className="card p-4">
      <h2 className="text-sm font-semibold">Export to calendar</h2>
      <p className="muted mt-1 text-xs">
        Subscribe on an iPhone, Mac or Google Calendar and it stays in sync as
        events change.
      </p>

      <a
        href={webcalUrl || "#"}
        className="btn btn-primary mt-3 w-full"
        aria-disabled={!webcalUrl}
      >
        Subscribe on this device
      </a>

      <button
        type="button"
        className="btn btn-secondary mt-2 w-full"
        onClick={copy}
        disabled={!httpsUrl}
      >
        {copied ? "Link copied" : "Copy link for another device"}
      </button>

      <p
        className="muted mt-3 break-all rounded-lg p-2 text-[11px]"
        style={{ background: "var(--bg)" }}
      >
        {httpsUrl || "…"}
      </p>

      <p className="muted mt-3 text-xs">
        <strong>Treat this link like a password.</strong> Anyone who has it can
        read your family&apos;s calendar — that&apos;s how calendar
        subscriptions work, since the calendar app can&apos;t log in. It is
        read-only and gives no access to memos or groceries.
      </p>

      <button
        type="button"
        className="mt-2 text-xs underline"
        style={{ color: "var(--text-muted)" }}
        onClick={resetToken}
        disabled={busy}
      >
        {busy ? "Creating…" : "Create a new link (revokes the old one)"}
      </button>

      {error && (
        <p className="mt-2 text-xs" style={{ color: "var(--danger)" }} role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
