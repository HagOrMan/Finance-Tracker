"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { sanitizeNextPath } from "@/lib/auth";
import { requireEnv } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";

/**
 * The origin this app is actually being served from. Uses forwarded headers so
 * it's correct on Vercel preview deploys, where the origin differs from both
 * localhost and the production domain, and falls back to the configured site
 * URL locally.
 */
async function siteOrigin(): Promise<string> {
  const headerList = await headers();
  const host = headerList.get("x-forwarded-host") ?? headerList.get("host");
  if (!host) return requireEnv("NEXT_PUBLIC_SITE_URL");
  const protocol = headerList.get("x-forwarded-proto") ?? "https";
  return `${protocol}://${host}`;
}

/**
 * Google is the only enabled provider for this app. Runs as a Server Action
 * rather than in the browser so the PKCE code-verifier cookie is written
 * server-side — sign-in must start and finish on the same origin or
 * `exchangeCodeForSession` fails with "both auth code and code verifier should
 * be non-empty".
 */
export async function signInWithGoogle(next?: string): Promise<void> {
  const supabase = await createClient();
  const callback = new URL("/auth/callback", await siteOrigin());
  if (next) callback.searchParams.set("next", sanitizeNextPath(next));

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: callback.toString(),
      // Forces Google to re-issue a refresh token rather than silently reusing
      // a prior grant.
      queryParams: { access_type: "offline", prompt: "consent" },
    },
  });

  // redirect() works by throwing, so it must stay outside any try/catch.
  if (error || !data.url) redirect("/login?error=auth");

  // signInWithOAuth() doesn't attach the API key to the authorize URL, and this
  // redirect is a full browser navigation (no custom headers), so Supabase's
  // gateway rejects it with "No API key found in request" unless it's added
  // here as a query param. The anon key is public (NEXT_PUBLIC_*) and already
  // ships in the client bundle, so this adds no exposure. Looks removable; it
  // isn't.
  const authorizeUrl = new URL(data.url);
  authorizeUrl.searchParams.set(
    "apikey",
    requireEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
  );
  redirect(authorizeUrl.toString());
}

export async function signOut(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
