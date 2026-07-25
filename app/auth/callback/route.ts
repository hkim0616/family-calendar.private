import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";

import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Where the sign-in link in the email lands.
 *
 * Supabase sends one of two templates depending on whether the address is new
 * ("Confirm signup") or returning ("Magic Link"), and they don't agree on the
 * `type` value. Rather than make that the user's problem, try the declared type
 * first and then the other plausible ones.
 */
const FALLBACK_TYPES: EmailOtpType[] = [
  "email",
  "magiclink",
  "signup",
  "invite",
];

export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const tokenHash = searchParams.get("token_hash");
  const declaredType = searchParams.get("type") as EmailOtpType | null;
  const code = searchParams.get("code");

  const supabase = createSupabaseServerClient();

  // Preferred path: a token hash we can verify server-side. Works no matter
  // which browser opens the link, because there's no PKCE verifier to match.
  if (tokenHash) {
    const types = declaredType
      ? [declaredType, ...FALLBACK_TYPES.filter((t) => t !== declaredType)]
      : FALLBACK_TYPES;

    for (const type of types) {
      const { error } = await supabase.auth.verifyOtp({
        type,
        token_hash: tokenHash,
      });
      if (!error) return NextResponse.redirect(`${origin}/`);
    }
  }

  // Older/PKCE-style links arrive with ?code= instead.
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(`${origin}/`);
  }

  return NextResponse.redirect(`${origin}/login?error=link_expired`);
}
