/**
 * The spending report email (REPORTS.md §3).
 *
 * Renders a `SpendingReport` — the same object `/reports` renders on screen.
 * Nothing here computes a figure; if a number needs deriving, it belongs in
 * `src/lib/reports.ts` where both surfaces can reach it. The formatting helpers
 * (`formatChange`, `barPercent`, the date formatters) are imported from there
 * for exactly that reason: a number formatted two ways in two places is a bug
 * waiting for someone to compare a screenshot against an inbox.
 */

import { REPORT_PERIODS } from "@/lib/config";
import { formatCurrency } from "@/lib/format";
import {
  barPercent,
  changeDirection,
  comparisonLabel,
  formatChange,
  formatLongDate,
  formatShortDate,
  formatWindowRange,
  reportShortTitle,
  reportTitle,
  type SpendingReport,
} from "@/lib/reports";

import {
  EMAIL_COLORS as C,
  EMAIL_FONT,
  barHtml,
  emailShell,
  escapeHtml,
  sectionHtml,
} from "./layout";
import { reportRecipient, sendEmail, type SendResult } from "./send";

const base = `font-family:${EMAIL_FONT};background-color:${C.cardBg};`;
const bodyText = `${base}font-size:14px;line-height:1.45;color:${C.text};`;
const mutedText = `${base}font-size:13px;line-height:1.45;color:${C.muted};`;
const faintText = `${base}font-size:12px;line-height:1.45;color:${C.faint};`;

/** Direction color. The glyph carries the meaning too — see `changeColor`'s note. */
function changeColor(change: number | null): string {
  const direction = changeDirection(change);
  if (direction === "up") return C.up;
  if (direction === "down") return C.down;
  return C.muted;
}

// ---------------------------------------------------------------------------
// Subject and preview
// ---------------------------------------------------------------------------

export function reportSubject(report: SpendingReport): string {
  const title = reportShortTitle(report);
  if (report.habitual.spent <= 0) {
    return `📊 ${title} — no habitual spending`;
  }

  const amount = formatCurrency(report.habitual.spent);
  const change = report.comparison.changeVsBaseline;
  const direction = changeDirection(change);

  // The amount and direction go in the subject deliberately: most weeks,
  // reading the subject is the whole interaction, and an email you don't have
  // to open is a feature.
  if (direction === "up" || direction === "down") {
    const pct = Math.round(Math.abs(change!) * 100);
    const word = direction === "up" ? "up" : "down";
    return `${direction === "up" ? "📈" : "📉"} ${title} — ${amount} habitual, ${word} ${pct}%`;
  }
  if (direction === "flat") {
    return `📊 ${title} — ${amount} habitual, unchanged`;
  }
  return `📊 ${title} — ${amount} habitual`;
}

function preheader(report: SpendingReport): string {
  const amount = formatCurrency(report.habitual.spent);
  const label = comparisonLabel(report);
  const change = report.comparison.changeVsBaseline;
  if (!label || change === null) return `${amount} habitual · ${formatWindowRange(report.window)}`;
  return `${amount} habitual · ${formatChange(change)} ${label}`;
}

// ---------------------------------------------------------------------------
// HTML
// ---------------------------------------------------------------------------

export function buildReportHtml(
  report: SpendingReport,
  options: {
    /**
     * Category → hex, built over **every category in the ledger** — never just
     * the ones in this window. See the note at the call site in
     * `reports-runner.ts`; passing the window's categories silently recolors
     * the email relative to the app.
     */
    categoryColors: Record<string, string>;
    appUrl?: string;
  },
): string {
  const sections = [
    headerSection(report),
    headlineSection(report),
    categorySection(report, options.categoryColors),
    comparisonSection(report),
    excludedSection(report),
    footerSection(report, options.appUrl),
  ]
    .filter(Boolean)
    .join("\n");

  return emailShell({
    title: reportSubject(report),
    preheader: preheader(report),
    sections,
  });
}

function headerSection(report: SpendingReport): string {
  return sectionHtml(
    null,
    `<div style="${bodyText}font-size:16px;font-weight:700;">💸 Finance Tracker</div>
     <div style="${mutedText}margin-top:2px;">${escapeHtml(reportTitle(report))}</div>`,
  );
}

