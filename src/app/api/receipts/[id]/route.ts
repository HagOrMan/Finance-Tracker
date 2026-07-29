import { NextResponse } from "next/server";

import { badRequest, errorResponse, parseIdParam } from "@/lib/api";
import { requireOwnerForApi } from "@/lib/auth-server";
import { invalidateReceipts } from "@/lib/data/cache";
import { getDataSource } from "@/lib/data/source";
import { updateReceiptSchema } from "@/lib/data/schemas";

// Next 16 hands route params in as a promise.
type Context = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Context) {
  const denied = await requireOwnerForApi();
  if (denied) return denied;

  const id = parseIdParam((await params).id);
  if (id === null) return badRequest("Invalid receipt id");

  const body = await request.json().catch(() => null);
  const parsed = updateReceiptSchema.safeParse(body);
  if (!parsed.success) {
    return badRequest(parsed.error.issues[0]?.message ?? "Invalid input");
  }

  try {
    const source = await getDataSource();
    // `parsed.data`, never `body`. zod strips unknown keys, and that is the
    // whole reason `id`, `created_at`, `updated_at` and `subscription_id`
    // cannot be patched from outside. Spreading the raw body would undo it.
    const receipt = await source.updateReceipt(id, parsed.data);
    invalidateReceipts();
    return NextResponse.json(receipt);
  } catch (error) {
    return errorResponse(error, "Failed to update receipt");
  }
}

export async function DELETE(_request: Request, { params }: Context) {
  const denied = await requireOwnerForApi();
  if (denied) return denied;

  const id = parseIdParam((await params).id);
  if (id === null) return badRequest("Invalid receipt id");

  try {
    const source = await getDataSource();

    // Hard delete, refused when anything refunds this receipt (ARCHITECTURE.md)
    // — a cascade would silently destroy refund records, and a soft delete
    // would cost a filter in every read path forever. Checked up front so the
    // response can name the blocking rows instead of returning a bare FK error.
    const linked = await source.disbursementsForReceipt(id);
    if (linked.length > 0) {
      return NextResponse.json(
        {
          error: `${linked.length} disbursement${linked.length === 1 ? "" : "s"} refund this receipt. Delete or unlink ${linked.length === 1 ? "it" : "them"} first.`,
          linked,
        },
        { status: 409 },
      );
    }

    await source.deleteReceipt(id);
    invalidateReceipts();
    return NextResponse.json({ ok: true, id });
  } catch (error) {
    // Includes the check-then-delete race: the data layer maps Postgres 23503
    // onto the same 409, just without a populated `linked` list.
    return errorResponse(error, "Failed to delete receipt");
  }
}
