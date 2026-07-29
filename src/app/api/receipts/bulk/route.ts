import { NextResponse } from "next/server";

import { badRequest, errorResponse } from "@/lib/api";
import { requireOwnerForApi } from "@/lib/auth-server";
import { invalidateReceipts } from "@/lib/data/cache";
import { getDataSource } from "@/lib/data/source";
import { bulkUpdateReceiptsSchema } from "@/lib/data/schemas";

/**
 * `PATCH /api/receipts/bulk` — one endpoint behind recategorize, rename and
 * merge, because all three are "apply this patch to these ids" (ARCHITECTURE.md).
 *
 * The static `bulk` segment wins over the sibling `[id]` route in Next's
 * matcher, so this is not ambiguous — but it does mean `bulk` is now a
 * reserved receipt id in the URL space. Ids are numeric, so nothing collides.
 */
export async function PATCH(request: Request) {
  const denied = await requireOwnerForApi();
  if (denied) return denied;

  const body = await request.json().catch(() => null);
  const parsed = bulkUpdateReceiptsSchema.safeParse(body);
  if (!parsed.success) {
    return badRequest(parsed.error.issues[0]?.message ?? "Invalid input");
  }

  try {
    const source = await getDataSource();
    const { ids, patch } = parsed.data;
    const receipts = await source.updateReceipts(ids, patch);
    invalidateReceipts();
    // `updated` can be short of `ids.length` when the client's cached list has
    // gone stale against a delete. That's information, not an error — the
    // caller decides whether a partial hit is worth surfacing.
    return NextResponse.json({ updated: receipts.length, receipts });
  } catch (error) {
    return errorResponse(error, "Failed to update receipts");
  }
}
