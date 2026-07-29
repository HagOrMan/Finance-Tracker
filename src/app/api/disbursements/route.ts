import { NextResponse } from "next/server";

import { wantsFreshData } from "@/lib/api";
import { requireOwnerForApi } from "@/lib/auth-server";
import {
  invalidateDisbursements,
  loadDisbursementsCached,
} from "@/lib/data/cache";
import { getDataSource } from "@/lib/data/source";
import { newDisbursementSchema } from "@/lib/data/schemas";

// Route handlers can be hit directly without ever passing through middleware,
// so every one re-checks authorization itself — including the reads.
export async function GET(request: Request) {
  const denied = await requireOwnerForApi();
  if (denied) return denied;

  try {
    const data = await loadDisbursementsCached({
      fresh: wantsFreshData(request),
    });
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load disbursements" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  const denied = await requireOwnerForApi();
  if (denied) return denied;

  const body = await request.json().catch(() => null);
  const parsed = newDisbursementSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 }
    );
  }

  try {
    const source = await getDataSource();
    const disbursement = await source.insertDisbursement(parsed.data);
    // Only the disbursements tag. `actual_price` is recomputed by merging the
    // two cached lists per request, so the receipts entry is still correct.
    invalidateDisbursements();
    return NextResponse.json(disbursement, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to add disbursement" },
      { status: 500 }
    );
  }
}
