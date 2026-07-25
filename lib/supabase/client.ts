import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

import { supabaseAnonKey, supabaseUrl } from "@/lib/env";

let cached: SupabaseClient | null = null;

/**
 * Supabase client for the browser (client components). Safe to expose: the
 * anon key only ever grants what Row-Level Security allows for the signed-in
 * user.
 *
 * Cached at module scope so the whole page shares one client, and therefore one
 * realtime websocket and one auth listener. Creating a fresh client per
 * component would open a socket per component and quietly burn through
 * Supabase's connection limits.
 */
export function createSupabaseBrowserClient(): SupabaseClient {
  if (!cached) {
    cached = createBrowserClient(supabaseUrl(), supabaseAnonKey());
  }
  return cached;
}
