import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";

import { APP_TIMEZONE, DIGEST_SEND_DAY_OF_MONTH } from "@/lib/config";
import { invalidateSubscriptionCharges } from "@/lib/data/cache";
import { IS_DEMO } from "@/lib/demo/flag";
import { dayOfWeekUTC, SATURDAY, todayInZone } from "@/lib/dates";
import { sendSubscriptionRunEmail } from "@/lib/email";
import {
  sendMonthlyDigest,
  type DigestSendOutcome,
} from "@/lib/monthly-digest-runner";
import { sendSpendingReport, type ReportSendOutcome } from "@/lib/reports-runner";
import { runDueSubscriptionCharges } from "@/lib/subscriptions-runner";

export const dynamic = "force-dynamic";
// Hobby allows up to 60s; the default 10s is thin if a backfill inserts dozens
// of receipts sequentially, and this handler now also builds and mails the
// weekly report on Saturdays. The per-subscription cap bounds the worst case.
export const maxDuration = 60;

/**
 * The daily cron. **It does three things**, and the name undersells two of them:
 *
 * 1. Writes every subscription charge that is due (ARCHITECTURE.md).
 * 2. On Saturdays, mails the weekly spending report (ARCHITECTURE.md).
 * 3. On the 3rd, mails the previous month's digest (ARCHITECTURE.md).
 *
 * All three live here rather than in their own `/api/cron/*` routes because
 * Vercel Hobby allows exactly one cron, which ARCHITECTURE.md already
 * anticipated: "anything else that ever needs scheduling has to be folded into
 * this same handler". Reusing this route also avoids a second `PUBLIC_PATHS`
 * entry — the deny-by-default proxy would 401 a new cron route before its
 * handler ran, and the schedule would silently never fire.
 *
 * **The 3rd is a Saturday roughly one month in seven, and both emails send.**
 * They are different lenses, and suppressing either would break the rule the
 * weekly report leans on: that a silent Saturday means the cron is broken.
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
  // `vercel.json` is committed, so a second Vercel project building from the
  // same branch registers the same schedule. Nothing scheduled belongs in a
  // demo: there is no shared ledger for it to write to, and the emails it
  // exists to send would be duplicates of the real project's.
  //
  // Belt and braces — the demo environment carries no `CRON_SECRET`, so the
  // 503 below would already stop it, and no `RESEND_API_KEY`, so `sendEmail()`
  // would refuse a third time. This return makes the intent readable instead of
  // resting on two absent env vars.
  if (IS_DEMO) {
    return NextResponse.json(
      { skipped: "demo mode", ranAt: null },
      { status: 200 },
    );
  }

  const denied = requireCronSecret(request);
  if (denied) return denied;

  try {
    // Charges first, and the ordering is load-bearing: charges WRITE and the
    // report READS. A backfilled charge dated inside the report's window has to
    // be on the ledger before the report counts it.
    const result = await runDueSubscriptionCharges();
    invalidateSubscriptionCharges();
    await sendSubscriptionRunEmail(result);

    // Then the summaries — never before, and never in a way that can change the
    // status this route returns. The charges are the part that must not be
    // re-run by a retry.
    //
    // Sequential rather than `Promise.all`: on the ~1-in-7 days both fire, they
    // both re-read the ledger, and running them concurrently would have two
    // uncached reads racing to repopulate the same cache entry. Nothing is
    // waiting on this job, so the few hundred milliseconds cost nothing.
    const weeklyReport = await maybeSendWeeklyReport();
    const monthlyDigest = await maybeSendMonthlyDigest();

    // Returned as JSON so the run is readable in the Vercel function logs.
    return NextResponse.json({ ...result, weeklyReport, monthlyDigest });
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
 * The Saturday send (ARCHITECTURE.md, §6.4).
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
    // `fresh: true` for the same reason the ordering above is load-bearing: the
    // charges written moments ago may fall inside this window, and the report
    // must not be built from a cache entry that predates them. This is the one
    // read in the app that pays for a guaranteed round trip.
    return await sendSpendingReport("week", { today, fresh: true });
  } catch (error) {
    console.error("[cron/subscriptions] Weekly report failed:", error);
    return {
      sent: false,
      subject: null,
      reason: error instanceof Error ? error.message : "Weekly report failed",
    };
  }
}

/**
 * The 3rd-of-the-month send (ARCHITECTURE.md).
 *
 * **Only this function knows about the 3rd**, exactly as only
 * `maybeSendWeeklyReport` knows about Saturday. `buildMonthlyDigest` takes a
 * month and a date and has no opinion about the calendar, which is what lets the
 * same code path serve the page's month picker on any day.
 *
 * **The 3rd rather than the 1st** because receipts are entered as they happen,
 * so the last days of a month are the least likely to be on the ledger the
 * moment it closes. The lookback is a fixed calendar month either way, so the
 * grace costs nothing — and a digest is a lens, so a receipt entered on the 2nd
 * would otherwise be absent from it forever rather than corrected later.
 *
 * **Sends every month, including an empty one**, for the reason the weekly
 * report does: a summary that only arrives when something happened is
 * indistinguishable from a broken cron.
 *
 * **No catch-up.** A missed 3rd stays missed — catching up would mean
 * remembering when the last one went out, which means persisted state, which
 * would turn a lens into a generator. Recovery is the month picker on
 * `/reports/monthly`.
 *
 * The month is left to the runner, which derives "the month before today". Two
 * places deciding that is exactly the disagreement the runner exists to prevent.
 */
async function maybeSendMonthlyDigest(): Promise<DigestSendOutcome> {
  try {
    const today = todayInZone(APP_TIMEZONE);
    if (Number(today.slice(8, 10)) !== DIGEST_SEND_DAY_OF_MONTH) {
      // One shape on every path, so the log line is greppable rather than
      // sometimes carrying a `subject` key and sometimes not.
      return { sent: false, subject: null, reason: "not-digest-day" };
    }
    // `fresh: true` for a subtler reason than the weekly report's: a charge
    // written minutes ago is dated today, which is in the *current* month and
    // therefore outside this digest's window — except when it is a backfill of
    // an overdue charge, which lands dated in the month being reported on.
    return await sendMonthlyDigest({ today, fresh: true });
  } catch (error) {
    console.error("[cron/subscriptions] Monthly digest failed:", error);
    return {
      sent: false,
      subject: null,
      reason: error instanceof Error ? error.message : "Monthly digest failed",
    };
  }
}
