import { NextResponse, type NextRequest } from "next/server";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import type { AuthError, User } from "@supabase/supabase-js";

import { isOwnerUserId } from "@/lib/auth";
import { requireEnv } from "@/lib/env";
import { logAuthFailure } from "@/lib/supabase/auth-log";

// Deny by default: this lists what is public, so a new route is protected the
// moment it exists. /login must stay public for the not-yet-authorized case
// below, and /auth/callback because the user has no session yet when they hit
// it (the PKCE code verifier cookie is all they carry).
//
// `/api/cron` is public *to this proxy only*. A Vercel cron invocation carries
// no session cookie, so the deny-by-default rule below would 401 it before the
// handler ever ran — the schedule would silently never fire. What actually
// guards it is `requireCronSecret()` inside
// `src/app/api/cron/subscriptions/route.ts`, which fails closed when
// `CRON_SECRET` is unset. This entry is exactly as wide as that one handler;
// anything else added under /api/cron inherits the exemption and must bring its
// own gate. See ARCHITECTURE.md and §7.3.
const PUBLIC_PATHS = ["/login", "/auth/callback", "/api/cron"];

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

type CookieWrite = { name: string; value: string; options: CookieOptions };

// `sb-<project-ref>-auth-token`, plus the `.0` / `.1` … chunks @supabase/ssr
// splits it into once the serialized session passes ~3.2 KB.
const AUTH_COOKIE_RE = /^sb-.+-auth-token(\.\d+)?$/;

/**
 * Process-wide single-flight for the getUser() call below, keyed by the
 * request's raw Cookie header. Without it, two requests arriving with the same
 * near-expiry session (a page load plus a client component's own fetch) can
 * each redeem the same refresh token at once. One redemption wins; the loser
 * ends up with a mismatched access/refresh pair, which PostgREST rejects as
 * `PGRST303: "JWT issued at future"`. Same class of bug that server.ts's
 * cache() fixes within a request, one layer up across requests.
 *
 * Only the first request for a given cookie snapshot calls Supabase;
 * concurrent requests with byte-identical cookies await and reuse its result. A
 * different cookie snapshot (different tab, no session) gets its own flight, so
 * session state is never shared across different sessions.
 *
 * In-process only — resets on cold start, doesn't coordinate across instances.
 * Fine for a single-user app, not a distributed lock. Next's proxy docs warn
 * against relying on module-level globals here (a proxy may be deployed to the
 * CDN edge, separate from the render runtime); that's fine because this is a
 * pure optimization — when the map is empty every request simply takes its own
 * flight, which is the un-deduplicated behaviour.
 */
const inFlightByCookieKey = new Map<
  string,
  Promise<{
    user: User | null;
    cookieWrites: CookieWrite[];
    noStoreHeaders: Record<string, string>;
  }>
>();

/**
 * The proxy's two signals, on top of the shared format in `auth-log.ts`.
 *
 * - **An error while the browser was holding auth cookies.** Cookies but no
 *   user is the interesting case; no cookies at all is just a logged-out
 *   visitor, filtered here by the cookie count.
 * - **A `maxAge: 0` write.** That is @supabase/ssr *deleting* the session
 *   cookie — the exact instant a working login stops working — and it can
 *   happen without `getUser()` reporting an error at all, so it is checked
 *   independently.
 *
 * Only the request that wins the single flight below logs, so a burst of
 * concurrent requests sharing one cookie snapshot produces one line, not six.
 */
function logFailedCheck(
  request: NextRequest,
  authCookies: { name: string; value: string }[],
  cookieWrites: CookieWrite[],
  error: AuthError | null,
) {
  const cleared = cookieWrites
    .filter((w) => w.options?.maxAge === 0)
    .map((w) => w.name);

  if (authCookies.length === 0) return;
  if (!error && cleared.length === 0) return;

  logAuthFailure("proxy", error, {
    path: request.nextUrl.pathname,
    cookies: authCookies.map((c) => `${c.name}=${c.value.length}B`),
    cleared,
  });
}

