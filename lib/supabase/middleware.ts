import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { supabaseAnonKey, supabaseUrl } from "@/lib/env";

/**
 * Reachable without being signed in.
 *
 * /api/calendar must stay open: a subscribing calendar app fetches it with no
 * cookies. Its own random token is what authorises the request.
 *
 * /api/push/run likewise: the scheduler has no session and authorises with a
 * bearer secret that the database functions verify.
 */
const PUBLIC_PATHS = [
  "/login",
  "/auth",
  "/offline",
  "/api/calendar",
  "/api/push/run",
];

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );
}

/**
 * Runs on every request. Two jobs:
 *
 *  1. Refresh the login session. Access tokens expire after an hour; without
 *     this, someone who leaves the app open would get quietly logged out.
 *  2. Bounce signed-out visitors to /login, and signed-in ones away from it.
 */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(supabaseUrl(), supabaseAnonKey(), {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => {
          request.cookies.set(name, value);
        });
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, options);
        });
      },
    },
  });

  // getUser() (not getSession()) — it verifies the token with Supabase rather
  // than trusting whatever the cookie claims.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;

  if (!user && !isPublicPath(pathname)) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.search = "";
    return NextResponse.redirect(loginUrl);
  }

  if (user && pathname === "/login") {
    const homeUrl = request.nextUrl.clone();
    homeUrl.pathname = "/";
    homeUrl.search = "";
    return NextResponse.redirect(homeUrl);
  }

  // Important: return this exact response object so the refreshed session
  // cookies set above survive.
  return response;
}
