import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";

import { sendSubscriptionRunEmail } from "@/lib/email";
import { runDueSubscriptionCharges } from "@/lib/subscriptions-runner";

export const dynamic = "force-dynamic";
// Hobby allows up to 60s; the default 10s is thin if a backfill inserts dozens
// of receipts sequentially. The per-subscription cap bounds the worst case.
export const maxDuration = 60;

/**
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
    const result = await runDueSubscriptionCharges();
    await sendSubscriptionRunEmail(result);
    // Returned as JSON so the run is readable in the Vercel function logs.
    return NextResponse.json(result);
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
