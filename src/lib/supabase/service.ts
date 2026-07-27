import { createClient as createSupabaseClient } from "@supabase/supabase-js";

import { requireEnv } from "@/lib/env";

import "server-only";

/**
 * Service-role client. Bypasses RLS entirely — must only ever be imported by
 * trusted server-only entry points. The `server-only` import turns any
 * transitive client-component import into a build error rather than a leaked
 * key in the browser bundle.
 *
 * This is the only client that can reach the `finance_tracker` tables:
 * `anon` and `authenticated` hold no privileges on them (Pattern A — see
 * `supabase/migrations/finance_tracker_schema.sql`). Because RLS is bypassed,
 * nothing below this line distinguishes one caller from another — the route
 * handler must already have run `requireOwnerForApi()`.
 *
 * `persistSession: false` matters: without it the service client tries to
 * write session state and can collide with the real user session.
 */
export function createServiceClient() {
  return createSupabaseClient(
    requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requireEnv("SUPABASE_SECRET_KEY"),
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}
