import type { DataSource } from "./types";

/**
 * Builds the data source for the current `DATA_SOURCE` mode.
 *
 * The Supabase adapter runs on the SECRET-key client, not the caller's
 * session. These tables are Pattern A — RLS enabled with zero policies and
 * privileges granted to `service_role` alone — so no user session can read
 * them at all, and a per-user policy would never be evaluated.
 *
 * The consequence: **this function performs no authorization whatsoever**, and
 * there is no database backstop behind it. Every caller must already have
 * passed `requireOwnerForApi()` (route handlers) or `requireUser()`
 * (pages/Server Actions) from `src/lib/auth-server.ts`. See the header comment
 * in `supabase/migrations/finance_tracker_schema.sql`.
 *
 * Unlike the previous cookie-scoped client this holds no per-request state, so
 * it no longer has to be called inside a Next.js request scope.
 */
export async function getDataSource(): Promise<DataSource> {
  const mode = process.env.DATA_SOURCE ?? "supabase";

  if (mode === "sqlite") {
    const { SqliteDataSource } = await import("./sqlite-source");
    return new SqliteDataSource();
  }

  const { SupabaseDataSource } = await import("./supabase-source");
  const { createServiceClient } = await import("@/lib/supabase/service");
  return new SupabaseDataSource(createServiceClient());
}
