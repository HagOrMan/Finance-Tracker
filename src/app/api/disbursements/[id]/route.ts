import { NextResponse } from "next/server";

import { badRequest, errorResponse, parseIdParam } from "@/lib/api";
import { requireOwnerForApi } from "@/lib/auth-server";
import { invalidateDisbursements } from "@/lib/data/cache";
import { getDataSource } from "@/lib/data/source";
import { updateDisbursementSchema } from "@/lib/data/schemas";

type Context = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Context) {
  const denied = await requireOwnerForApi();
  if (denied) return denied;

  const id = parseIdParam((await params).id);
  if (id === null) return badRequest("Invalid disbursement id");

  const body = await request.json().catch(() => null);
  const parsed = updateDisbursementSchema.safeParse(body);
  if (!parsed.success) {
    return badRequest(parsed.error.issues[0]?.message ?? "Invalid input");
  }

  try {
    const source = await getDataSource();
    // `parsed.data`, never `body` — see the receipts route for why.
    const disbursement = await source.updateDisbursement(id, parsed.data);
    invalidateDisbursements();
    return NextResponse.json(disbursement);
  } catch (error) {
    return errorResponse(error, "Failed to update disbursement");
  }
}

export async function DELETE(_request: Request, { params }: Context) {
  const denied = await requireOwnerForApi();
  if (denied) return denied;

  const id = parseIdParam((await params).id);
  if (id === null) return badRequest("Invalid disbursement id");

  try {
    // No FK guard needed in this direction: nothing references a disbursement.
    // It is the row that does the referencing.
    const source = await getDataSource();
    await source.deleteDisbursement(id);
    invalidateDisbursements();
    return NextResponse.json({ ok: true, id });
  } catch (error) {
    return errorResponse(error, "Failed to delete disbursement");
  }
}
