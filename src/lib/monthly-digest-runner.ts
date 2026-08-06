/**
 * The I/O half of the monthly digest (ARCHITECTURE.md).
 *
 * Mirrors `reports-runner.ts` exactly: every entry point — the page, the
 * on-demand send, and the cron's 3rd-of-the-month send — comes through here, so
 * there is one definition of "today", one definition of "which month", and one
 * place rows are loaded.
 *
 * `src/lib/monthly-digest.ts` stays pure and imports nothing from this file.
 * That split is what makes the estimator checkable by hand against literal
 * arrays, and it is why this module is the `server-only` one.
 */
import "server-only";

import { buildCategoryColorMap } from "@/lib/colors";
import { APP_TIMEZONE } from "@/lib/config";
import { loadLedgerCached, loadSubscriptionsCached } from "@/lib/data/cache";
import type { Subscription } from "@/lib/data/types";
import { addMonthsToKey, monthKeyOf, todayInZone } from "@/lib/dates";
import { sendMonthlyDigestEmail } from "@/lib/email";
import { buildMonthlyDigest, type MonthlyDigest } from "@/lib/monthly-digest";

export interface DigestSendOutcome {
  sent: boolean;
  subject: string | null;
  /** Present when `sent` is false. Never a thrown error — same contract as the report runner. */
  reason?: string;
}

interface DigestOptions {
  today?: string;
  /**
   * "YYYY-MM". Defaults to the month *before* `today` — the digest always covers
   * a **completed** month, which is the whole reason it has no partial-day rule.
   */
  month?: string;
  fresh?: boolean;
}

/**
 * The month a digest generated on `today` covers: the previous calendar one.
 *
 * Exported because the page's month picker needs to know which month is the
 * newest it may offer. Deriving it in two places is exactly the kind of
 * disagreement this runner exists to prevent.
 */
export function defaultDigestMonth(today: string): string {
  return addMonthsToKey(monthKeyOf(today), -1);
}

/**
 * Subscriptions, or none.
 *
 * `SqliteDataSource` throws on every subscription method — dev-only mode, no
 * such table (ARCHITECTURE.md). Degrading to "no known recurring charges" is
 * accurate in that mode; failing the whole digest over it would not be. The
 * projection's subscription line is simply $0, and it is labelled, so nothing
 * silently reads as a forecast that isn't one.
 */
async function loadSubscriptionsOrNone(fresh?: boolean): Promise<Subscription[]> {
  try {
    return await loadSubscriptionsCached({ fresh });
  } catch (error) {
    console.warn(
      "[monthly-digest] Subscriptions unavailable; projecting none:",
      error,
    );
    return [];
  }
}

/**
 * Loads the ledger and builds the model.
 *
 * `today` defaults to the app's zone rather than the server's for the same
 * reason the report runner does it: on Vercel the server is UTC, and a digest
 * generated at 08:00 ET on the 1st must not think it is already the 2nd — which
 * on the 1st of a month would shift the *month* it covers, not just a day.
 */
export async function buildDigestForMonth(
  options: DigestOptions = {},
): Promise<MonthlyDigest> {
  const today = options.today ?? todayInZone(APP_TIMEZONE);
  const month = options.month ?? defaultDigestMonth(today);

  const [{ receipts, disbursements }, subscriptions] = await Promise.all([
    loadLedgerCached({ fresh: options.fresh }),
    loadSubscriptionsOrNone(options.fresh),
  ]);

  return buildMonthlyDigest(
    receipts,
    disbursements,
    subscriptions,
    month,
    today,
  );
}

/**
 * Builds the digest and mails it. Never throws.
 *
 * Reloads rather than accepting a caller-supplied digest, for the reason the
 * report runner does: the send route takes only a month from the browser, so
 * the numbers in an email you will budget against always came from the database.
 */
export async function sendMonthlyDigest(
  options: DigestOptions = {},
): Promise<DigestSendOutcome> {
  try {
    const today = options.today ?? todayInZone(APP_TIMEZONE);
    const month = options.month ?? defaultDigestMonth(today);

    const [{ receipts, disbursements }, subscriptions] = await Promise.all([
      loadLedgerCached({ fresh: options.fresh }),
      loadSubscriptionsOrNone(options.fresh),
    ]);

    const digest = buildMonthlyDigest(
      receipts,
      disbursements,
      subscriptions,
      month,
      today,
    );

    const result = await sendMonthlyDigestEmail(digest, {
      // ⚠️ Over EVERY category in the ledger, not just this month's — identical
      // reasoning to the call site in `reports-runner.ts`. `buildCategoryColorMap`
      // assigns from the palette by alphabetical index over the set it is handed,
      // so narrowing it to one month's categories would make Groceries turquoise
      // in the digest, blue in the weekly report and blue again in the app. That
      // is a silent violation of CLAUDE.md's same-category-same-colour rule, and
      // nothing else would catch it.
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
    // A digest writes nothing, so there is never anything to unwind — but the
    // cron calls this and must not fail a run of *charges* over a failed summary.
    console.error("[monthly-digest] Failed to build or send digest:", error);
    return {
      sent: false,
      subject: null,
      reason: error instanceof Error ? error.message : "Unknown digest failure",
    };
  }
}
