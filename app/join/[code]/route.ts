import { NextResponse, type NextRequest } from "next/server";

import {
  INVITE_COOKIE,
  INVITE_COOKIE_MAX_AGE,
  normaliseInviteCode,
} from "@/lib/invite";

export const dynamic = "force-dynamic";

/**
 * Invite link: /join/A3F91C2B
 *
 * Remembers the code in a cookie and sends the visitor to the front door. From
 * there the normal flow takes over — signed-out visitors get bounced to /login,
 * and whenever they eventually reach /onboarding the code is waiting for them,
 * already filled in.
 *
 * Deliberately does no database work: the code is just a hint for a form, and
 * join_family() re-validates it properly when the form is submitted. A bogus
 * link therefore can't do anything except pre-fill a wrong code.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { code: string } },
) {
  const code = normaliseInviteCode(params.code);
  const home = new URL("/", request.nextUrl.origin);

  if (!code) {
    // Malformed link — carry on to the app rather than showing a dead end.
    return NextResponse.redirect(home);
  }

  const response = NextResponse.redirect(home);
  response.cookies.set(INVITE_COOKIE, code, {
    httpOnly: true,
    sameSite: "lax",
    secure: request.nextUrl.protocol === "https:",
    path: "/",
    maxAge: INVITE_COOKIE_MAX_AGE,
  });
  return response;
}
