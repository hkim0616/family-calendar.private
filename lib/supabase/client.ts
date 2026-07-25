import { createBrowserClient } from "@supabase/ssr";

import { supabaseAnonKey, supabaseUrl } from "@/lib/env";

/**
 * Supabase client for the browser (client components). Safe to expose: the
 * anon key only ever grants what Row-Level Security allows for the signed-in
 * user. This is also what powers Realtime subscriptions in later phases.
 */
export function createSupabaseBrowserClient() {
  return createBrowserClient(supabaseUrl(), supabaseAnonKey());
}
