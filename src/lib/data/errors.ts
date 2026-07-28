/**
 * Data-layer errors that route handlers translate into HTTP status codes.
 *
 * The point is that `supabase-source.ts` and `sqlite-source.ts` speak different
 * dialects of failure — a PostgREST error object with `code: "23503"` versus a
 * `SQLITE_CONSTRAINT_FOREIGNKEY` message — and neither should leak into a route
 * handler, let alone into a response body. Both sources normalize to these two
 * classes; everything else stays a plain `Error` and becomes a 500.
 */

/** No row with that id. → 404 */
export class NotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NotFoundError";
  }
}

/**
 * A delete was refused because another row references it. → 409
 *
 * Carries the blocking rows so the handler can return something usable instead
 * of a Postgres message string. It's typed as `unknown[]` here because the data
 * layer shouldn't need to know what the caller intends to render.
 */
export class ForeignKeyViolationError extends Error {
  constructor(
    message: string,
    readonly blockedBy: unknown[] = [],
  ) {
    super(message);
    this.name = "ForeignKeyViolationError";
  }
}

/**
 * A unique index rejected the insert (Postgres `23505`).
 *
 * Raised by exactly one call — `insertSubscriptionCharge` hitting
 * `receipts_subscription_charge_uniq` — and it is **not an error condition**
 * there. It means the charge for that (subscription, date) is already recorded,
 * which is precisely what the runner wants to know after a crash between the
 * receipt insert and the counter advance. FEATURES.md §6.4 spells out why
 * treating it as success is what makes the design self-repairing without
 * transactions; a reviewer who doesn't understand that will delete it.
 */
export class UniqueViolationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UniqueViolationError";
  }
}
