import "server-only";

import { Resend } from "resend";

import type { SubscriptionRunResult } from "@/lib/subscriptions";
import { formatCurrency } from "@/lib/format";

/**
 * Subscription-run notifications.
 *
 * **Email failure is never fatal.** The receipts are already written by the
 * time this is called; a Resend outage must not roll back or re-attempt a row
 * that is already correct. Everything here funnels into a try/catch that logs
 * and returns — the caller gets no error to react to, deliberately.
 *
 * Imported only by the two run routes, never by the runner itself, so the write
 * path has no dependency on the notification path at all.
 */

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Send only when something happened (FEATURES.md §6.8).
 *
 * A daily "0 charges" email trains you to ignore the one that matters, so a
 * clean no-op run is silent. `skipped` alone doesn't count — a skip means the
 * charge was already on the ledger, which is the system working.
 */
export function shouldSendRunEmail(result: SubscriptionRunResult): boolean {
  return (
    result.inserted.length > 0 ||
    result.failed.length > 0 ||
    result.capped.length > 0
  );
}

function successSubject(result: SubscriptionRunResult): string {
  const count = result.inserted.length;
  const total = result.inserted.reduce((sum, c) => sum + c.price, 0);
  return `💸 ${count} subscription charge${count === 1 ? "" : "s"} — ${formatCurrency(total)}`;
}

function buildHtml(result: SubscriptionRunResult): string {
  const parts: string[] = [];

  if (result.inserted.length > 0) {
    const total = result.inserted.reduce((sum, c) => sum + c.price, 0);
    parts.push(
      `<h2 style="margin:0 0 8px">Charges recorded</h2>`,
      `<table cellpadding="6" cellspacing="0" border="0" style="border-collapse:collapse;font-family:system-ui,sans-serif;font-size:14px">`,
      `<tr style="text-align:left;border-bottom:1px solid #ddd"><th>Date</th><th>Subscription</th><th style="text-align:right">Price</th></tr>`,
      ...result.inserted.map(
        (c) =>
          `<tr><td>${escapeHtml(c.date)}</td><td>${escapeHtml(c.name)}</td><td style="text-align:right">${formatCurrency(c.price)}</td></tr>`,
      ),
      `<tr style="border-top:1px solid #ddd;font-weight:600"><td colspan="2">Total</td><td style="text-align:right">${formatCurrency(total)}</td></tr>`,
      `</table>`,
      // Seeing the amount is how a price rise the subscription doesn't know
      // about yet gets caught.
      `<p style="font-size:13px;color:#555">If an amount looks wrong, the subscription's price is out of date — fix the receipt on /manage and the price on /subscriptions.</p>`,
    );
  }

  if (result.failed.length > 0) {
    parts.push(
      `<h2 style="margin:16px 0 8px">Failed</h2>`,
      // State the retry plainly — otherwise this reads as more urgent than it
      // is, and the full field set makes each one copy-pasteable into quick-add.
      `<p style="font-size:13px">These will be retried automatically on the next run. Nothing is lost.</p>`,
      `<ul style="font-family:system-ui,sans-serif;font-size:14px">`,
      ...result.failed.map(
        (f) =>
          `<li><strong>${escapeHtml(f.name)}</strong> — ${escapeHtml(f.date)} · ${escapeHtml(f.store)} · ${escapeHtml(f.category)} · ${formatCurrency(f.price)}<br><span style="color:#a00">${escapeHtml(f.error)}</span></li>`,
      ),
      `</ul>`,
    );
  }

  if (result.capped.length > 0) {
    parts.push(
      `<h2 style="margin:16px 0 8px">Capped</h2>`,
      `<p style="font-size:14px">These hit the per-run charge cap, which usually means a mistyped start date. The remainder will trickle in on subsequent runs — check the start date before that happens.</p>`,
      `<ul style="font-family:system-ui,sans-serif;font-size:14px">`,
      ...result.capped.map((c) => `<li>${escapeHtml(c.name)}</li>`),
      `</ul>`,
    );
  }

  parts.push(
    `<p style="font-size:12px;color:#888">Run for ${escapeHtml(result.today)}.</p>`,
  );
  return parts.join("\n");
}

export async function sendSubscriptionRunEmail(
  result: SubscriptionRunResult,
): Promise<void> {
  try {
    if (!shouldSendRunEmail(result)) return;

    const apiKey = process.env.RESEND_API_KEY;
    const to = process.env.SUBSCRIPTION_EMAIL_TO;
    const from = process.env.SUBSCRIPTION_EMAIL_FROM;
    if (!apiKey || !to || !from) {
      console.warn(
        "[subscriptions] Email not configured (RESEND_API_KEY / SUBSCRIPTION_EMAIL_TO / SUBSCRIPTION_EMAIL_FROM); skipping notification.",
      );
      return;
    }

    const subject =
      result.failed.length > 0
        ? "⚠️ Subscription charge failed"
        : result.inserted.length > 0
          ? successSubject(result)
          : "⚠️ Subscription run hit the charge cap";

    const resend = new Resend(apiKey);
    const { error } = await resend.emails.send({
      from,
      to,
      subject,
      html: buildHtml(result),
    });
    if (error) {
      console.error("[subscriptions] Resend rejected the email:", error);
    }
  } catch (error) {
    // Swallowed on purpose — see the module docblock.
    console.error("[subscriptions] Failed to send run email:", error);
  }
}
