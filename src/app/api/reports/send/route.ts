import { NextResponse } from "next/server";

import { requireOwnerForApi } from "@/lib/auth-server";
import { isReportPeriod, REPORT_PERIOD_VALUES } from "@/lib/reports";
import { sendSpendingReport } from "@/lib/reports-runner";

export const dynamic = "force-dynamic";
// A year's report reads the whole ledger and then waits on Resend; the default
// 10s is thin for both together.
export const maxDuration = 60;

/**
 * The "Send to email" button (REPORTS.md §4.3).
 *
 * **Takes only `{ period }` — never a report body.** It rebuilds the model
 * server-side from the database. The shallow reason is payload size; the real
 * one is that a client-supplied payload would mean the numbers in an email you
 * are about to act on came from somewhere other than the ledger, with nothing
 * in the email able to tell you they did.
 *
 * This is a POST because it has an outward-facing effect, not because it
 * writes — a report still writes nothing anywhere.
 */
export async function POST(request: Request) {
  const denied = await requireOwnerForApi();
  if (denied) return denied;

  const body = await request.json().catch(() => null);
  const period = (body as { period?: unknown } | null)?.period;
  if (!isReportPeriod(period)) {
    return NextResponse.json(
      { error: `period must be one of: ${REPORT_PERIOD_VALUES.join(", ")}` },
      { status: 400 },
    );
  }

  // `sendSpendingReport` never throws — it reports failure in its result. Here,
  // unlike the cron, somebody is watching, so an unsent report is surfaced as a
  // 502 with the reason rather than a quiet `sent: false`.
  const outcome = await sendSpendingReport(period);
  if (!outcome.sent) {
    return NextResponse.json(
      { error: outcome.reason ?? "The report was not sent.", ...outcome },
      { status: 502 },
    );
  }
  return NextResponse.json(outcome);
}
