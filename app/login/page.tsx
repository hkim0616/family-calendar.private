"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { createSupabaseBrowserClient } from "@/lib/supabase/client";

/**
 * Sign-in by emailed 6-digit code.
 *
 * Deliberately *not* a magic link: on iPhone, tapping a link in Mail opens
 * Safari, which would land the user outside the installed app and leave the
 * home-screen icon still signed out. Typing a code keeps them in the app.
 */
export default function LoginPage() {
  const router = useRouter();
  const [step, setStep] = useState<"email" | "code">("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function sendCode(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);

    const supabase = createSupabaseBrowserClient();
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { shouldCreateUser: true },
    });

    setBusy(false);
    if (error) {
      setError(error.message);
      return;
    }
    setStep("code");
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

    // refresh() re-runs the server components so they see the new session.
    router.refresh();
    router.push("/");
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-5 py-10">
      <div className="mb-8 text-center">
        <h1 className="text-3xl font-semibold tracking-tight">Family Hub</h1>
        <p className="muted mt-2 text-sm">
          Memos, schedule, groceries and anniversaries — in one place.
        </p>
      </div>

      <div className="card p-5">
        {step === "email" ? (
          <form onSubmit={sendCode} className="space-y-4">
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
              {busy ? "Sending…" : "Email me a code"}
            </button>

            <p className="muted text-center text-xs">
              No password needed. We&apos;ll email you a 6-digit code.
            </p>
          </form>
        ) : (
          <form onSubmit={verifyCode} className="space-y-4">
            <div>
              <label htmlFor="code" className="mb-2 block text-sm font-medium">
                Enter the code we sent to{" "}
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
                setStep("email");
                setCode("");
                setError(null);
              }}
              disabled={busy}
            >
              Use a different email
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
    </main>
  );
}
