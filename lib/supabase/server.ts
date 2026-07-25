import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

import { supabaseAnonKey, supabaseUrl } from "@/lib/env";

/**
 * Supabase client for server components, server actions and route handlers.
 *
 * It uses the public "anon" key and carries the signed-in user's session from
 * their cookies, which means every query runs *as that user* and Row-Level
 * Security applies. There is deliberately no service-role client in this app:
 * that key bypasses RLS entirely, so keeping it out removes any chance of
 * accidentally serving one family's data to another.
 */
export function createSupabaseServerClient() {
  const cookieStore = cookies();

  return createServerClient(supabaseUrl(), supabaseAnonKey(), {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        } catch {
          // Server Components aren't allowed to set cookies. That's fine —
          // middleware.ts refreshes the session cookie on every request.
        }
      },
    },
  });
}
