/**
 * The demo's stand-in for the network.
 *
 * `request()` in `src/hooks/use-finance-data.ts` calls this instead of `fetch`
 * when `IS_DEMO`, and it **returns a real `Response`** rather than a parsed body
 * or a thrown error. That is what keeps the change at the call site to two
 * lines: `res.ok`, `res.json()`, the `ApiError` construction and the 409
 * `linked` payload the receipt editor reads all run through the existing,
 * unmodified client code. The demo exercises the real client, not a parallel one.
 *
 * **Every handler below mirrors its route handler in `src/app/api/`** — same
 * zod schema, same status codes, same response shape. The status codes are not
 * decoration: `linkedDisbursements()` keys off a 409 and renders the blocking
 * rows inline, and a demo that returned 500 there would silently lose the
 * delete guard.
 *
 * What is deliberately *not* mirrored:
 *
 * - **Authorization.** There is no session and no owner allowlist in demo mode,
 *   and no request reaches a server. `requireOwnerForApi()` is untouched — the
 *   demo simply never gets near it, which is the whole design (`CLAUDE.md`
 *   states it as a hard rule with exactly one exception, and this is not a
 *   second one).
 * - **Cache invalidation.** `src/lib/data/cache.ts` is `server-only` and there
 *   is no server cache to invalidate. TanStack Query's invalidation in the
 *   hooks is untouched and still does its half.
 * - **`?fresh=1`.** A no-op: it exists to drop a server cache entry.
 */
import { APP_TIMEZONE } from "@/lib/config";
import { DemoDataSource } from "@/lib/data/demo-source";
import {
  ForeignKeyViolationError,
  NotFoundError,
  UniqueViolationError,
} from "@/lib/data/errors";
import {
  bulkUpdateDisbursementsSchema,
  bulkUpdateReceiptsSchema,
  newDisbursementSchema,
  newReceiptSchema,
  newSubscriptionSchema,
  updateDisbursementSchema,
  updateReceiptSchema,
  updateSubscriptionSchema,
} from "@/lib/data/schemas";
import { addMonthsToKey, isMonthKey, monthKeyOf, todayInZone } from "@/lib/dates";
import { buildMonthlyDigest } from "@/lib/monthly-digest";
import {
  buildSpendingReport,
  isReportPeriod,
  REPORT_PERIOD_VALUES,
} from "@/lib/reports";
import { dueChargesFor, nthChargeDate } from "@/lib/subscriptions";
import type { SubscriptionRunResult } from "@/lib/subscriptions";

const source = new DemoDataSource();

// ---------------------------------------------------------------------------
// Response plumbing
//
// Hand-rolled rather than reusing `src/lib/api.ts`: that module builds
// `NextResponse` objects and imports `next/server`, neither of which belongs in
// a browser bundle. The *rules* are copied; the implementation can't be.
// ---------------------------------------------------------------------------

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const badRequest = (message: string) => json({ error: message }, 400);

/** The same mapping `errorResponse()` applies in `src/lib/api.ts`. */
function errorResponse(error: unknown, fallback: string): Response {
  if (error instanceof NotFoundError) {
    return json({ error: error.message }, 404);
  }
  if (error instanceof ForeignKeyViolationError) {
    return json({ error: error.message, linked: error.blockedBy }, 409);
  }
  return json(
    { error: error instanceof Error ? error.message : fallback },
    500,
  );
}

/** `null` for anything that isn't a positive integer id — mirrors `parseIdParam`. */
function parseId(raw: string | undefined): number | null {
  if (!raw) return null;
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : null;
}

/** What the server calls "today". See the note in the guide's §4.4. */
function today(): string {
  return todayInZone(APP_TIMEZONE);
}

// ---------------------------------------------------------------------------
// Subscription runs
//
// Reimplemented rather than imported: `src/lib/subscriptions-runner.ts` is
// `server-only`. The two rules that must survive the port are the ones
// ARCHITECTURE.md §6 calls out — a `UniqueViolationError` counts as
// success-already-recorded and still advances the counter, and a genuine
// failure stops that subscription's loop so the charge is retried rather than
// skipped over. The pure schedule math (`dueChargesFor`, `nthChargeDate`)
// imports fine and is used unchanged.
// ---------------------------------------------------------------------------

