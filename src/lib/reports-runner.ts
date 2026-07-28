/**
 * The I/O half of spending reports (REPORTS.md §4.2).
 *
 * Mirrors `subscriptions-runner.ts`: every entry point — the `GET /api/reports`
 * preview, the `POST /api/reports/send` button, and the cron's Saturday send —
 * goes through here, so there is one definition of "today" and one place rows
 * are loaded.
 *
 * `src/lib/reports.ts` stays pure and free of imports from this file. That
 * separation is what makes the model checkable by hand against literal arrays,
 * and it is why this module is the only one that has to be `server-only`.
 */
import "server-only";

import { APP_TIMEZONE } from "@/lib/config";
import { buildCategoryColorMap } from "@/lib/colors";
import { getDataSource } from "@/lib/data/source";
import { todayInZone } from "@/lib/dates";
import { sendSpendingReportEmail } from "@/lib/email";
import {
  buildSpendingReport,
  type ReportPeriod,
  type SpendingReport,
} from "@/lib/reports";

export interface ReportSendOutcome {
  sent: boolean;
  subject: string | null;
  /** Present when `sent` is false. Never a thrown error — see §6.2. */
  reason?: string;
}

/**
 * Loads the ledger and builds the model.
 *
 * `today` defaults to the app's zone rather than the server's: on Vercel the
 * server runs in UTC, and a report generated at 08:00 ET must not think it is
 * already tomorrow — the window boundaries would all shift by a day. Same
 * reasoning as the subscription runner, same helper.
 */
export async function buildReportForPeriod(
  period: ReportPeriod,
  options: { today?: string } = {},
): Promise<SpendingReport> {
  const today = options.today ?? todayInZone(APP_TIMEZONE);
  const source = await getDataSource();
  const [receipts, disbursements] = await Promise.all([
    source.loadMergedReceipts(),
    source.loadDisbursements(),
  ]);
  return buildSpendingReport(receipts, disbursements, period, today);
}

/**
 * Builds the report and mails it. Never throws.
 *
 * Note it reloads rather than accepting a caller-supplied report: the send
 * route takes only a `period` from the browser, so the numbers in an email you
 * will act on always came from the database.
 */
export async function sendSpendingReport(
  period: ReportPeriod,
  options: { today?: string } = {},
): Promise<ReportSendOutcome> {
  try {
    const today = options.today ?? todayInZone(APP_TIMEZONE);
    const source = await getDataSource();
    const [receipts, disbursements] = await Promise.all([
      source.loadMergedReceipts(),
      source.loadDisbursements(),
    ]);
    const report = buildSpendingReport(receipts, disbursements, period, today);

    const result = await sendSpendingReportEmail(report, {
      // ⚠️ Over EVERY category in the ledger, not just the ones in this window.
      //
      // `buildCategoryColorMap` assigns from the palette by alphabetical index
      // over the set it is handed, so a set of four window categories produces
      // different colors than the app's pages, which pass every category in the
      // full receipt list (`monthly/page.tsx`, `stores/page.tsx`). Narrowing
      // this would make Groceries turquoise in the email and blue in the app —
      // a silent violation of CLAUDE.md's same-category-same-color rule that
      // nothing else would catch.
      categoryColors: buildCategoryColorMap(
        receipts.map((r) => r.category),
        "light",
      ),
      appUrl: process.env.NEXT_PUBLIC_SITE_URL,
    });

    return {
      sent: result.sent,
      subject: result.subject,
      ...(result.reason ? { reason: result.reason } : {}),
    };
  } catch (error) {
    // A report writes nothing, so there is never anything to unwind — but the
    // cron calls this and must not fail a run of *charges* over a failed
    // summary of them.
    console.error("[reports] Failed to build or send report:", error);
    return {
      sent: false,
      subject: null,
      reason: error instanceof Error ? error.message : "Unknown report failure",
    };
  }
}
