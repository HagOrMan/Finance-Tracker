import { NextResponse } from "next/server";

import { badRequest, errorResponse, parseIdParam } from "@/lib/api";
import { requireOwnerForApi } from "@/lib/auth-server";
import { chargeSubscriptionNow } from "@/lib/subscriptions-runner";

type Context = { params: Promise<{ id: string }> };

/**
 * Writes the single next scheduled charge for one subscription.
 *
 * Deliberately does not check whether that charge is due yet — the reason to
 * press the button is usually "it landed early and I want it recorded". The UI
 * states the date it will write, so nothing happens blind, and being early
 * desyncs nothing: the counter advances by one and every later date is still
 * derived from `start_date`.
 */
export async function POST(_request: Request, { params }: Context) {
  const denied = await requireOwnerForApi();
  if (denied) return denied;

  const id = parseIdParam((await params).id);
  if (id === null) return badRequest("Invalid subscription id");

  try {
    const result = await chargeSubscriptionNow(id);
    return NextResponse.json(result);
  } catch (error) {
    return errorResponse(error, "Failed to record the charge");
  }
}