async function getUserSingleFlight(request: NextRequest) {
  const key = request.headers.get("cookie") ?? "";
  const existing = inFlightByCookieKey.get(key);
  if (existing) return existing;

  const promise = (async () => {
    const cookieWrites: CookieWrite[] = [];
    // @supabase/ssr hands us the no-cache headers that must accompany any
    // response carrying refreshed auth cookies — without them a CDN or edge
    // cache can hand one visitor's session token to another.
    let noStoreHeaders: Record<string, string> = {};

    // Captured before the call, because a failed check is exactly when
    // @supabase/ssr deletes these — afterwards there is nothing left to report.
    const authCookies = request.cookies
      .getAll()
      .filter((c) => AUTH_COOKIE_RE.test(c.name));

    const supabase = createServerClient(
      requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
      requireEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
      {
        cookies: {
          getAll() {
            return request.cookies.getAll();
          },
          setAll(cookiesToSet: CookieWrite[], headers: Record<string, string>) {
            cookieWrites.push(...cookiesToSet);
            noStoreHeaders = { ...noStoreHeaders, ...headers };
          },
        },
      },
    );

    // getUser() revalidates the token against the Supabase Auth server, unlike
    // getSession() which just reads the (possibly stale, possibly forged)
    // cookie. Removing this call silently expires sessions.
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser();

    logFailedCheck(request, authCookies, cookieWrites, error);

    return { user, cookieWrites, noStoreHeaders };
  })();

  inFlightByCookieKey.set(key, promise);
  try {
    return await promise;
  } finally {
    inFlightByCookieKey.delete(key);
  }
}

export async function updateSession(request: NextRequest) {
  // Rebuilt on each call (not hoisted) so it reflects request.cookies as of
  // that moment — mutated below once we know whether there are writes.
  function nextResponse() {
    return NextResponse.next({
      request: { headers: new Headers(request.headers) },
    });
  }

  const { user, cookieWrites, noStoreHeaders } =
    await getUserSingleFlight(request);

  // Carry any refreshed session cookies onto every response we might return,
  // including the early-return redirects below. Without this a request that
  // both refreshes and redirects throws the new token away, so the next
  // request refreshes again from the same already-rotated refresh token.
  function withRefreshedSession(res: NextResponse): NextResponse {
    cookieWrites.forEach(({ name, value, options }) =>
      res.cookies.set(name, value, options),
    );
    Object.entries(noStoreHeaders).forEach(([k, v]) => res.headers.set(k, v));
    return res;
  }

  let response = nextResponse();
  if (cookieWrites.length > 0) {
    cookieWrites.forEach(({ name, value }) => request.cookies.set(name, value));
    response = withRefreshedSession(nextResponse());
  }

  const { pathname } = request.nextUrl;
  const isApi = pathname.startsWith("/api/");
  const authorized = isOwnerUserId(user?.id);

  // The proxy is UX, not the security boundary: it protects navigation, but
  // route handlers can be hit directly, so each one re-checks via
  // requireOwnerForApi(). The checks are duplicated here so an unauthorized
  // visitor gets a login page instead of a working shell that errors on every
  // panel.
  if (!user && !isPublicPath(pathname)) {
    // API routes get JSON, not an HTML redirect — a `fetch()` following a
    // redirect to /login would otherwise fail parsing HTML as JSON.
    if (isApi) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", pathname);
    return withRefreshedSession(NextResponse.redirect(loginUrl));
  }

  // Signed in against the shared Supabase project but not on this app's
  // allowlist. /login stays reachable so they can read their user id off it
  // (the bootstrap flow) and sign out — redirecting them there while also
  // bouncing them off it would loop.
  if (user && !authorized && !isPublicPath(pathname)) {
    if (isApi) {
      return withRefreshedSession(
        NextResponse.json({ error: "Forbidden" }, { status: 403 }),
      );
    }
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("error", "forbidden");
    return withRefreshedSession(NextResponse.redirect(loginUrl));
  }

  if (authorized && pathname === "/login") {
    return withRefreshedSession(NextResponse.redirect(new URL("/", request.url)));
  }

  return response;
}
