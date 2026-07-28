import { NextResponse } from "next/server";

import { errorResponse } from "@/lib/api";
import { requireOwnerForApi } from "@/lib/auth-server";
import { sendSubscriptionRunEmail } from "@/lib/email";
import { runDueSubscriptionCharges } from "@/lib/subscriptions-runner";

// A backfill can insert dozens of receipts sequentially; the default 10s is
// thin. The per-subscription cap bounds the worst case.
export const maxDuration = 60;
export const dynamic = "force-dynamic";

/**
 * The manual trigger behind the "Run due charges" button.
 *
 * The browser must never see `CRON_SECRET`, so this is a *separate*
 * owner-gated route rather than the cron endpoint with a header attached. Both
 * are thin wrappers over the same `runDueSubscriptionCharges()` — which is what
 * lets the entire scheduled path (due detection, insert, counter advance, the
 * 23505 replay rule, the cap, the email) be exercised locally before the app
 * has ever been deployed. Only the trigger differs. See FEATURES.md §7.5.
 *
 * Note the static `run-due` segment wins over the sibling `[id]` route in
 * Next's matcher, and ids are numeric, so nothing can collide with it.
 *
 * Static route ordering aside, this handler is a POST because it writes.
 */
export async function POST() {
  const denied = await requireOwnerForApi();
  if (denied) return denied;

  try {
    const result = await runDueSubscriptionCharges();
    // Insert first, email after — and the send swallows its own failures, so a
    // Resend outage can never affect receipts that are already correct.
    await sendSubscriptionRunEmail(result);
    return NextResponse.json(result);
  } catch (error) {
    return errorResponse(error, "Failed to run due charges");
  }
}
