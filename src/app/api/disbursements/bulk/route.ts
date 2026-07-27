import { NextResponse } from "next/server";

import { badRequest, errorResponse } from "@/lib/api";
import { requireOwnerForApi } from "@/lib/auth-server";
import { getDataSource } from "@/lib/data/source";
import { bulkUpdateDisbursementsSchema } from "@/lib/data/schemas";

/**
 * `PATCH /api/disbursements/bulk` — the receipts endpoint's twin.
 *
 * Not in FEATURES.md's original Phase 0 table; added because entity names have
 * exactly the store problem ("Kyle" vs "kyle h" vs "Kyle Hagerman") and merging
 * them is the same operation on a different column. See the amendment in
 * FEATURES.md §4.7.
 */
export async function PATCH(request: Request) {
  const denied = await requireOwnerForApi();
  if (denied) return denied;

  const body = await request.json().catch(() => null);
  const parsed = bulkUpdateDisbursementsSchema.safeParse(body);
  if (!parsed.success) {
    return badRequest(parsed.error.issues[0]?.message ?? "Invalid input");
  }

  try {
    const source = await getDataSource();
    const { ids, patch } = parsed.data;
    const disbursements = await source.updateDisbursements(ids, patch);
    return NextResponse.json({
      updated: disbursements.length,
      disbursements,
    });
  } catch (error) {
    return errorResponse(error, "Failed to update disbursements");
  }
}