async function runDueCharges(): Promise<SubscriptionRunResult> {
  const todayISO = today();
  const result: SubscriptionRunResult = {
    today: todayISO,
    inserted: [],
    skipped: [],
    failed: [],
    capped: [],
  };

  for (const sub of await source.loadSubscriptions()) {
    const { charges, capped } = dueChargesFor(sub, todayISO);
    if (capped) result.capped.push({ subscriptionId: sub.id, name: sub.name });
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
          // Already on the ledger — the self-repair path, not a failure.
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
        break;
      }
    }

    if (advancedTo > sub.charges_generated) {
      await source.setChargesGenerated(sub.id, advancedTo);
    }
  }

  return result;
}

async function chargeNow(id: number) {
  const sub = (await source.loadSubscriptions()).find((s) => s.id === id);
  if (!sub) throw new NotFoundError(`Subscription ${id} not found`);

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
      // The counter was behind, not the ledger. Advance it anyway — this branch
      // advancing is what stops the button re-offering the same date forever.
      await source.setChargesGenerated(sub.id, sub.charges_generated + 1);
      return { receiptId: null, date, alreadyCharged: true };
    }
    throw error;
  }
}

// ---------------------------------------------------------------------------
// The router
// ---------------------------------------------------------------------------

/**
 * Email is disabled in demo mode, in three independent places: this handler,
 * `sendEmail()`'s own `IS_DEMO` guard, and the absence of `RESEND_API_KEY` from
 * the demo project's environment. Code cannot send what the environment cannot
 * authenticate — the other two exist so the *reason* is visible in the UI
 * rather than surfacing as "Email not configured".
 *
 * A non-2xx so the page's existing `catch` shows this text; the real routes 502
 * on an unsent report for the same reason.
 */
const sendDisabled = () =>
  json(
    {
      error:
        "Demo mode — nothing is emailed from here. The page above shows exactly what would be sent.",
      sent: false,
      subject: null,
      reason: "demo-mode",
    },
    503,
  );

