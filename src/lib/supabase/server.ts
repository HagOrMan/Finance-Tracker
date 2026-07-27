import { cookies } from "next/headers";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cache } from "react";

import { requireEnv } from "@/lib/env";
import type { Database } from "@/types/database";

import "server-only";

/**
 * Cookie-based Supabase client for Server Components, Server Actions and route
 * handlers. Anon key plus the caller's session cookie, so RLS still applies —
 * this is NOT an admin client.
 *
 * `cache()`-wrapped so every call within a single request returns the same
 * client/session instead of each independently re-reading cookies and racing to
 * refresh. Without it, a request whose handlers fire several concurrent queries
 * can trigger simultaneous refresh-token redemptions against the same
 * near-expiry token, which surfaces as PostgREST rejecting the resulting access
 * token with `PGRST303: "JWT issued at future"` — a refresh race, not a clock
 * problem.
 */
export const createClient = cache(async () => {
  const cookieStore = await cookies();

  return createServerClient<Database>(
    requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requireEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(
          cookiesToSet: {
            name: string;
            value: string;
            options: CookieOptions;
          }[],
        ) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Server Components may not mutate cookies. Without this swallow,
            // any Server Component that happens to trigger a token refresh
            // throws mid-render; middleware persists the refreshed session on
            // the next request instead.
          }
        },
      },
    },
  );
});
