import { NextResponse } from "next/server";

import { errorResponse } from "@/lib/api";
import { requireOwnerForApi } from "@/lib/auth-server";
import { isMonthKey } from "@/lib/dates";
import { buildDigestForMonth } from "@/lib/monthly-digest-runner";

export const dynamic = "force-dynamic";

/**
 * The digest `/reports/monthly` renders — and the same object the email
 * template is handed (ARCHITECTURE.md).
 *
 * Fetched rather than aggregated from the caches the page already holds, for
 * the same two reasons as `GET /api/reports`: `APP_TIMEZONE` is server-only, so
 * a browser-built digest could disagree about which month is "last" for anyone
 * outside Toronto on the 1st; and the subscription schedule the projection reads
 * never reaches the browser at all under Pattern A.
 *
 * `month` is optional — omitting it asks for the newest complete month, which is
 * what the page wants on first load and what the runner already knows how to
 * derive.
 *
 * Read-only. It writes nothing, which is the whole premise of the feature.
 */
export async function GET(request: Request) {
  const denied = await requireOwnerForApi();
  if (denied) return denied;

  const month = new URL(request.url).searchParams.get("month");
  if (month !== null && !isMonthKey(month)) {
    return NextResponse.json(
      { error: "month must be a YYYY-MM string" },
      { status: 400 },
    );
  }

  try {
    return NextResponse.json(
      await buildDigestForMonth(month === null ? {} : { month }),
    );
  } catch (error) {
    return errorResponse(error, "Failed to build the monthly digest");
  }
}
