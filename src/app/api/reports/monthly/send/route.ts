import { NextResponse } from "next/server";

import { requireOwnerForApi } from "@/lib/auth-server";
import { isMonthKey } from "@/lib/dates";
import { sendMonthlyDigest } from "@/lib/monthly-digest-runner";

export const dynamic = "force-dynamic";
// The digest reads the whole ledger plus the subscription schedule, then waits
// on Resend. The default 10s is thin for both together.
export const maxDuration = 60;

/**
 * The "Send to email" button on `/reports/monthly` (ARCHITECTURE.md).
 *
 * **Takes only `{ month }` — never a digest body.** It rebuilds the model
 * server-side from the database. The shallow reason is payload size; the real
 * one is that a client-supplied payload would mean the numbers in an email you
 * are about to budget against came from somewhere other than the ledger, with
 * nothing in the email able to tell you they did.
 *
 * A POST because it has an outward-facing effect, not because it writes — a
 * digest still writes nothing anywhere.
 */
export async function POST(request: Request) {
  const denied = await requireOwnerForApi();
  if (denied) return denied;

  const body = await request.json().catch(() => null);
  const month = (body as { month?: unknown } | null)?.month;
  if (!isMonthKey(month)) {
    return NextResponse.json(
      { error: "month must be a YYYY-MM string" },
      { status: 400 },
    );
  }

  // `sendMonthlyDigest` never throws — it reports failure in its result. Here,
  // unlike the cron, somebody is watching, so an unsent digest surfaces as a
  // 502 with the reason rather than a quiet `sent: false`.
  const outcome = await sendMonthlyDigest({ month });
  if (!outcome.sent) {
    return NextResponse.json(
      { error: outcome.reason ?? "The digest was not sent.", ...outcome },
      { status: 502 },
    );
  }
  return NextResponse.json(outcome);
}
