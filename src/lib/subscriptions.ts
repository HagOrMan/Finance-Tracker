import { addDaysISO } from "@/lib/dates";
import type { IntervalUnit, Subscription } from "@/lib/data/types";

/**
 * Recurrence math. Pure functions over plain "YYYY-MM-DD" strings — no
 * database, no clock, no I/O — so the whole schedule is testable by reading it.
 */

/**
 * The safety valve on a single subscription in a single run.
 *
 * Not a limit on how far the catch-up reaches: a mistyped `start_date` of
 * 1990-01-01 on a *daily* subscription would otherwise generate ~13,000
 * receipts in one go. The cap bounds that to 60, the run reports it as capped,
 * and the remainder trickles in on subsequent days — by which point you will
 * have noticed the email.
 */
export const MAX_CHARGES_PER_SUB_PER_RUN = 60;

/**
 * The date of charge number `n`, where `n = 0` is `start_date` itself.
 *
 * **The bug this exists to avoid:** repeatedly doing `next = next + 1 month`
 * permanently drifts a 31st-of-the-month subscription down to the 28th the
 * first time it passes February, and it never climbs back. Deriving the nth
 * occurrence from `start_date` instead makes every date independent, so drift
 * is structurally impossible rather than merely avoided.
 *
 * The clamp is what makes Jan 31 → **Feb 28** → **Mar 31**, not Mar 28. It also
 * lands a Feb 29 annual on Feb 28 in common years.
 *
 * All UTC, matching `src/lib/dates.ts`'s convention.
 */
export function nthChargeDate(
  startISO: string,
  unit: IntervalUnit,
  count: number,
  n: number,
): string {
  if (unit === "day") return addDaysISO(startISO, n * count);
  if (unit === "week") return addDaysISO(startISO, n * count * 7);

  const months = unit === "year" ? n * count * 12 : n * count;
  const d = new Date(`${startISO}T00:00:00Z`);
  const anchorDay = d.getUTCDate();
  // Land on the 1st of the target month first — setting the day last means an
  // overflow (Feb 31) can't silently roll into the following month.
  const target = new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + months, 1),
  );
  const lastDay = new Date(
    Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0),
  ).getUTCDate();
  target.setUTCDate(Math.min(anchorDay, lastDay));
  return target.toISOString().slice(0, 10);
}

/**
 * The date of the next charge this subscription owes.
 *
 * **Derived, never stored** — it is a pure function of `start_date`, the
 * interval and `charges_generated`, so there is nothing for it to desync from.
 */
export function nextChargeDate(sub: Subscription): string {
  return nthChargeDate(
    sub.start_date,
    sub.interval_unit,
    sub.interval_count,
    sub.charges_generated,
  );
}

export interface DueCharge {
  date: string;
  /** `n` for `nthChargeDate` — also the value `charges_generated` becomes + 1. */
  chargeIndex: number;
}

export interface DueCharges {
  charges: DueCharge[];
  /** True when the cap cut the list short; the rest come on the next run. */
  capped: boolean;
}

/**
 * Every charge this subscription owes as of `todayISO`, oldest first.
 *
 * **Catch-up, not "is today the day" (D2).** The run asks what is outstanding
 * rather than whether today happens to be a charge date, which is what makes
 * every one of these self-heal with no special case:
 *
 * | Situation                                    | Outcome                              |
 * | -------------------------------------------- | ------------------------------------ |
 * | Cron skipped a day (deploy, outage, Hobby)   | Next run writes both days            |
 * | Cron fires twice in a day                    | Second run finds nothing due, no-op  |
 * | A charge insert fails                        | Counter doesn't advance → retried    |
 * | First run ever / backfilling an old sub      | Same code path                       |
 */
export function dueChargesFor(
  sub: Pick<
    Subscription,
    "active" | "start_date" | "interval_unit" | "interval_count" | "charges_generated"
  >,
  todayISO: string,
): DueCharges {
  const charges: DueCharge[] = [];
  if (!sub.active) return { charges, capped: false };

  let n = sub.charges_generated;
  while (charges.length < MAX_CHARGES_PER_SUB_PER_RUN) {
    const date = nthChargeDate(
      sub.start_date,
      sub.interval_unit,
      sub.interval_count,
      n,
    );
    // Lexicographic comparison is chronological for zero-padded ISO dates.
    if (date > todayISO) break;
    charges.push({ date, chargeIndex: n });
    n += 1;
  }

  return {
    charges,
    capped: charges.length === MAX_CHARGES_PER_SUB_PER_RUN,
  };
}

const UNIT_LABEL: Record<IntervalUnit, { one: string; many: string }> = {
  day: { one: "Daily", many: "days" },
  week: { one: "Weekly", many: "weeks" },
  month: { one: "Monthly", many: "months" },
  year: { one: "Yearly", many: "years" },
};

/** "Monthly", "Every 3 months". */
export function cadenceLabel(unit: IntervalUnit, count: number): string {
  const label = UNIT_LABEL[unit];
  return count === 1 ? label.one : `Every ${count} ${label.many}`;
}

/**
 * What one run of the charge generator did.
 *
 * Declared here rather than beside the runner on purpose: the runner is
 * `server-only`, and the "Run due charges" button needs this shape to render
 * the result. A type-only import would technically erase, but keeping it in the
 * pure module means the client never has even a nominal edge into server code.
 */
export interface SubscriptionRunResult {
  today: string;
  inserted: {
    subscriptionId: number;
    name: string;
    date: string;
    price: number;
    receiptId: number;
  }[];
  /** Already on the ledger. The system working, not a problem. */
  skipped: {
    subscriptionId: number;
    name: string;
    date: string;
    reason: "already-charged";
  }[];
  /** Full field set per failure, so each is copy-pasteable into quick-add. */
  failed: {
    subscriptionId: number;
    name: string;
    date: string;
    price: number;
    store: string;
    category: string;
    error: string;
  }[];
  capped: { subscriptionId: number; name: string }[];
}

export type SubscriptionStatus = "paused" | "due" | "overdue" | "active";

/**
 * Status for the badge on `/subscriptions`.
 *
 * `overdue` is the real safety net this feature has: a subscription still
 * showing overdue a day later means the cron isn't running, visible in the UI
 * you actually look at rather than only in an email you might miss.
 */
export function subscriptionStatus(
  sub: Subscription,
  todayISO: string,
): SubscriptionStatus {
  if (!sub.active) return "paused";
  const next = nextChargeDate(sub);
  if (next < todayISO) return "overdue";
  if (next === todayISO) return "due";
  return "active";
}
