import { redirect } from "next/navigation";
import { NextResponse } from "next/server";
import type { User } from "@supabase/supabase-js";

import { isOwnerUserId } from "@/lib/auth";
import { isSessionMissing, logAuthFailure } from "@/lib/supabase/auth-log";
import { createClient } from "@/lib/supabase/server";

import "server-only";

/**
 * Always `getUser()`, never `getSession()`, on the server — `getSession()`
 * returns the raw cookie contents without revalidating them against the
 * Supabase Auth server, so it can hand back a stale or forged session.
 */
export async function getSessionUser(): Promise<User | null> {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  // Every caller below turns a null user into a bounce — /login, or a 401. When
  // the cause was a *failed check* rather than an absent session, that bounce
  // signs out a session that was still valid, and without this it left no trace
  // at all. `isSessionMissing` filters the ordinary signed-out visitor, who
  // would otherwise log a line on every unauthenticated page view.
  if (error && !isSessionMissing(error)) logAuthFailure("getSessionUser", error);

  return user;
}

/** True when the signed-in user is in this app's `OWNER_USER_IDS` allowlist. */
export async function isOwner(): Promise<boolean> {
  return isOwnerUserId((await getSessionUser())?.id);
}

/**
 * Page/Server Action guard. Middleware only protects navigation — Server
 * Actions and route handlers can be reached without ever passing through it —
 * so every entry point that reads or mutates data re-checks auth itself.
 */
export async function requireUser(): Promise<User> {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!isOwnerUserId(user.id)) redirect("/login?error=forbidden");
  return user;
}

/**
 * Route-handler flavour of `requireUser`. Returns a JSON error response
 * instead of redirecting, because a `fetch()` that follows a 307 to the HTML
 * /login page fails while trying to parse it as JSON. Returns `null` when the
 * caller is authorized.
 *
 * **This is the only authorization gate on the finance data.** The tables are
 * Pattern A — reachable only by the secret key, which bypasses RLS — so by the
 * time a query reaches Postgres it is already `service_role` and the database
 * cannot tell one caller from another. A route handler that omits this call is
 * public. There is nothing behind it.
 *
 * Usage: `const denied = await requireOwnerForApi(); if (denied) return denied;`
 */
export async function requireOwnerForApi(): Promise<NextResponse | null> {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isOwnerUserId(user.id)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return null;
}
