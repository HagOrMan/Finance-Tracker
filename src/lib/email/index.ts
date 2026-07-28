/**
 * `src/lib/email.ts` became this directory when spending reports arrived
 * (ARCHITECTURE.md) — one file could not hold two templates plus the shared
 * Gmail-safe chrome without becoming the place nobody wants to open.
 *
 * This barrel exists so the split cost zero import changes: both subscription
 * run routes still write `from "@/lib/email"`. It also re-exports `send.ts`,
 * which is `server-only`, so importing any of this from a client component is
 * still a build error rather than a leaked API key.
 */

export {
  sendSubscriptionRunEmail,
  shouldSendRunEmail,
} from "./subscription-run";

export {
  buildReportHtml,
  buildReportText,
  reportSubject,
  sendSpendingReportEmail,
} from "./spending-report";

export { reportRecipient, subscriptionRecipient, type SendResult } from "./send";