export async function demoRequest(
  url: string,
  init?: { method: string; input?: unknown },
): Promise<Response> {
  const method = init?.method ?? "GET";
  // A base is required because these are relative paths; the origin is never read.
  const parsed = new URL(url, "http://demo.invalid");
  const params = parsed.searchParams;
  const segments = parsed.pathname.replace(/^\/api\//, "").split("/");
  const body = init?.input;

  try {
    return await route(method, segments, params, body);
  } catch (error) {
    return errorResponse(error, "The demo request failed");
  }
}

async function route(
  method: string,
  segments: string[],
  params: URLSearchParams,
  body: unknown,
): Promise<Response> {
  const [collection, second, third] = segments;

  // --- Receipts ------------------------------------------------------------
  if (collection === "receipts") {
    if (second === undefined) {
      if (method === "GET") return json(await source.loadMergedReceipts());
      if (method === "POST") {
        const parsed = newReceiptSchema.safeParse(body);
        if (!parsed.success) {
          return badRequest(parsed.error.issues[0]?.message ?? "Invalid input");
        }
        return json(await source.insertReceipt(parsed.data), 201);
      }
    }

    if (second === "bulk" && method === "PATCH") {
      const parsed = bulkUpdateReceiptsSchema.safeParse(body);
      if (!parsed.success) {
        return badRequest(parsed.error.issues[0]?.message ?? "Invalid input");
      }
      const receipts = await source.updateReceipts(
        parsed.data.ids,
        parsed.data.patch,
      );
      return json({ updated: receipts.length, receipts });
    }

    const id = parseId(second);
    if (id !== null) {
      if (method === "PATCH") {
        const parsed = updateReceiptSchema.safeParse(body);
        if (!parsed.success) {
          return badRequest(parsed.error.issues[0]?.message ?? "Invalid input");
        }
        return json(await source.updateReceipt(id, parsed.data));
      }
      if (method === "DELETE") {
        // Checked up front, exactly as the route handler does, so the response
        // can name the blocking rows rather than returning a bare FK error.
        const linked = await source.disbursementsForReceipt(id);
        if (linked.length > 0) {
          return json(
            {
              error: `${linked.length} disbursement${linked.length === 1 ? "" : "s"} refund this receipt. Delete or unlink ${linked.length === 1 ? "it" : "them"} first.`,
              linked,
            },
            409,
          );
        }
        await source.deleteReceipt(id);
        return json({ ok: true, id });
      }
    }
    if (second !== undefined && second !== "bulk" && id === null) {
      return badRequest("Invalid receipt id");
    }
  }

  // --- Disbursements -------------------------------------------------------
  if (collection === "disbursements") {
    if (second === undefined) {
      if (method === "GET") return json(await source.loadDisbursements());
      if (method === "POST") {
        const parsed = newDisbursementSchema.safeParse(body);
        if (!parsed.success) {
          return badRequest(parsed.error.issues[0]?.message ?? "Invalid input");
        }
        return json(await source.insertDisbursement(parsed.data), 201);
      }
    }

    if (second === "bulk" && method === "PATCH") {
      const parsed = bulkUpdateDisbursementsSchema.safeParse(body);
      if (!parsed.success) {
        return badRequest(parsed.error.issues[0]?.message ?? "Invalid input");
      }
      const disbursements = await source.updateDisbursements(
        parsed.data.ids,
        parsed.data.patch,
      );
      return json({ updated: disbursements.length, disbursements });
    }

    const id = parseId(second);
    if (id !== null) {
      if (method === "PATCH") {
        const parsed = updateDisbursementSchema.safeParse(body);
        if (!parsed.success) {
          return badRequest(parsed.error.issues[0]?.message ?? "Invalid input");
        }
        return json(await source.updateDisbursement(id, parsed.data));
      }
      if (method === "DELETE") {
        await source.deleteDisbursement(id);
        return json({ ok: true, id });
      }
    }
    if (second !== undefined && second !== "bulk" && id === null) {
      return badRequest("Invalid disbursement id");
    }
  }

  // --- Subscriptions -------------------------------------------------------
  if (collection === "subscriptions") {
    if (second === undefined) {
      if (method === "GET") return json(await source.loadSubscriptions());
      if (method === "POST") {
        const parsed = newSubscriptionSchema.safeParse(body);
        if (!parsed.success) {
          return badRequest(parsed.error.issues[0]?.message ?? "Invalid input");
        }
        return json(await source.insertSubscription(parsed.data), 201);
      }
    }

    // Static segments win over `[id]` in Next's matcher; same order here.
    if (second === "run-due" && method === "POST") {
      return json(await runDueCharges());
    }

    const id = parseId(second);
    if (id !== null) {
      if (third === "charge-now" && method === "POST") {
        return json(await chargeNow(id));
      }
      if (method === "PATCH") {
        const parsed = updateSubscriptionSchema.safeParse(body);
        if (!parsed.success) {
          return badRequest(parsed.error.issues[0]?.message ?? "Invalid input");
        }
        return json(await source.updateSubscription(id, parsed.data));
      }
      if (method === "DELETE") {
        const generated = await source.receiptsForSubscription(id);
        if (generated.length > 0) {
          return json(
            {
              error: `This subscription has generated ${generated.length} receipt${
                generated.length === 1 ? "" : "s"
              }. Pause it instead, or delete those receipts first.`,
              linked: generated,
            },
            409,
          );
        }
        await source.deleteSubscription(id);
        return json({ ok: true, id });
      }
    }
    if (second !== undefined && second !== "run-due" && id === null) {
      return badRequest("Invalid subscription id");
    }
  }

  // --- Reports -------------------------------------------------------------
  //
  // Built here in the browser from the pure models. That is exactly what the
  // pure/runner split in `reports.ts` / `reports-runner.ts` is for — the
  // runners are `server-only` and must never be imported from this file.
  if (collection === "reports") {
    if (second === undefined && method === "GET") {
      const period = params.get("period");
      if (!isReportPeriod(period)) {
        return badRequest(
          `period must be one of: ${REPORT_PERIOD_VALUES.join(", ")}`,
        );
      }
      const [receipts, disbursements] = await Promise.all([
        source.loadMergedReceipts(),
        source.loadDisbursements(),
      ]);
      return json(
        buildSpendingReport(receipts, disbursements, period, today()),
      );
    }

    if (second === "send" && method === "POST") return sendDisabled();

    if (second === "monthly") {
      if (third === "send" && method === "POST") return sendDisabled();

      if (third === undefined && method === "GET") {
        const month = params.get("month");
        if (month !== null && !isMonthKey(month)) {
          return badRequest("month must be a YYYY-MM string");
        }
        const todayISO = today();
        // `defaultDigestMonth` lives in the `server-only` runner, so the rule it
        // encodes — the digest always covers a COMPLETED month, i.e. the one
        // before today — is restated here rather than imported.
        const target = month ?? addMonthsToKey(monthKeyOf(todayISO), -1);
        const [receipts, disbursements, subscriptions] = await Promise.all([
          source.loadMergedReceipts(),
          source.loadDisbursements(),
          source.loadSubscriptions(),
        ]);
        return json(
          buildMonthlyDigest(
            receipts,
            disbursements,
            subscriptions,
            target,
            todayISO,
          ),
        );
      }
    }
  }

  return json(
    { error: `No demo handler for ${method} /api/${segments.join("/")}` },
    404,
  );
}
