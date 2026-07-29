import { NextResponse } from "next/server";

import { badRequest, errorResponse, wantsFreshData } from "@/lib/api";
import { requireOwnerForApi } from "@/lib/auth-server";
import {
  invalidateSubscriptions,
  loadSubscriptionsCached,
} from "@/lib/data/cache";
import { getDataSource } from "@/lib/data/source";
import { newSubscriptionSchema } from "@/lib/data/schemas";

export async function GET(request: Request) {
  const denied = await requireOwnerForApi();
  if (denied) return denied;

  try {
    const data = await loadSubscriptionsCached({
      fresh: wantsFreshData(request),
    });
    return NextResponse.json(data);
  } catch (error) {
    return errorResponse(error, "Failed to load subscriptions");
  }
}

export async function POST(request: Request) {
  const denied = await requireOwnerForApi();
  if (denied) return denied;

  const body = await request.json().catch(() => null);
  const parsed = newSubscriptionSchema.safeParse(body);
  if (!parsed.success) {
    return badRequest(parsed.error.issues[0]?.message ?? "Invalid input");
  }

  try {
    const source = await getDataSource();
    // `parsed.data`, never `body` — the same rule as every other write path.
    // Here it is what keeps `charges_generated` out of reach: the schedule is
    // derived from it, so an outside value would silently reschedule the series.
    const subscription = await source.insertSubscription(parsed.data);
    invalidateSubscriptions();
    return NextResponse.json(subscription, { status: 201 });
  } catch (error) {
    return errorResponse(error, "Failed to add subscription");
  }
}
