import "server-only";

import { randomUUID } from "node:crypto";

import { Resend } from "resend";

/**
 * The one place mail leaves this app.
 *
 * **Sending is never fatal and never throws.** Both callers have already done
 * the thing the email is about — the subscription runner has written its
 * receipts, and a report never writes anything at all — so a Resend outage must
 * not roll back, retry, or surface as a failed request. Everything funnels into
 * a try/catch that logs and returns a result the caller may ignore.
 */

export interface SendResult {
  sent: boolean;
  /** Why it didn't send. Present only when `sent` is false. */
  reason?: string;
}

/** Sender for both email types. */
function resolveFrom(): string | undefined {
  return process.env.SUBSCRIPTION_EMAIL_FROM;
}

/** Recipient for subscription-run notifications. */
export function subscriptionRecipient(): string | undefined {
  return process.env.SUBSCRIPTION_EMAIL_TO;
}

/**
 * Recipient for spending reports.
 *
 * Falls back to the subscription address so this feature needs nothing new
 * configured in Vercel to work, while leaving the one plausible divergence —
 * routing reports somewhere else — available without a code change.
 */
export function reportRecipient(): string | undefined {
  return process.env.REPORT_EMAIL_TO || process.env.SUBSCRIPTION_EMAIL_TO;
}

export async function sendEmail({
  to,
  subject,
  html,
  text,
}: {
  to: string | undefined;
  subject: string;
  html: string;
  /** Plain-text alternative. Improves deliverability and is the accessible fallback. */
  text: string;
}): Promise<SendResult> {
  try {
    const apiKey = process.env.RESEND_API_KEY;
    const from = resolveFrom();
    if (!apiKey || !to || !from) {
      // Unset config is "off", not an error — the same direction every other
      // env-var gate in this app fails.
      const reason =
        "Email not configured (RESEND_API_KEY / SUBSCRIPTION_EMAIL_FROM / recipient)";
      console.warn(`[email] ${reason}; skipping send of "${subject}".`);
      return { sent: false, reason };
    }

    const resend = new Resend(apiKey);
    const { error } = await resend.emails.send({
      from,
      to,
      subject,
      html,
      text,
      headers: {
        /**
         * **Stops Gmail threading these together**, which is not cosmetic.
         *
         * Every report of a given kind has a near-identical subject and a lot
         * of repeated structure, so Gmail groups them into one conversation and
         * then hides the parts it decides are quoted from the previous message
         * behind a "..." expander. The effect is that whole sections — "What to
         * expect", say — are collapsed by default and look missing. Resending
         * to check a change makes it worse each time.
         *
         * A unique reference id per message is the documented way to opt out of
         * that grouping. Random rather than derived from the report's period or
         * month, because the case that has to work is sending the *same* report
         * twice in a row.
         */
        "X-Entity-Ref-ID": randomUUID(),
      },
    });
    if (error) {
      console.error("[email] Resend rejected the message:", error);
      return { sent: false, reason: error.message ?? "Resend rejected the message" };
    }
    return { sent: true };
  } catch (error) {
    // Swallowed on purpose — see the module docblock.
    console.error("[email] Failed to send:", error);
    return {
      sent: false,
      reason: error instanceof Error ? error.message : "Unknown send failure",
    };
  }
}
