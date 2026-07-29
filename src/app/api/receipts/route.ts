import { NextResponse } from "next/server";

import { wantsFreshData } from "@/lib/api";
import { requireOwnerForApi } from "@/lib/auth-server";
import {
  invalidateReceipts,
  loadMergedReceiptsCached,
} from "@/lib/data/cache";
import { getDataSource } from "@/lib/data/source";
import { newReceiptSchema } from "@/lib/data/schemas";

// Route handlers can be hit directly without ever passing through middleware,
// so every one re-checks authorization itself — including the reads.
export async function GET(request: Request) {
  const denied = await requireOwnerForApi();
  if (denied) return denied;

  try {
    // Cached read (see `src/lib/data/cache.ts`). Authorization above still runs
    // per request — only the Supabase query is shared.
    const data = await loadMergedReceiptsCached({
      fresh: wantsFreshData(request),
    });
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load receipts" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  const denied = await requireOwnerForApi();
  if (denied) return denied;

  const body = await request.json().catch(() => null);
  const parsed = newReceiptSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 }
    );
  }

  try {
    // Writes go to the uncached source directly — see cache.ts for why.
    const source = await getDataSource();
    const receipt = await source.insertReceipt(parsed.data);
    invalidateReceipts();
    return NextResponse.json(receipt, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to add receipt" },
      { status: 500 }
    );
  }
}
