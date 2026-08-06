/**
 * Subscription-run notifications (ARCHITECTURE.md).
 *
 * Moved here from `src/lib/email.ts` when reports arrived and the module became
 * a directory (ARCHITECTURE.md). The content and wording are unchanged; what is
 * new is that it now renders inside the shared `emailShell`, so both email types
 * get the same Gmail-safe chrome instead of this one shipping a bare fragment.
 *
 * Imported only by the two run routes, never by the runner itself, so the write
 * path has no dependency on the notification path at all.
 */

import type { SubscriptionRunResult } from "@/lib/subscriptions";
import { formatCurrency } from "@/lib/format";

import {
  EMAIL_COLORS as C,
  EMAIL_FONT,
  emailShell,
  escapeHtml,
  sectionHtml,
} from "./layout";
import { sendEmail, subscriptionRecipient, type SendResult } from "./send";

/**
 * Send only when something happened.
 *
 * A daily "0 charges" email trains you to ignore the one that matters, so a
 * clean no-op run is silent. `skipped` alone doesn't count — a skip means the
 * charge was already on the ledger, which is the system working.
 *
 * Note the weekly spending report deliberately takes the *opposite* rule
 * (ARCHITECTURE.md): it sends every Saturday regardless, because a silent
 * Saturday must be readable as "the cron is broken".
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

function subjectFor(result: SubscriptionRunResult): string {
  if (result.failed.length > 0) return "⚠️ Subscription charge failed";
  if (result.inserted.length > 0) return successSubject(result);
  return "⚠️ Subscription run hit the charge cap";
}

const body = `font-family:${EMAIL_FONT};font-size:14px;line-height:1.5;color:${C.text};background-color:${C.cardBg};`;
const note = `font-family:${EMAIL_FONT};font-size:13px;line-height:1.5;color:${C.muted};background-color:${C.cardBg};`;

function buildHtml(result: SubscriptionRunResult): string {
  const sections: string[] = [];

  sections.push(
    sectionHtml(
      null,
      `<div style="${body}font-size:16px;font-weight:600;">💸 Subscription charges</div>
       <div style="${note}margin-top:4px;">Run for ${escapeHtml(result.today)}.</div>`,
    ),
  );

  if (result.inserted.length > 0) {
    const total = result.inserted.reduce((sum, c) => sum + c.price, 0);
    const rows = result.inserted
      .map(
        (c) =>
          `<tr>
             <td style="${body}padding:6px 0;border-bottom:1px solid ${C.rule};">${escapeHtml(c.date)}</td>
             <td style="${body}padding:6px 0;border-bottom:1px solid ${C.rule};">${escapeHtml(c.name)}</td>
             <td align="right" style="${body}padding:6px 0;border-bottom:1px solid ${C.rule};">${formatCurrency(c.price)}</td>
           </tr>`,
      )
      .join("");
    sections.push(
      sectionHtml(
        "Charges recorded",
        `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;">
           <tr>
             <th align="left" style="${note}padding:0 0 6px;border-bottom:1px solid ${C.rule};">Date</th>
             <th align="left" style="${note}padding:0 0 6px;border-bottom:1px solid ${C.rule};">Subscription</th>
             <th align="right" style="${note}padding:0 0 6px;border-bottom:1px solid ${C.rule};">Price</th>
           </tr>
           ${rows}
           <tr>
             <td colspan="2" style="${body}padding:8px 0 0;font-weight:700;">Total</td>
             <td align="right" style="${body}padding:8px 0 0;font-weight:700;">${formatCurrency(total)}</td>
           </tr>
         </table>
         <div style="${note}margin-top:12px;">If an amount looks wrong, the subscription&rsquo;s price is out of date — fix the receipt on /manage and the price on /subscriptions.</div>`,
      ),
    );
  }

  if (result.failed.length > 0) {
    const items = result.failed
      .map(
        (f) =>
          `<li style="margin-bottom:8px;"><strong>${escapeHtml(f.name)}</strong> — ${escapeHtml(f.date)} · ${escapeHtml(f.store)} · ${escapeHtml(f.category)} · ${formatCurrency(f.price)}<br><span style="color:${C.up};">${escapeHtml(f.error)}</span></li>`,
      )
      .join("");
    sections.push(
      sectionHtml(
        "Failed",
        `<div style="${note}margin-bottom:8px;">These will be retried automatically on the next run. Nothing is lost.</div>
         <ul style="${body}margin:0;padding-left:20px;">${items}</ul>`,
      ),
    );
  }

  if (result.capped.length > 0) {
    const items = result.capped
      .map((c) => `<li>${escapeHtml(c.name)}</li>`)
      .join("");
    sections.push(
      sectionHtml(
        "Capped",
        `<div style="${note}margin-bottom:8px;">These hit the per-run charge cap, which usually means a mistyped start date. The remainder will trickle in on subsequent runs — check the start date before that happens.</div>
         <ul style="${body}margin:0;padding-left:20px;">${items}</ul>`,
      ),
    );
  }

  return emailShell({
    title: subjectFor(result),
    preheader: preheaderFor(result),
    sections: sections.join("\n"),
  });
}

function preheaderFor(result: SubscriptionRunResult): string {
  const parts: string[] = [];
  if (result.inserted.length > 0) {
    const total = result.inserted.reduce((sum, c) => sum + c.price, 0);
    parts.push(`${result.inserted.length} recorded · ${formatCurrency(total)}`);
  }
  if (result.failed.length > 0) parts.push(`${result.failed.length} failed`);
  if (result.capped.length > 0) parts.push(`${result.capped.length} capped`);
  return parts.join(" · ") || `Run for ${result.today}`;
}

function buildText(result: SubscriptionRunResult): string {
  const lines: string[] = [`Subscription charges — run for ${result.today}`, ""];

  if (result.inserted.length > 0) {
    const total = result.inserted.reduce((sum, c) => sum + c.price, 0);
    lines.push("CHARGES RECORDED");
    for (const c of result.inserted) {
      lines.push(`  ${c.date}  ${c.name}  ${formatCurrency(c.price)}`);
    }
    lines.push(`  Total: ${formatCurrency(total)}`, "");
  }

  if (result.failed.length > 0) {
    lines.push("FAILED (retried automatically on the next run)");
    for (const f of result.failed) {
      lines.push(
        `  ${f.name} — ${f.date} · ${f.store} · ${f.category} · ${formatCurrency(f.price)}`,
        `    ${f.error}`,
      );
    }
    lines.push("");
  }

  if (result.capped.length > 0) {
    lines.push("CAPPED (usually a mistyped start date)");
    for (const c of result.capped) lines.push(`  ${c.name}`);
    lines.push("");
  }

  return lines.join("\n");
}

export async function sendSubscriptionRunEmail(
  result: SubscriptionRunResult,
): Promise<SendResult> {
  if (!shouldSendRunEmail(result)) {
    return { sent: false, reason: "nothing-to-report" };
  }
  return sendEmail({
    to: subscriptionRecipient(),
    subject: subjectFor(result),
    html: buildHtml(result),
    text: buildText(result),
  });
}
