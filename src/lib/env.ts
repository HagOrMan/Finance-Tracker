/**
 * Reads a required env var, failing loudly at the call site instead of
 * letting `undefined` reach the Supabase client and surface as an opaque
 * "Invalid URL" or 401 much later.
 *
 * Server-safe only. Next.js inlines `process.env.NEXT_PUBLIC_*` into the
 * browser bundle only for statically analyzable member access, so the dynamic
 * `process.env[name]` lookup here is always `undefined` on the client. Browser
 * code must read the vars directly, e.g. `process.env.NEXT_PUBLIC_SUPABASE_URL!`.
 */
export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}
