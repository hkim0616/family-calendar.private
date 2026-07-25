"use client";

import { useState } from "react";

/**
 * Shows the family invite code with a one-tap copy, so getting a second person
 * onto the app doesn't involve reading hex digits down the phone.
 */
export function InviteCode({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // Clipboard needs a secure context and permission; if it's refused, the
      // code is on screen to read anyway.
    }
  }

  return (
    <button
      type="button"
      onClick={copy}
      className="flex w-full items-center justify-between gap-3"
      style={{ minHeight: 44, WebkitTapHighlightColor: "transparent" }}
      aria-label={`Invite code ${code}. Tap to copy.`}
    >
      <span className="muted text-xs">Invite code</span>
      <span className="flex items-center gap-2">
        <code className="text-sm font-semibold tracking-widest">{code}</code>
        <span
          className="text-[11px] font-medium"
          style={{ color: copied ? "var(--success)" : "var(--accent)" }}
        >
          {copied ? "Copied" : "Copy"}
        </span>
      </span>
    </button>
  );
}
