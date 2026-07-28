import { NextResponse } from "next/server";

import { errorResponse } from "@/lib/api";
import { requireOwnerForApi } from "@/lib/auth-server";
import { buildReportForPeriod } from "@/lib/reports-runner";
import { isReportPeriod, REPORT_PERIOD_VALUES } from "@/lib/reports";

export const dynamic = "force-dynamic";

/**
 * The report the `/reports` page renders — and the same object the email
 * template is handed (ARCHITECTURE.md).
 *
 * The page already holds every receipt in its TanStack Query cache and could
 * aggregate this client-side for free, the way `/stores` does. It fetches
 * instead because of **"today"**: `APP_TIMEZONE` is deliberately server-only, so
 * a browser-built report would use the browser's zone, and the two disagree by
 * a day at every window boundary for anyone not sitting in Toronto. Fetching
 * makes the server the only thing that decides what today means, and makes the
 * preview provably the same object that gets mailed.
 *
 * Read-only. It writes nothing, which is the whole premise of the feature.
 */
export async function GET(request: Request) {
  const denied = await requireOwnerForApi();
  if (denied) return denied;

  const period = new URL(request.url).searchParams.get("period");
  // Validated rather than trusted: `period` indexes a `Record`, so an unchecked
  // value would be a silent `undefined` deep in the builder instead of an error.
  if (!isReportPeriod(period)) {
    return NextResponse.json(
      { error: `period must be one of: ${REPORT_PERIOD_VALUES.join(", ")}` },
      { status: 400 },
    );
  }

  try {
    return NextResponse.json(await buildReportForPeriod(period));
  } catch (error) {
    return errorResponse(error, "Failed to build report");
  }
}
