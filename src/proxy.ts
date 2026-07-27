import { type NextRequest } from "next/server";

import { updateSession } from "@/lib/supabase/middleware";

// Next 16 renamed the `middleware` file convention to `proxy`; the export must
// be named `proxy` (or be the default) to match. Unlike the old convention,
// proxy always runs on the Node.js runtime, and route segment config
// (`export const runtime = …`) is not allowed here.
export async function proxy(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Everything except static assets and image files. Auth checks are
     * deny-by-default, so a new route is protected the moment it exists;
     * PUBLIC_PATHS in lib/supabase/middleware.ts is the opt-out list.
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|mp4)$).*)",
  ],
};
