import { NextResponse } from "next/server";

import { getDataSource } from "@/lib/data/source";
import { newDisbursementSchema } from "@/lib/data/schemas";

export async function GET() {
  try {
    const source = await getDataSource();
    const data = await source.loadDisbursements();
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load disbursements" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
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
    return NextResponse.json(disbursement, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to add disbursement" },
      { status: 500 }
    );
  }
}
