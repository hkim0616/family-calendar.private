"use client";

import { useEffect, useState } from "react";

import { inviteUrl } from "@/lib/invite";

/**
 * Shares the family invite as a tappable link.
 *
 * The link is the main path — whoever receives it taps once and lands on a
 * pre-filled join screen. The raw code stays visible underneath as a fallback
 * for reading out loud, or for someone typing it on a device that can't open
 * the link.
 *
 * Uses the Web Share API when available, which on iOS opens the native share
 * sheet — including KakaoTalk and Messages — rather than making the user copy
 * and switch apps themselves.
 */
export function InviteLink({ code }: { code: string }) {
  const [origin, setOrigin] = useState("");
  const [copied, setCopied] = useState(false);
  const [canShare, setCanShare] = useState(false);

  // window isn't available during server rendering.
  useEffect(() => {
    setOrigin(window.location.origin);
    setCanShare(typeof navigator.share === "function");
  }, []);

  const url = origin ? inviteUrl(origin, code) : "";

  async function share() {
    if (!url) return;
    try {
      await navigator.share({
        title: "Join our Family Hub",
        text: "Tap to join our family on Family Hub:",
        url,
      });
    } catch {
      // Cancelling the share sheet throws; nothing to report.
    }
  }

  async function copy() {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // Clipboard can be refused; the link is on screen to copy by hand.
    }
  }

  return (
    <div>
      {canShare && (
        <button
          type="button"
          className="btn btn-primary w-full"
          onClick={share}
          disabled={!url}
        >
          Share invite link
        </button>
      )}

      <button
        type="button"
        className={`btn btn-secondary w-full ${canShare ? "mt-2" : ""}`}
        onClick={copy}
        disabled={!url}
      >
        {copied ? "Link copied" : "Copy invite link"}
      </button>

      <p
        className="muted mt-3 break-all rounded-lg p-2 text-[11px]"
        style={{ background: "var(--bg)" }}
      >
        {url || "…"}
      </p>

      <div
        className="mt-3 flex items-center justify-between border-t pt-3"
        style={{ borderColor: "var(--border)" }}
      >
        <span className="muted text-xs">Or read out the code</span>
        <code className="text-sm font-semibold tracking-widest">{code}</code>
      </div>
    </div>
  );
}
