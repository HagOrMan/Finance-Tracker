import { NextResponse } from "next/server";

import { badRequest, errorResponse, parseIdParam } from "@/lib/api";
import { requireOwnerForApi } from "@/lib/auth-server";
import { invalidateSubscriptions } from "@/lib/data/cache";
import { getDataSource } from "@/lib/data/source";
import { updateSubscriptionSchema } from "@/lib/data/schemas";

// Next 16 hands route params in as a promise.
type Context = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Context) {
  const denied = await requireOwnerForApi();
  if (denied) return denied;

  const id = parseIdParam((await params).id);
  if (id === null) return badRequest("Invalid subscription id");

  const body = await request.json().catch(() => null);
  const parsed = updateSubscriptionSchema.safeParse(body);
  if (!parsed.success) {
    return badRequest(parsed.error.issues[0]?.message ?? "Invalid input");
  }

  try {
    const source = await getDataSource();
    const subscription = await source.updateSubscription(id, parsed.data);
    invalidateSubscriptions();
    return NextResponse.json(subscription);
  } catch (error) {
    return errorResponse(error, "Failed to update subscription");
  }
}

export async function DELETE(_request: Request, { params }: Context) {
  const denied = await requireOwnerForApi();
  if (denied) return denied;

  const id = parseIdParam((await params).id);
  if (id === null) return badRequest("Invalid subscription id");

  try {
    const source = await getDataSource();

    // Same shape as the receipt delete guard (§3.4): checked up front so the
    // response can name what's blocking it. Generated receipts keep their
    // provenance — `on delete set null` would quietly discard the one thing
    // that says where those charges came from. Pause the subscription instead.
    const generated = await source.receiptsForSubscription(id);
    if (generated.length > 0) {
      return NextResponse.json(
        {
          error: `This subscription has generated ${generated.length} receipt${
            generated.length === 1 ? "" : "s"
          }. Pause it instead, or delete those receipts first.`,
          linked: generated,
        },
        { status: 409 },
      );
    }

    await source.deleteSubscription(id);
    invalidateSubscriptions();
    return NextResponse.json({ ok: true, id });
  } catch (error) {
    // Includes the check-then-delete race, mapped to the same 409 by the data
    // layer — just without a populated `linked` list.
    return errorResponse(error, "Failed to delete subscription");
  }
}
