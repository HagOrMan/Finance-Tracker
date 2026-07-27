/**
 * Authorization primitives with no server-runtime dependencies, so they can be
 * imported from route middleware (edge runtime) as well as from Server
 * Components, Server Actions and route handlers.
 *
 * The session-dependent guards (`isOwner`, `requireUser`, `requireOwnerForApi`)
 * live in `src/lib/auth-server.ts` — they pull in `next/headers` via the
 * Supabase server client, which middleware cannot use.
 */

/**
 * Same-site path guard shared by the sign-in action and the OAuth callback.
 * "//host" is a protocol-relative URL and "/\" is treated like "//" by
 * browsers — either would turn a post-login redirect into an open redirect to
 * an attacker-chosen site.
 */
export function sanitizeNextPath(value: unknown): string {
  return typeof value === "string" &&
    value.startsWith("/") &&
    !value.startsWith("//") &&
    !value.startsWith("/\\")
    ? value
    : "/";
}

/**
 * The comma-separated `OWNER_USER_IDS` allowlist, parsed.
 *
 * This app authenticates against a Supabase project shared with other apps, so
 * `auth.users` is a shared pool: a valid session proves identity, not access.
 * Authorization is per-app and this list is its only source — there is no roles
 * table. Bootstrap it by signing in once and copying the id printed on /login.
 */
export function ownerUserIds(): string[] {
  return (process.env.OWNER_USER_IDS ?? "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
}

/** Fails closed: an empty or unset allowlist authorizes nobody. */
export function isOwnerUserId(userId: string | null | undefined): boolean {
  if (!userId) return false;
  const allowed = ownerUserIds();
  return allowed.length > 0 && allowed.includes(userId);
}
