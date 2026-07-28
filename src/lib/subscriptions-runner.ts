/**
 * The one place charges are actually written.
 *
 * Both entry points are thin wrappers over `runDueSubscriptionCharges()`:
 * `GET /api/cron/subscriptions` (gated on `CRON_SECRET`) and
 * `POST /api/subscriptions/run-due` (gated on `requireOwnerForApi`). Only the
 * trigger differs, which is what makes the scheduled path testable locally
 * before the app is ever deployed — see FEATURES.md §7.5.
 *
 * `SubscriptionRunResult` deliberately lives in the pure `subscriptions.ts`
 * rather than here: this module is `server-only`, and the client needs the
 * shape to render the run summary.
 */
import "server-only";

import { APP_TIMEZONE } from "@/lib/config";
import { getDataSource } from "@/lib/data/source";
import { UniqueViolationError } from "@/lib/data/errors";
import type { DataSource, Subscription } from "@/lib/data/types";
import { todayInZone } from "@/lib/dates";
import {
  dueChargesFor,
  nthChargeDate,
  type SubscriptionRunResult,
} from "@/lib/subscriptions";

function emptyResult(today: string): SubscriptionRunResult {
  return { today, inserted: [], skipped: [], failed: [], capped: [] };
}

/**
 * Writes every outstanding charge for every active subscription.
 *
 * The ordering inside a subscription is load-bearing:
 *
 * 1. Charges are processed oldest-first.
 * 2. A `23505` unique violation counts as **success-already-recorded**, not a
 *    failure — the receipt is on the ledger, only the counter fell behind
 *    (FEATURES.md §6.4). This is what repairs a crash between the insert and
 *    the counter advance, with no transaction anywhere.
 * 3. A genuine failure **stops that subscription's loop**. The counter is
 *    advanced only past the consecutive successes, so the failed charge is
 *    retried tomorrow and the ones after it don't get skipped over.
 *
 * One counter write per subscription rather than one per charge: a crash before
 * it simply means the next run recomputes the same dates and rule 2 absorbs the
 * re-inserts.
 */
export async function runDueSubscriptionCharges(
  options: { today?: string } = {},
): Promise<SubscriptionRunResult> {
  const today = options.today ?? todayInZone(APP_TIMEZONE);
  const source = await getDataSource();
  const result = emptyResult(today);

  const subscriptions = await source.loadSubscriptions();

  for (const sub of subscriptions) {
    const { charges, capped } = dueChargesFor(sub, today);
    if (capped) {
      result.capped.push({ subscriptionId: sub.id, name: sub.name });
    }
    if (charges.length === 0) continue;

    let advancedTo = sub.charges_generated;

    for (const charge of charges) {
      try {
        const receipt = await source.insertSubscriptionCharge(sub, charge.date);
        result.inserted.push({
          subscriptionId: sub.id,
          name: sub.name,
          date: charge.date,
          price: sub.price,
          receiptId: receipt.id,
        });
        advancedTo = charge.chargeIndex + 1;
      } catch (error) {
        if (error instanceof UniqueViolationError) {
          // Already on the ledger. Advance past it and keep going — this is the
          // self-repair path, not an error. Do not "fix" this by failing.
          result.skipped.push({
            subscriptionId: sub.id,
            name: sub.name,
            date: charge.date,
            reason: "already-charged",
          });
          advancedTo = charge.chargeIndex + 1;
          continue;
        }

        result.failed.push({
          subscriptionId: sub.id,
          name: sub.name,
          date: charge.date,
          price: sub.price,
          store: sub.store,
          category: sub.category,
          error: error instanceof Error ? error.message : "Unknown error",
        });
        // Stop this subscription here: charges are chronological, and skipping
        // past a failure would strand it permanently.
        break;
      }
    }

    if (advancedTo > sub.charges_generated) {
      try {
        await source.setChargesGenerated(sub.id, advancedTo);
      } catch (error) {
        // The receipts are already written; a counter that didn't advance just
        // means tomorrow's run re-derives the same dates and rule 2 absorbs
        // them. Report it, don't unwind anything.
        result.failed.push({
          subscriptionId: sub.id,
          name: sub.name,
          date: today,
          price: sub.price,
          store: sub.store,
          category: sub.category,
          error: `Charges written but the counter did not advance: ${
            error instanceof Error ? error.message : "Unknown error"
          }`,
        });
      }
    }
  }

  return result;
}

/**
 * Writes the single next scheduled charge for one subscription — the
 * "Charge now" button.
 *
 * Note what this deliberately does *not* check: whether that charge is due yet.
 * It writes the next one on the schedule, dated its scheduled date, because the
 * reason to press it is usually "the charge landed early and I want it
 * recorded". The UI states the date on the button so nothing is written blind.
 * Being early doesn't desync anything — `charges_generated` advances by one and
 * the following date is still derived from `start_date`.
 */
export async function chargeSubscriptionNow(
  id: number,
): Promise<{ receiptId: number | null; date: string; alreadyCharged: boolean }> {
  const source = await getDataSource();
  const sub = await loadSubscription(source, id);

  const date = nthChargeDate(
    sub.start_date,
    sub.interval_unit,
    sub.interval_count,
    sub.charges_generated,
  );

  try {
    const receipt = await source.insertSubscriptionCharge(sub, date);
    await source.setChargesGenerated(sub.id, sub.charges_generated + 1);
    return { receiptId: receipt.id, date, alreadyCharged: false };
  } catch (error) {
    if (error instanceof UniqueViolationError) {
      // Same rule as the runner: the receipt exists, the counter was behind.
      await source.setChargesGenerated(sub.id, sub.charges_generated + 1);
      return { receiptId: null, date, alreadyCharged: true };
    }
    throw error;
  }
}

async function loadSubscription(
  source: DataSource,
  id: number,
): Promise<Subscription> {
  const all = await source.loadSubscriptions();
  const sub = all.find((s) => s.id === id);
  if (!sub) throw new Error(`Subscription ${id} not found`);
  return sub;
}
