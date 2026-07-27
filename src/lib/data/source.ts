import type { DataSource } from "./types";

// No cross-request caching here: the Supabase adapter must be built from
// the *current* request's authenticated session (for RLS) every time, so a
// module-level singleton would leak one user's client into another
// request's context.
export async function getDataSource(): Promise<DataSource> {
  const mode = process.env.DATA_SOURCE ?? "supabase";

  if (mode === "sqlite") {
    const { SqliteDataSource } = await import("./sqlite-source");
    return new SqliteDataSource();
  }

  const { SupabaseDataSource } = await import("./supabase-source");
  const { createClient } = await import("@/lib/supabase/server");
  const supabase = await createClient();
  return new SupabaseDataSource(supabase);
}
