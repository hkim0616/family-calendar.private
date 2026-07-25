"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { createSupabaseBrowserClient } from "@/lib/supabase/client";

type Mode = "email" | "sent" | "code";

const LINK_EXPIRED_MESSAGE =
  "That sign-in link didn't work — it may have expired or already been used. Request a new one below.";

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [mode, setMode] = useState<Mode>("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(
    searchParams.get("error") === "link_expired" ? LINK_EXPIRED_MESSAGE : null,
  );

  /** Emails a sign-in link (and a code, from the same template). */
  async function sendLink(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);

    const supabase = createSupabaseBrowserClient();
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: {
        shouldCreateUser: true,
        // Where the link in the email should land. Must also be listed under
        // Supabase → Authentication → URL Configuration → Redirect URLs.
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    });

    setBusy(false);
    if (error) {
      setError(error.message);
      return;
    }
    setMode("sent");
  }

  async function verifyCode(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);

    const supabase = createSupabaseBrowserClient();
    const { error } = await supabase.auth.verifyOtp({
      email: email.trim(),
      token: code.trim(),
      type: "email",
    });

    if (error) {
      setBusy(false);
      setError(error.message);
      return;
    }

    // refresh() so server components pick up the new session.
    router.refresh();
    router.push("/");
  }

  return (
    <div className="card p-5">
      {mode === "email" && (
        <form onSubmit={sendLink} className="space-y-4">
          <div>
            <label htmlFor="email" className="mb-2 block text-sm font-medium">
              Your email
            </label>
            <input
              id="email"
              className="input"
              type="email"
              inputMode="email"
              autoComplete="email"
              autoCapitalize="none"
              autoCorrect="off"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>

          <button
            type="submit"
            className="btn btn-primary w-full"
            disabled={busy || email.trim().length === 0}
          >
            {busy ? "Sending…" : "Email me a sign-in link"}
          </button>

          <p className="muted text-center text-xs">
            No password needed. We&apos;ll email you a link to tap.
          </p>
        </form>
      )}

      {mode === "sent" && (
        <div className="space-y-4">
          <div className="text-center">
            <p className="text-base font-medium">Check your email</p>
            <p className="muted mt-2 text-sm">
              We sent a sign-in link to{" "}
              <span className="font-medium">{email.trim()}</span>. Tap it to
              sign in.
            </p>
          </div>

          {/*
              The same email also contains a 6-digit code. It's the reliable
              path on iPhone: tapping the link opens Safari, which lands you
              outside the installed app, whereas typing the code keeps you in it.
            */}
          <button
            type="button"
            className="btn btn-secondary w-full"
            onClick={() => {
              setMode("code");
              setError(null);
            }}
          >
            Enter the 6-digit code instead
          </button>

          <button
            type="button"
            className="muted w-full text-center text-xs underline"
            onClick={() => {
              setMode("email");
              setError(null);
            }}
          >
            Use a different email
          </button>
        </div>
      )}

      {mode === "code" && (
        <form onSubmit={verifyCode} className="space-y-4">
          <div>
            <label htmlFor="code" className="mb-2 block text-sm font-medium">
              Enter the code sent to{" "}
              <span className="font-normal">{email.trim()}</span>
            </label>
            <input
              id="code"
              className="input text-center text-2xl tracking-[0.4em]"
              type="text"
              inputMode="numeric"
              // Lets iOS offer the code straight from the notification.
              autoComplete="one-time-code"
              placeholder="123456"
              maxLength={6}
              value={code}
              onChange={(e) =>
                setCode(e.target.value.replace(/\D/g, "").slice(0, 6))
              }
              required
              autoFocus
            />
          </div>

          <button
            type="submit"
            className="btn btn-primary w-full"
            disabled={busy || code.length !== 6}
          >
            {busy ? "Signing in…" : "Sign in"}
          </button>

          <button
            type="button"
            className="btn btn-secondary w-full"
            onClick={() => {
              setMode("sent");
              setCode("");
              setError(null);
            }}
            disabled={busy}
          >
            Back
          </button>
        </form>
      )}

      {error && (
        <p
          className="mt-4 text-sm"
          style={{ color: "var(--danger)" }}
          role="alert"
        >
          {error}
        </p>
      )}
    </div>
  );
}
