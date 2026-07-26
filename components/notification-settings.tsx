"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * "Turn on reminders" — asks for notification permission and registers this
 * device for push.
 *
 * The iOS rules this has to work around:
 *   - Web push needs iOS 16.4 or newer.
 *   - It only works in an app added to the Home Screen. In a Safari tab,
 *     PushManager isn't there at all, so we detect that and explain instead of
 *     showing a button that can't work.
 *   - Permission must be requested from a real tap, not on page load.
 */

type State =
  | "checking"
  | "unsupported" // no push in this browser at all
  | "needs-install" // iOS Safari tab: must be added to the Home Screen first
  | "denied" // permission refused; only the OS can undo this
  | "off"
  | "on"
  | "working";

/**
 * Base64url → bytes, the format PushManager wants for the VAPID key.
 *
 * Backed by an explicitly-allocated ArrayBuffer so the result is typed as
 * Uint8Array<ArrayBuffer>, which is what BufferSource requires — a plain
 * `new Uint8Array(n)` is Uint8Array<ArrayBufferLike> and won't satisfy it.
 */
function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const normalised = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(normalised);
  const output = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) output[i] = raw.charCodeAt(i);
  return output;
}

function isIos(): boolean {
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    // iPadOS 13+ reports itself as a Mac.
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  );
}

/** True when running as an installed app rather than a browser tab. */
function isStandalone(): boolean {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    // Safari's own non-standard flag.
    (window.navigator as { standalone?: boolean }).standalone === true
  );
}

function deviceLabel(): string {
  if (isIos()) return "iPhone or iPad";
  if (/Android/.test(navigator.userAgent)) return "Android phone";
  if (/Mac/.test(navigator.userAgent)) return "Mac";
  return "This device";
}

export function NotificationSettings({
  vapidPublicKey,
}: {
  vapidPublicKey: string;
}) {
  const [state, setState] = useState<State>("checking");
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!("serviceWorker" in navigator) || !("Notification" in window)) {
      setState("unsupported");
      return;
    }

    // On iOS, PushManager only exists once the app is installed to the Home
    // Screen — so its absence there is an instruction, not a dead end.
    if (!("PushManager" in window)) {
      setState(isIos() && !isStandalone() ? "needs-install" : "unsupported");
      return;
    }

    if (Notification.permission === "denied") {
      setState("denied");
      return;
    }

    try {
      const registration = await navigator.serviceWorker.ready;
      const existing = await registration.pushManager.getSubscription();
      setState(existing ? "on" : "off");
    } catch {
      setState("off");
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function enable() {
    setError(null);
    setState("working");

    try {
      // Must be inside the tap handler's call stack on iOS.
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setState(permission === "denied" ? "denied" : "off");
        return;
      }

      const registration = await navigator.serviceWorker.ready;

      // Reuse an existing subscription if the browser already has one.
      const subscription =
        (await registration.pushManager.getSubscription()) ??
        (await registration.pushManager.subscribe({
          // Required: iOS and Chrome both refuse silent push.
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
        }));

      const raw = subscription.toJSON() as {
        endpoint?: string;
        keys?: { p256dh?: string; auth?: string };
      };

      const response = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          endpoint: raw.endpoint,
          keys: raw.keys,
          deviceLabel: deviceLabel(),
        }),
      });

      if (!response.ok) {
        const detail = await response.json().catch(() => ({}));
        throw new Error(detail.error || "Could not save this device");
      }

      setState("on");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setState("off");
    }
  }

  async function disable() {
    setError(null);
    setState("working");

    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();

      if (subscription) {
        await fetch("/api/push/subscribe", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: subscription.endpoint }),
        });
        await subscription.unsubscribe();
      }

      setState("off");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      await refresh();
    }
  }

  if (state === "checking") return null;

  return (
    <section className="card p-4">
      <h2 className="text-sm font-semibold">Reminders</h2>

      {state === "needs-install" && (
        <>
          <p className="muted mt-1 text-sm">
            To get reminders on an iPhone, add Family Hub to your Home Screen
            first — Apple only allows notifications for installed apps.
          </p>
          <ol className="muted mt-2 list-decimal space-y-1 pl-5 text-xs">
            <li>
              Tap the <strong>Share</strong> button in Safari&apos;s toolbar.
            </li>
            <li>
              Choose <strong>Add to Home Screen</strong>, then{" "}
              <strong>Add</strong>.
            </li>
            <li>Open Family Hub from the new icon and come back here.</li>
          </ol>
        </>
      )}

      {state === "unsupported" && (
        <p className="muted mt-1 text-sm">
          This browser can&apos;t show notifications. On an iPhone you need iOS
          16.4 or later, with Family Hub added to the Home Screen.
        </p>
      )}

      {state === "denied" && (
        <p className="muted mt-1 text-sm">
          Notifications are blocked for Family Hub. Turn them back on in your
          phone&apos;s <strong>Settings → Notifications → Family Hub</strong>,
          then reopen the app.
        </p>
      )}

      {(state === "off" || state === "working") && (
        <>
          <p className="muted mt-1 text-sm">
            Get a notification when an anniversary is coming up, and a daily
            nudge while there&apos;s shopping to do.
          </p>
          <button
            type="button"
            className="btn btn-primary mt-3 w-full"
            onClick={enable}
            disabled={state === "working"}
          >
            {state === "working" ? "Turning on…" : "Turn on reminders"}
          </button>
          <p className="muted mt-2 text-xs">
            You&apos;ll need to do this once on each phone.
          </p>
        </>
      )}

      {state === "on" && (
        <>
          <p className="mt-1 text-sm" style={{ color: "var(--success)" }}>
            Reminders are on for this device.
          </p>
          <button
            type="button"
            className="btn btn-secondary mt-3 w-full"
            onClick={disable}
          >
            Turn off on this device
          </button>
        </>
      )}

      {error && (
        <p className="mt-3 text-xs" style={{ color: "var(--danger)" }} role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
