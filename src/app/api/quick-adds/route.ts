import { NextResponse } from "next/server";

import { badRequest, errorResponse, wantsFreshData } from "@/lib/api";
import { requireOwnerForApi } from "@/lib/auth-server";
import { invalidateQuickAdds, loadQuickAddsCached } from "@/lib/data/cache";
import { getDataSource } from "@/lib/data/source";
import { quickAddSchema } from "@/lib/data/schemas";

export async function GET(request: Request) {
  const denied = await requireOwnerForApi();
  if (denied) return denied;

  try {
    const data = await loadQuickAddsCached({ fresh: wantsFreshData(request) });
    return NextResponse.json(data);
  } catch (error) {
    return errorResponse(error, "Failed to load quick adds");
  }
}

export async function POST(request: Request) {
  const denied = await requireOwnerForApi();
  if (denied) return denied;

  const body = await request.json().catch(() => null);
  const parsed = quickAddSchema.safeParse(body);
  if (!parsed.success) {
    return badRequest(parsed.error.issues[0]?.message ?? "Invalid input");
  }

  try {
    const source = await getDataSource();
    const quickAdd = await source.insertQuickAdd(parsed.data);
    invalidateQuickAdds();
    return NextResponse.json(quickAdd, { status: 201 });
  } catch (error) {
    return errorResponse(error, "Failed to add quick add");
  }
}
