import { NextResponse } from "next/server";

import { getDataSource } from "@/lib/data/source";
import { newReceiptSchema } from "@/lib/data/schemas";

export async function GET() {
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