function headlineSection(report: SpendingReport): string {
  const { habitual, comparison, received } = report;
  const label = comparisonLabel(report);
  const change = comparison.changeVsBaseline;

  const changeLine =
    label && change !== null && comparison.baselineAvg !== null
      ? `<div style="${base}font-size:14px;line-height:1.45;color:${changeColor(change)};margin-top:4px;font-weight:600;">${formatChange(change)} ${escapeHtml(label)} (${formatCurrency(comparison.baselineAvg)})</div>`
      : `<div style="${mutedText}margin-top:4px;">${
          comparison.usableBaselines === 0
            ? "Not enough history to compare yet."
            : "No baseline to compare against."
        }</div>`;

  const stat = (name: string, value: string, hint: string) =>
    `<tr>
       <td style="${mutedText}padding:6px 0;">${escapeHtml(name)}<div style="${faintText}">${escapeHtml(hint)}</div></td>
       <td align="right" style="${bodyText}padding:6px 0;font-weight:600;white-space:nowrap;">${value}</td>
     </tr>`;

  return sectionHtml(
    null,
    `<div style="${faintText}font-weight:700;letter-spacing:0.08em;text-transform:uppercase;">Habitual spend</div>
     <div style="${base}font-size:32px;line-height:1.15;font-weight:700;color:${C.text};margin-top:6px;">${formatCurrency(habitual.spent)}</div>
     ${changeLine}
     <div style="${faintText}margin-top:6px;">${habitual.receiptCount} receipt${habitual.receiptCount === 1 ? "" : "s"} · ${escapeHtml(formatWindowRange(report.window))}</div>
     <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;margin-top:14px;border-top:1px solid ${C.border};">
       ${stat("Saved on discounts", formatCurrency(habitual.saved), "What the discounts on these receipts were worth")}
       ${stat("Received", formatCurrency(received.total), `${received.count} disbursement${received.count === 1 ? "" : "s"} not linked to a receipt`)}
     </table>`,
  );
}

function categorySection(
  report: SpendingReport,
  colors: Record<string, string>,
): string {
  const { categories, hiddenCategories, spent } = report.habitual;
  if (categories.length === 0) {
    return sectionHtml(
      "Where it went",
      `<div style="${mutedText}">No receipts between ${escapeHtml(formatShortDate(report.window.start))} and ${escapeHtml(formatShortDate(report.window.end))}.</div>`,
    );
  }

  const max = categories[0]!.spent;
  const rows = categories
    .map((row) => {
      const color = colors[row.category] ?? C.accentDeep;
      const share = spent > 0 ? Math.round(row.shareOfHabitual * 100) : 0;
      const changeText =
        row.changeVsBaseline === null
          ? "no baseline"
          : `${formatChange(row.changeVsBaseline)} vs avg`;
      return `<tr>
          <td style="${bodyText}padding:10px 0 0;">${escapeHtml(row.category)}</td>
          <td align="right" style="${bodyText}padding:10px 0 0;font-weight:600;white-space:nowrap;">${formatCurrency(row.spent)}</td>
        </tr>
        <tr><td colspan="2" style="padding:5px 0 0;background-color:${C.cardBg};">${barHtml(barPercent(row.spent, max), color)}</td></tr>
        <tr><td colspan="2" style="${faintText}padding:4px 0 8px;">${share}% of habitual · <span style="color:${changeColor(row.changeVsBaseline)};">${escapeHtml(changeText)}</span></td></tr>`;
    })
    .join("");

  const hidden = hiddenCategories
    ? `<tr><td colspan="2" style="${mutedText}padding:8px 0 0;border-top:1px solid ${C.border};">${hiddenCategories.count} other categor${hiddenCategories.count === 1 ? "y" : "ies"} — ${formatCurrency(hiddenCategories.spent)}</td></tr>`
    : "";

  return sectionHtml(
    "Where it went",
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;">${rows}${hidden}</table>`,
  );
}

