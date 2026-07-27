import { NextResponse } from "next/server";

import { sanitizeNextPath } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

// Must stay in PUBLIC_PATHS (src/lib/supabase/middleware.ts) — the user has no
// session yet when they land here, only the PKCE code verifier cookie set when
// sign-in started.
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = sanitizeNextPath(searchParams.get("next"));

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(`${origin}${next}`);
  }

  return NextResponse.redirect(`${origin}/login?error=auth`);
}
