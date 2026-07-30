import type { AuthError } from "@supabase/supabase-js";

/**
 * One format, one prefix, for every place a session check fails.
 *
 * `getUser()` returns `user: null` both for someone who is genuinely signed out
 * and for a check that *failed* — a Supabase blip, a rate limit, a refresh token
 * the Auth server has already rotated past. Callers can't tell those apart, and
 * neither can act differently: the proxy redirects to /login, `requireUser()`
 * redirects to /login, `requireOwnerForApi()` returns 401. So a still-valid
 * session becomes a forced re-login with nothing written down anywhere.
 *
 * This is what writes it down. Grep the Vercel function logs for `[auth]`.
 *
 * **Never log cookie values.** Those cookies *are* the session, and a log line
 * is not a place to put one. Names and byte lengths are both safe and more
 * useful — they say whether the session is chunked and where the split sits.
 */
export function logAuthFailure(
  /** Which check failed — `"proxy"`, `"getSessionUser"`. */
  where: string,
  error: AuthError | null,
  details: Record<string, unknown> = {},
) {
  console.error(
    "[auth] session check failed",
    JSON.stringify({
      where,
      error: error
        ? {
            name: error.name,
            message: error.message,
            status: error.status,
            code: error.code,
          }
        : null,
      ...details,
    }),
  );
}

/**
 * "Auth session missing!" — there were no auth cookies at all, so there was
 * nothing to check. That is a signed-out visitor on /login, which happens on
 * every unauthenticated page view and means nothing. Logging it would bury the
 * failures that matter.
 *
 * Matched on `name` because that is how auth-js's own `isAuthSessionMissingError`
 * matches it, and it avoids depending on a symbol that may not be re-exported
 * through `@supabase/supabase-js`.
 */
export function isSessionMissing(error: AuthError | null): boolean {
  return error?.name === "AuthSessionMissingError";
}
