import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";

import { APP_TIMEZONE } from "@/lib/config";
import { dayOfWeekUTC, SATURDAY, todayInZone } from "@/lib/dates";
import { sendSubscriptionRunEmail } from "@/lib/email";
import { sendSpendingReport, type ReportSendOutcome } from "@/lib/reports-runner";
import { runDueSubscriptionCharges } from "@/lib/subscriptions-runner";

export const dynamic = "force-dynamic";
// Hobby allows up to 60s; the default 10s is thin if a backfill inserts dozens
// of receipts sequentially, and this handler now also builds and mails the
// weekly report on Saturdays. The per-subscription cap bounds the worst case.
export const maxDuration = 60;

/**
 * The daily cron. **It does two things**, and the name undersells the second:
 *
 * 1. Writes every subscription charge that is due (FEATURES.md §6.3).
 * 2. On Saturdays, mails the weekly spending report (REPORTS.md §6.1).
 *
 * The report lives here rather than in its own `/api/cron/*` route because
 * Vercel Hobby allows exactly one cron, which FEATURES.md §6.6 already
 * anticipated: "anything else that ever needs scheduling has to be folded into
 * this same handler". Reusing this route also avoids a second `PUBLIC_PATHS`
 * entry — the deny-by-default proxy would 401 a new cron route before its
 * handler ran, and the schedule would silently never fire.
 *
 * ⚠️ **The one route handler in this app that does not call
 * `requireOwnerForApi()`** — there is no session on a cron invocation, so there
 * is nothing to check it against. It gates on `CRON_SECRET` instead.
 *
 * This is the app's only unauthenticated write endpoint and its largest attack
 * surface. `CLAUDE.md`'s hard rules name it as the single explicit exception;
 * an unexplained handler missing the owner guard should otherwise read as a
 * bug, because under Pattern A there is no database backstop behind it.
 *
 * Vercel sends `Authorization: Bearer $CRON_SECRET` automatically once the env
 * var is set on the project.
 */
function requireCronSecret(request: Request): NextResponse | null {
  const expected = process.env.CRON_SECRET;
  // Fail closed: an unset secret means the endpoint is OFF, not open. Same
  // direction as `OWNER_USER_IDS` with an empty value.
  if (!expected) {
    return NextResponse.json({ error: "Not configured" }, { status: 503 });
  }

  const got = request.headers.get("authorization") ?? "";
  const want = `Bearer ${expected}`;
  const a = Buffer.from(got);
  const b = Buffer.from(want);
  // Length-check first: timingSafeEqual throws on a length mismatch. The length
  // of a bearer header isn't the secret.
  const ok = a.length === b.length && timingSafeEqual(a, b);
  if (!ok) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return null;
}

export async function GET(request: Request) {
  const denied = requireCronSecret(request);
  if (denied) return denied;

  try {
    // Charges first, and the ordering is load-bearing: charges WRITE and the
    // report READS. A backfilled charge dated inside the report's window has to
    // be on the ledger before the report counts it.
    const result = await runDueSubscriptionCharges();
    await sendSubscriptionRunEmail(result);

    // Then the report — never before, and never in a way that can change the
    // status this route returns. The charges are the part that must not be
    // re-run by a retry.
    const weeklyReport = await maybeSendWeeklyReport();

    // Returned as JSON so the run is readable in the Vercel function logs.
    return NextResponse.json({ ...result, weeklyReport });
  } catch (error) {
    console.error("[cron/subscriptions] Run failed:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Subscription run failed",
      },
      { status: 500 },
    );
  }
}

/**
 * The Saturday send (REPORTS.md §6.3, §6.4).
 *
 * **Only this function knows about Saturday.** `buildSpendingReport` takes a
 * period and a date and has no opinion about the calendar, which is what lets
 * the identical code path serve the on-demand button on a Tuesday.
 *
 * **Sends every Saturday, including a zero-spend week.** A report that only
 * arrives when something happened is indistinguishable from a broken cron, and
 * nothing else in the app would ever tell you the weekly email stopped. This is
 * the opposite of the subscription email's send-only-on-change rule, on purpose.
 *
 * **No catch-up.** A missed Saturday stays missed: catching up would require
 * remembering when the last one went out, which means persisted state, which
 * would make a lens into a generator. Recovery is one click on `/reports`.
 *
 * Never throws, and always returns a reason — including `not-saturday`, which
 * is how the function logs confirm the check is running at all.
 */
async function maybeSendWeeklyReport(): Promise<ReportSendOutcome> {
  try {
    const today = todayInZone(APP_TIMEZONE);
    if (dayOfWeekUTC(today) !== SATURDAY) {
      // One shape on every path, so the log line is greppable rather than
      // sometimes carrying a `subject` key and sometimes not.
      return { sent: false, subject: null, reason: "not-saturday" };
    }
    return await sendSpendingReport("week", { today });
  } catch (error) {
    console.error("[cron/subscriptions] Weekly report failed:", error);
    return {
      sent: false,
      subject: null,
      reason: error instanceof Error ? error.message : "Weekly report failed",
    };
  }
}
