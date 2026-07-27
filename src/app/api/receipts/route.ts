import { NextResponse } from "next/server";

import { requireOwnerForApi } from "@/lib/auth-server";
import { getDataSource } from "@/lib/data/source";
import { newReceiptSchema } from "@/lib/data/schemas";

// Route handlers can be hit directly without ever passing through middleware,
// so every one re-checks authorization itself — including the reads.
export async function GET() {
  const denied = await requireOwnerForApi();
  if (denied) return denied;

  try {
    const source = await getDataSource();
    const data = await source.loadMergedReceipts();
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
    const source = await getDataSource();
    const receipt = await source.insertReceipt(parsed.data);
    return NextResponse.json(receipt, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to add receipt" },
      { status: 500 }
    );
  }
}
