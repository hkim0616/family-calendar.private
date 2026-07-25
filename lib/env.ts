/**
 * Reads the two Supabase settings the app needs, with a readable error if
 * they're missing — otherwise a forgotten env var surfaces as a confusing
 * "fetch failed" much later on.
 */
function required(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(
      `Missing environment variable ${name}. ` +
        `Locally, add it to .env.local; on Vercel, add it under ` +
        `Project Settings → Environment Variables, then redeploy.`,
    );
  }
  return value;
}

export function supabaseUrl(): string {
  return required(
    "NEXT_PUBLIC_SUPABASE_URL",
    process.env.NEXT_PUBLIC_SUPABASE_URL,
  );
}

export function supabaseAnonKey(): string {
  return required(
    "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
}
