import { NextResponse } from "next/server";

import { ForeignKeyViolationError, NotFoundError } from "@/lib/data/errors";

/**
 * Route-handler plumbing shared by the mutation endpoints.
 *
 * Note what is deliberately NOT here: the authorization check. Every handler
 * writes `await requireOwnerForApi()` as its own first line, because a guard
 * that lives in a helper is a guard someone can forget to call — and under
 * Pattern A a handler that forgets it is public, with no database backstop.
 */

/** `null` for anything that isn't a positive integer id. */
export function parseIdParam(raw: string | undefined): number | null {
  if (!raw) return null;
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : null;
}

export function badRequest(message: string): NextResponse {
  return NextResponse.json({ error: message }, { status: 400 });
}

/**
 * Maps data-layer errors onto status codes.
 *
 * `ForeignKeyViolationError` reaching here means the handler's own check
 * missed it — either because it doesn't do one, or because it lost the
 * check-then-delete race. The `linked` list will be empty in that case, which
 * the client must tolerate: it's still a 409 with a readable message, rather
 * than a 500 carrying a raw Postgres string.
 */
export function errorResponse(error: unknown, fallback: string): NextResponse {
  if (error instanceof NotFoundError) {
    return NextResponse.json({ error: error.message }, { status: 404 });
  }
  if (error instanceof ForeignKeyViolationError) {
    return NextResponse.json(
      { error: error.message, linked: error.blockedBy },
      { status: 409 },
    );
  }
  return NextResponse.json(
    { error: error instanceof Error ? error.message : fallback },
    { status: 500 },
  );
}
