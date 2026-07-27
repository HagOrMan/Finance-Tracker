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