function comparisonSection(report: SpendingReport): string {
  const { comparison, habitual, period } = report;
  const spec = REPORT_PERIODS[period];

  if (comparison.usableBaselines === 0) {
    return sectionHtml(
      "Comparison",
      `<div style="${mutedText}">Not enough history yet — this is the first ${escapeHtml(spec.noun)} on the ledger, so there is nothing to compare against. It will fill in as the weeks accumulate.</div>`,
    );
  }

  const heading =
    spec.baselines === 1
      ? `Vs. the previous ${spec.noun}`
      : `Vs. the previous ${comparison.usableBaselines} ${spec.noun}s`;

  // Oldest first, so the list reads chronologically down to "this week".
  const ordered = [...comparison.baselines].reverse();
  const max = Math.max(
    habitual.spent,
    ...comparison.baselines.map((b) => b.spent ?? 0),
  );

  const row = (
    label: string,
    value: number | null,
    color: string,
    bold: boolean,
  ) =>
    `<tr>
       <td width="70" style="${faintText}padding:4px 8px 4px 0;white-space:nowrap;">${escapeHtml(label)}</td>
       <td style="padding:4px 0;background-color:${C.cardBg};">${
         value === null
           ? `<span style="${faintText}">no data</span>`
           : barHtml(barPercent(value, max), color)
       }</td>
       <td width="80" align="right" style="${bodyText}padding:4px 0 4px 8px;white-space:nowrap;${bold ? "font-weight:700;" : ""}">${
         value === null ? "—" : formatCurrency(value)
       }</td>
     </tr>`;

  const rows = ordered
    .map((b) => row(formatShortDate(b.window.start), b.spent, C.baselineBar, false))
    .join("");

  const average =
    comparison.baselineAvg === null
      ? ""
      : ` Average ${formatCurrency(comparison.baselineAvg)}.`;

  return sectionHtml(
    heading,
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;table-layout:fixed;">
       ${rows}
       ${row("This " + spec.noun, habitual.spent, C.accentDeep, true)}
     </table>
     <div style="${faintText}margin-top:10px;">Each bar is a ${spec.days}-day window starting on the date shown, habitual categories only.${escapeHtml(average)}</div>`,
  );
}

function excludedSection(report: SpendingReport): string {
  const { excluded, allInSpent } = report;
  if (excluded.categories.length === 0) return "";

  const rows = excluded.categories
    .map(
      (row) =>
        `<tr>
           <td style="${bodyText}padding:5px 0;">${escapeHtml(row.category)}</td>
           <td align="right" style="${bodyText}padding:5px 0;white-space:nowrap;">${formatCurrency(row.spent)}</td>
         </tr>`,
    )
    .join("");

  return sectionHtml(
    "Not compared",
    `<div style="${mutedText}margin:-4px 0 10px;">Real spending, held out of the figures above because it isn&rsquo;t habitual — it would drown out everything the comparison exists to show.</div>
     <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;">
       ${rows}
       <tr>
         <td style="${bodyText}padding:8px 0 0;border-top:1px solid ${C.border};font-weight:700;">All-in total</td>
         <td align="right" style="${bodyText}padding:8px 0 0;border-top:1px solid ${C.border};font-weight:700;white-space:nowrap;">${formatCurrency(allInSpent)}</td>
       </tr>
     </table>`,
  );
}

function footerSection(report: SpendingReport, appUrl?: string): string {
  // 44px of height on the link, because it's the only tap target in the email.
  const button = appUrl
    ? `<a href="${escapeHtml(appUrl)}" style="${base}display:inline-block;padding:12px 20px;font-size:14px;font-weight:600;color:#ffffff;background-color:${C.accentDeep};border-radius:8px;text-decoration:none;">Open Finance Tracker</a>`
    : "";
  return sectionHtml(
    null,
    `${button}
     <div style="${faintText}margin-top:${appUrl ? "12px" : "0"};">Generated ${escapeHtml(formatLongDate(report.generatedFor))} for ${escapeHtml(formatWindowRange(report.window))}. Figures are net of refunds.</div>`,
  );
}

// ---------------------------------------------------------------------------
// Plain text
// ---------------------------------------------------------------------------

export function buildReportText(report: SpendingReport): string {
  const spec = REPORT_PERIODS[report.period];
  const label = comparisonLabel(report);
  const lines: string[] = [
    reportTitle(report).toUpperCase(),
    "",
    `Habitual spend: ${formatCurrency(report.habitual.spent)}`,
  ];

  if (label && report.comparison.changeVsBaseline !== null) {
    lines.push(
      `  ${formatChange(report.comparison.changeVsBaseline)} ${label} (${formatCurrency(report.comparison.baselineAvg ?? 0)})`,
    );
  } else {
    lines.push("  No baseline to compare against.");
  }

  lines.push(
    `Saved on discounts: ${formatCurrency(report.habitual.saved)}`,
    `Received (unlinked disbursements): ${formatCurrency(report.received.total)}`,
    "",
    "WHERE IT WENT",
  );

  if (report.habitual.categories.length === 0) {
    lines.push("  (no receipts in this window)");
  } else {
    for (const row of report.habitual.categories) {
      const share = Math.round(row.shareOfHabitual * 100);
      const change =
        row.changeVsBaseline === null
          ? "no baseline"
          : `${formatChange(row.changeVsBaseline)} vs avg`;
      lines.push(
        `  ${row.category}: ${formatCurrency(row.spent)}  (${share}%, ${change})`,
      );
    }
    if (report.habitual.hiddenCategories) {
      lines.push(
        `  ${report.habitual.hiddenCategories.count} other categories: ${formatCurrency(report.habitual.hiddenCategories.spent)}`,
      );
    }
  }

  lines.push("", `VS. THE PREVIOUS ${spec.noun.toUpperCase()}S`);
  if (report.comparison.usableBaselines === 0) {
    lines.push("  Not enough history yet.");
  } else {
    for (const b of [...report.comparison.baselines].reverse()) {
      lines.push(
        `  ${formatShortDate(b.window.start)}: ${b.spent === null ? "no data" : formatCurrency(b.spent)}`,
      );
    }
    lines.push(`  This ${spec.noun}: ${formatCurrency(report.habitual.spent)}`);
  }

  if (report.excluded.categories.length > 0) {
    lines.push("", "NOT COMPARED");
    for (const row of report.excluded.categories) {
      lines.push(`  ${row.category}: ${formatCurrency(row.spent)}`);
    }
    lines.push(`  All-in total: ${formatCurrency(report.allInSpent)}`);
  }

  lines.push(
    "",
    `Generated ${formatLongDate(report.generatedFor)} for ${formatWindowRange(report.window)}. Figures are net of refunds.`,
  );
  return lines.join("\n");
}

// ---------------------------------------------------------------------------

export async function sendSpendingReportEmail(
  report: SpendingReport,
  options: { categoryColors: Record<string, string>; appUrl?: string },
): Promise<SendResult & { subject: string }> {
  const subject = reportSubject(report);
  const result = await sendEmail({
    to: reportRecipient(),
    subject,
    html: buildReportHtml(report, options),
    text: buildReportText(report),
  });
  return { ...result, subject };
}
