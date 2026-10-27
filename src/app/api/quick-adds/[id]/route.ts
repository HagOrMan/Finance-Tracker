import { NextResponse } from "next/server";

import { badRequest, errorResponse, parseIdParam } from "@/lib/api";
import { requireOwnerForApi } from "@/lib/auth-server";
import { invalidateQuickAdds } from "@/lib/data/cache";
import { getDataSource } from "@/lib/data/source";
import { quickAddSchema } from "@/lib/data/schemas";

// Next 16 hands route params in as a promise.
type Context = { params: Promise<{ id: string }> };

/** Full replacement, not a partial patch — see `quickAddSchema`. */
export async function PUT(request: Request, { params }: Context) {
  const denied = await requireOwnerForApi();
  if (denied) return denied;

  const id = parseIdParam((await params).id);
  if (id === null) return badRequest("Invalid quick add id");

  const body = await request.json().catch(() => null);
  const parsed = quickAddSchema.safeParse(body);
  if (!parsed.success) {
    return badRequest(parsed.error.issues[0]?.message ?? "Invalid input");
  }

  try {
    const source = await getDataSource();
    const quickAdd = await source.updateQuickAdd(id, parsed.data);
    invalidateQuickAdds();
    return NextResponse.json(quickAdd);
  } catch (error) {
    return errorResponse(error, "Failed to update quick add");
  }
}

export async function DELETE(_request: Request, { params }: Context) {
  const denied = await requireOwnerForApi();
  if (denied) return denied;

  const id = parseIdParam((await params).id);
  if (id === null) return badRequest("Invalid quick add id");

  try {
    const source = await getDataSource();
    // No delete guard: nothing references a preset, so removing one can't
    // touch the ledger.
    await source.deleteQuickAdd(id);
    invalidateQuickAdds();
    return NextResponse.json({ ok: true, id });
  } catch (error) {
    return errorResponse(error, "Failed to delete quick add");
  }
}
