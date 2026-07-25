import { Suspense } from "react";

import { LoginForm } from "./login-form";

export const metadata = { title: "Sign in — Family Hub" };

export default function LoginPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-5 py-10">
      <div className="mb-8 text-center">
        <h1 className="text-3xl font-semibold tracking-tight">Family Hub</h1>
        <p className="muted mt-2 text-sm">
          Memos, schedule, groceries and anniversaries — in one place.
        </p>
      </div>

      {/*
        LoginForm reads ?error= from the URL via useSearchParams, which needs a
        Suspense boundary so the rest of this page can still be prerendered.
      */}
      <Suspense
        fallback={<div className="card p-5" style={{ minHeight: 188 }} />}
      >
        <LoginForm />
      </Suspense>
    </main>
  );
}
