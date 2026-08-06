/**
 * The monthly digest email (ARCHITECTURE.md).
 *
 * Renders a `MonthlyDigest` — the same object `/reports/monthly` renders on
 * screen. Nothing here computes a figure. If a number needs deriving it belongs
 * in `src/lib/monthly-digest.ts` where both surfaces can reach it, which is why
 * the label helpers (`bigSpenderReasonLabel`, `changeDriverLabel`,
 * `formatMonthAbbr`) are imported from there rather than written twice.
 *
 * Same Gmail constraints as every other template — inline styles, table layout,
 * no media queries, colour and background always set together. See `layout.ts`.
 */

import { formatCurrency } from "@/lib/format";
import {
  baselineLabel,
  bigSpenderReasonLabel,
  changeDriverLabel,
  digestTitle,
  formatCompact as compact,
  formatMonthAbbr,
  formatMonthLong,
  type BigSpenderRow,
  type MonthlyDigest,
} from "@/lib/monthly-digest";
import { formatLongDate } from "@/lib/reports";

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
/** The grid is the one place that needs to fit 7 numeric columns in 600px. */
const gridText = `${base}font-size:11px;line-height:1.35;color:${C.text};`;

/**
 * Row caps. **Renderer-only**, unlike `REPORT_MAX_CATEGORY_ROWS`, which the
 * model itself applies — nothing here changes a number, it only stops Gmail
 * clipping the message at ~102 KB. Every cap that bites says so in the output.
 */
const MAX_BIG_SPENDER_ROWS = 12;
const MAX_CHANGE_ROWS = 6;
const MAX_QUIET_WINS = 4;

/**
 * Colour for a net figure.
 *
 * **Deliberately not `changeColor` from the weekly report.** There, up means
 * more spending and is therefore red. Here the number is money left over, so
 * positive is good — reusing the other mapping would print a surplus in red.
 */
function netColor(value: number): string {
  if (value > 0) return C.down;
  if (value < 0) return C.up;
  return C.muted;
}

/** A small square in the category's colour, matching the app and the weekly email. */
function swatch(color: string | undefined): string {
  if (!color) return "";
  return `<span style="display:inline-block;width:8px;height:8px;border-radius:2px;background-color:${color};">&nbsp;</span> `;
}

/** "$600 – $815", the p25–p75 band. */
function rangeLabel(low: number, high: number): string {
  return `${compact(low)} – ${compact(high)}`;
}

// ---------------------------------------------------------------------------
// Subject and preview
// ---------------------------------------------------------------------------

export function digestSubject(digest: MonthlyDigest): string {
  const month = formatMonthLong(digest.month);
  const { net } = digest.net;

  if (digest.net.allInSpent <= 0 && digest.net.received <= 0) {
    return `📊 ${month} — nothing recorded`;
  }

  // The net figure goes in the subject for the same reason the weekly report
  // puts the amount there: most months, reading the subject is the whole
  // interaction, and an email you don't have to open is a feature.
  const verdict =
    net >= 0
      ? `${formatCurrency(net)} left over`
      : `${formatCurrency(Math.abs(net))} out of pocket`;
  return `${net >= 0 ? "📈" : "📉"} ${month} — ${verdict}`;
}

function preheader(digest: MonthlyDigest): string {
  return [
    `${compact(digest.net.allInSpent)} out`,
    `${compact(digest.net.received)} in`,
    `${compact(digest.habitual.spent)} habitual`,
  ].join(" · ");
}

// ---------------------------------------------------------------------------
// HTML
// ---------------------------------------------------------------------------

export function buildDigestHtml(
  digest: MonthlyDigest,
  options: {
    /**
     * Category → hex over **every category in the ledger**, never just this
     * month's. See the call site in `monthly-digest-runner.ts` — narrowing it
     * silently recolours the digest relative to every other surface.
     */
    categoryColors: Record<string, string>;
    appUrl?: string;
  },
): string {
  const sections = [
    headerSection(digest),
    headlineSection(digest),
    bigSpenderSection(digest),
    gridSection(digest, options.categoryColors),
    projectionSection(digest),
    incomeSection(digest),
    topStoresSection(digest),
    moversSection(digest),
    footerSection(digest, options.appUrl),
  ]
    .filter(Boolean)
    .join("\n");

  return emailShell({
    title: digestSubject(digest),
    preheader: preheader(digest),
    sections,
  });
}

function headerSection(digest: MonthlyDigest): string {
  return sectionHtml(
    null,
    `<div style="${bodyText}font-size:16px;font-weight:700;">💸 Finance Tracker</div>
     <div style="${mutedText}margin-top:2px;">${escapeHtml(digestTitle(digest))} · ${digest.days} days</div>`,
  );
}

function headlineSection(digest: MonthlyDigest): string {
  const { net, received, allInSpent } = digest.net;

  const stat = (name: string, value: string, hint: string) =>
    `<tr>
       <td style="${mutedText}padding:6px 0;">${escapeHtml(name)}<div style="${faintText}">${escapeHtml(hint)}</div></td>
       <td align="right" style="${bodyText}padding:6px 0;font-weight:600;white-space:nowrap;">${escapeHtml(value)}</td>
     </tr>`;

  return sectionHtml(
    null,
    `<div style="${faintText}font-weight:700;letter-spacing:0.08em;text-transform:uppercase;">Net for ${escapeHtml(formatMonthLong(digest.month))}</div>
     <div style="${base}font-size:32px;line-height:1.15;font-weight:700;color:${netColor(net)};margin-top:6px;">${escapeHtml(formatCurrency(net))}</div>
     <div style="${faintText}margin-top:4px;">${escapeHtml(`${formatCurrency(received)} in · ${formatCurrency(allInSpent)} out`)}</div>
     <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;margin-top:14px;border-top:1px solid ${C.border};">
       ${stat("Habitual spend", formatCurrency(digest.habitual.spent), `${digest.habitual.receiptCount} receipt${digest.habitual.receiptCount === 1 ? "" : "s"} · what you control`)}
       ${stat("Rent, school, travel", formatCurrency(digest.excluded.spent), "Itemised below, held out of every average")}
       ${stat("All-in spend", formatCurrency(allInSpent), "Everything, before income")}
       ${stat("Saved on discounts", formatCurrency(digest.savings.month), `${formatCurrency(digest.savings.yearToDate)} so far this year`)}
     </table>`,
  );
}

function bigSpenderSection(digest: MonthlyDigest): string {
  if (digest.bigSpenders.length === 0) {
    return sectionHtml(
      "Big spenders",
      `<div style="${mutedText}">Nothing unusually large this month.</div>`,
    );
  }

  const shown = digest.bigSpenders.slice(0, MAX_BIG_SPENDER_ROWS);
  const hidden = digest.bigSpenders.slice(MAX_BIG_SPENDER_ROWS);

  const row = (r: BigSpenderRow) => {
    // "outside" is load-bearing: without it the same dollars read as if they
    // were inside the habitual figure two sections up.
    const tag = r.inHabitual ? "" : " · outside habitual";
    const recurring = r.recurring ? " · recurring" : "";
    return `<tr>
        <td style="${bodyText}padding:6px 0;">${escapeHtml(r.store)}
          <div style="${faintText}">${escapeHtml(`${r.category} · ${bigSpenderReasonLabel(r)}${tag}${recurring}`)}</div>
        </td>
        <td align="right" style="${bodyText}padding:6px 0;font-weight:600;white-space:nowrap;vertical-align:top;">${escapeHtml(formatCurrency(r.amount))}</td>
      </tr>`;
  };

  const hiddenRow =
    hidden.length > 0
      ? `<tr><td colspan="2" style="${faintText}padding:6px 0;">+ ${hidden.length} more over the threshold</td></tr>`
      : "";

  return sectionHtml(
    "Big spenders",
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;">
       ${shown.map(row).join("")}
       ${hiddenRow}
       <tr>
         <td style="${mutedText}padding:8px 0 0;border-top:1px solid ${C.border};">In habitual</td>
         <td align="right" style="${mutedText}padding:8px 0 0;border-top:1px solid ${C.border};white-space:nowrap;">${escapeHtml(compact(digest.bigSpenderTotals.habitual))}</td>
       </tr>
       <tr>
         <td style="${mutedText}padding:2px 0 0;">Rent, school, travel</td>
         <td align="right" style="${mutedText}padding:2px 0 0;white-space:nowrap;">${escapeHtml(compact(digest.bigSpenderTotals.excluded))}</td>
       </tr>
     </table>`,
  );
}

function gridSection(
  digest: MonthlyDigest,
  categoryColors: Record<string, string>,
): string {
  const { months, rows, otherRow, totals } = digest.grid;
  if (rows.length === 0) {
    return sectionHtml(
      "Where it goes, month by month",
      `<div style="${mutedText}">No habitual spending on the ledger yet.</div>`,
    );
  }

  const header = `<tr>
      <td style="${faintText}padding:0 4px 6px 0;">Category</td>
      ${months
        .map(
          (m, i) =>
            `<td align="right" style="${faintText}padding:0 0 6px 4px;white-space:nowrap;${i === months.length - 1 ? `color:${C.text};font-weight:700;` : ""}">${escapeHtml(formatMonthAbbr(m))}</td>`,
        )
        .join("")}
    </tr>`;

  const bodyRow = (
    label: string,
    values: (number | null)[],
    color?: string,
    bold = false,
  ) =>
    `<tr>
       <td style="${gridText}padding:4px 4px 4px 0;${bold ? "font-weight:700;" : ""}">${swatch(color)}${escapeHtml(label)}</td>
       ${values
         .map(
           (v, i) =>
             `<td align="right" style="${gridText}padding:4px 0 4px 4px;white-space:nowrap;${i === values.length - 1 ? "font-weight:700;" : ""}${bold ? "font-weight:700;" : ""}">${escapeHtml(compact(v))}</td>`,
         )
         .join("")}
     </tr>`;

  const bodyRows = rows
    .map((r) => bodyRow(r.category, r.values, categoryColors[r.category]))
    .join("");
  const other = otherRow ? bodyRow(otherRow.category, otherRow.values) : "";
  const totalRow = `<tr>
      <td style="${gridText}padding:8px 4px 0 0;font-weight:700;border-top:1px solid ${C.border};">Habitual</td>
      ${totals
        .map(
          (v) =>
            `<td align="right" style="${gridText}padding:8px 0 0 4px;font-weight:700;white-space:nowrap;border-top:1px solid ${C.border};">${escapeHtml(compact(v))}</td>`,
        )
        .join("")}
    </tr>`;

  return sectionHtml(
    "Where it goes, month by month",
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;">
       ${header}${bodyRows}${other}${totalRow}
     </table>
     <div style="${faintText}margin-top:8px;">A dash means the month predates the ledger. Rent, school and travel are not shown here — see Big spenders.</div>`,
  );
}

function projectionSection(digest: MonthlyDigest): string {
  const p = digest.projection;
  if (p.categories.length === 0) {
    return sectionHtml(
      "What to expect",
      `<div style="${mutedText}">Not enough complete months on the ledger to project from yet.</div>`,
    );
  }

  const trendTag = (trend: "rising" | "falling" | null) =>
    trend === null
      ? ""
      : `<span style="color:${trend === "rising" ? C.up : C.down};"> · ${trend}</span>`;

  const categoryRows = p.categories
    .map(
      (row) =>
        `<tr>
           <td style="${bodyText}padding:5px 0;">${escapeHtml(row.category)}
             <div style="${faintText}">typical ${escapeHtml(rangeLabel(row.low, row.high))}${trendTag(row.trend)}</div>
           </td>
           <td align="right" style="${bodyText}padding:5px 0;font-weight:600;white-space:nowrap;vertical-align:top;">${escapeHtml(compact(row.perMonth))}</td>
         </tr>`,
    )
    .join("");

  const rule =
    p.categories[0]?.rule === "trimmed-mean"
      ? "Trimmed mean — the highest and lowest month are dropped"
      : "Median — too few complete months to trim";
  const baseline = baselineLabel(digest);

  return sectionHtml(
    "What to expect",
    `<div style="${faintText}font-weight:700;letter-spacing:0.06em;text-transform:uppercase;">${escapeHtml(formatMonthLong(p.nextMonth))}</div>
     <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;margin-top:6px;">
       ${categoryRows}
       <tr>
         <td style="${mutedText}padding:6px 0 0;border-top:1px solid ${C.border};">Subscriptions<div style="${faintText}">From the schedule, not estimated</div></td>
         <td align="right" style="${mutedText}padding:6px 0 0;border-top:1px solid ${C.border};white-space:nowrap;vertical-align:top;">${escapeHtml(compact(p.subscriptionsNextMonth))}</td>
       </tr>
       <tr>
         <td style="${bodyText}padding:6px 0 0;font-weight:700;">Next month</td>
         <td align="right" style="${bodyText}padding:6px 0 0;font-weight:700;white-space:nowrap;">${escapeHtml(compact(p.nextMonthTotal.total))}</td>
       </tr>
       <tr>
         <td style="${faintText}padding:0 0 8px;">typical ${escapeHtml(rangeLabel(p.nextMonthTotal.low, p.nextMonthTotal.high))}</td>
         <td></td>
       </tr>
       <tr>
         <td style="${bodyText}padding:8px 0 0;font-weight:700;border-top:1px solid ${C.border};">${escapeHtml(`Through ${formatMonthLong(p.horizonThrough)}`)}<div style="${faintText}">${p.horizonMonths} months · typical ${escapeHtml(rangeLabel(p.horizonTotal.low, p.horizonTotal.high))}</div></td>
         <td align="right" style="${bodyText}padding:8px 0 0;font-weight:700;white-space:nowrap;border-top:1px solid ${C.border};vertical-align:top;">${escapeHtml(compact(p.horizonTotal.total))}</td>
       </tr>
     </table>
     <div style="${mutedText}margin-top:10px;padding-top:10px;border-top:1px solid ${C.border};">Set aside about ${escapeHtml(compact(p.oneOffBuffer))} a month for one-offs.<div style="${faintText}">They are stripped from the figures above because they can't be forecast — which is not the same as not happening.</div></div>
     <div style="${faintText}margin-top:8px;">Habitual + subscriptions only — excludes rent, school and travel. ${escapeHtml(rule)}${baseline ? `, over ${escapeHtml(baseline)}` : ""}. Ranges are the middle half of those months; the multi-month band widens as √n, since good and bad months partly cancel.</div>`,
  );
}

function incomeSection(digest: MonthlyDigest): string {
  const { income } = digest;
  if (income.count === 0) {
    return sectionHtml(
      "What came in",
      `<div style="${mutedText}">No disbursements recorded this month.</div>`,
    );
  }

  const rows = income.entities
    .map(
      (e) =>
        `<tr>
           <td style="${bodyText}padding:5px 0;">${escapeHtml(e.name)}<div style="${faintText}">${e.count} disbursement${e.count === 1 ? "" : "s"}</div></td>
           <td align="right" style="${bodyText}padding:5px 0;font-weight:600;white-space:nowrap;vertical-align:top;">${escapeHtml(formatCurrency(e.total))}</td>
         </tr>`,
    )
    .join("");

  return sectionHtml(
    "What came in",
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;">
       ${rows}
       <tr>
         <td style="${bodyText}padding:8px 0 0;font-weight:700;border-top:1px solid ${C.border};">Total</td>
         <td align="right" style="${bodyText}padding:8px 0 0;font-weight:700;white-space:nowrap;border-top:1px solid ${C.border};">${escapeHtml(formatCurrency(income.total))}</td>
       </tr>
     </table>
     <div style="${faintText}margin-top:8px;">Refunds are excluded — they already came off the spending figures. Never projected forward: term-time hours differ too much from summer for an average to mean anything.</div>`,
  );
}

function topStoresSection(digest: MonthlyDigest): string {
  if (digest.topStores.length === 0) return "";
  const max = digest.topStores[0]?.total ?? 0;

  const rows = digest.topStores
    .map(
      (s) =>
        `<tr><td style="padding:6px 0;background-color:${C.cardBg};">
           <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;">
             <tr>
               <td style="${bodyText}padding:0 0 3px;">${escapeHtml(s.name)}</td>
               <td align="right" style="${bodyText}padding:0 0 3px;font-weight:600;white-space:nowrap;">${escapeHtml(formatCurrency(s.total))}</td>
             </tr>
             <tr><td colspan="2" style="padding:0;">${barHtml(max > 0 ? (s.total / max) * 100 : 0, C.accent)}</td></tr>
             <tr><td colspan="2" style="${faintText}padding:2px 0 0;">${s.count} visit${s.count === 1 ? "" : "s"}</td></tr>
           </table>
         </td></tr>`,
    )
    .join("");

  return sectionHtml(
    "Where the money went",
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;">${rows}</table>
     <div style="${faintText}margin-top:6px;">Habitual spend only — all-in would rank your landlord first every month.</div>`,
  );
}

function moversSection(digest: MonthlyDigest): string {
  const changes = digest.changes.slice(0, MAX_CHANGE_ROWS);
  const wins = digest.quietWins.slice(0, MAX_QUIET_WINS);
  if (changes.length === 0 && wins.length === 0 && !digest.eatingOut) return "";

  const changeRows = changes
    .map((row) => {
      const up = row.deltaSpent >= 0;
      return `<tr>
          <td style="${bodyText}padding:5px 0;">${escapeHtml(row.category)}
            <div style="${faintText}">${escapeHtml(changeDriverLabel(row))} · ${escapeHtml(`${row.receiptCount} vs ${row.baselineCount.toFixed(1)} typical`)}</div>
          </td>
          <td align="right" style="${base}font-size:14px;line-height:1.45;padding:5px 0;font-weight:600;white-space:nowrap;vertical-align:top;color:${up ? C.up : C.down};">${escapeHtml(`${up ? "+" : "−"}${compact(Math.abs(row.deltaSpent))}`)}</td>
        </tr>`;
    })
    .join("");

  const changeBlock =
    changes.length > 0
      ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;">${changeRows}</table>
         <div style="${faintText}margin-top:6px;">Against a typical month, one-offs removed. Split into how often you went and what each visit cost.</div>`
      : "";

  const winsBlock =
    wins.length > 0
      ? `<div style="${mutedText}margin-top:${changes.length > 0 ? "12px" : "0"};padding-top:${changes.length > 0 ? "12px" : "0"};${changes.length > 0 ? `border-top:1px solid ${C.border};` : ""}"><span style="color:${C.down};font-weight:700;">Quiet wins</span> — ${escapeHtml(
          wins
            .map((w) => `${w.category} ${compact(Math.abs(w.delta))} under`)
            .join(", "),
        )}</div>`
      : "";

  const eating = digest.eatingOut;
  const eatingBlock =
    eating && eating.stressedShare !== null
      ? `<div style="${mutedText}margin-top:12px;padding-top:12px;border-top:1px solid ${C.border};">Eating out was ${Math.round(eating.stressedShare * 100)}% stressed, ${Math.round((1 - eating.stressedShare) * 100)}% social${
          eating.baselineStressedShare !== null
            ? ` — typically ${Math.round(eating.baselineStressedShare * 100)}% stressed`
            : ""
        }.<div style="${faintText}">${escapeHtml(`${formatCurrency(eating.stressed)} stressed · ${formatCurrency(eating.social)} social`)}</div></div>`
      : "";

  return sectionHtml("What moved", `${changeBlock}${winsBlock}${eatingBlock}`);
}

function footerSection(digest: MonthlyDigest, appUrl?: string): string {
  // 44px of height on the link — it is the only tap target in the email.
  const href = appUrl ? `${appUrl}/reports/monthly?month=${digest.month}` : "";
  const button = href
    ? `<a href="${escapeHtml(href)}" style="${base}display:inline-block;padding:12px 20px;font-size:14px;font-weight:600;color:#ffffff;background-color:${C.accentDeep};border-radius:8px;text-decoration:none;">Open this month</a>`
    : "";
  return sectionHtml(
    null,
    `${button}
     <div style="${faintText}margin-top:${href ? "12px" : "0"};">Generated ${escapeHtml(formatLongDate(digest.generatedFor))} for ${escapeHtml(formatMonthLong(digest.month))}. Figures are net of refunds. Anything entered after this was sent is not counted.</div>`,
  );
}

// ---------------------------------------------------------------------------
// Plain text
// ---------------------------------------------------------------------------

export function buildDigestText(digest: MonthlyDigest): string {
  const p = digest.projection;
  const lines: string[] = [
    digestTitle(digest).toUpperCase(),
    "",
    `Net: ${formatCurrency(digest.net.net)}`,
    `  ${formatCurrency(digest.net.received)} in · ${formatCurrency(digest.net.allInSpent)} out`,
    `Habitual spend: ${formatCurrency(digest.habitual.spent)} (${digest.habitual.receiptCount} receipts)`,
    `Rent, school, travel: ${formatCurrency(digest.excluded.spent)}`,
    `Saved on discounts: ${formatCurrency(digest.savings.month)} (${formatCurrency(digest.savings.yearToDate)} YTD)`,
    "",
    "BIG SPENDERS",
  ];

  if (digest.bigSpenders.length === 0) {
    lines.push("  Nothing unusually large this month.");
  } else {
    for (const r of digest.bigSpenders.slice(0, MAX_BIG_SPENDER_ROWS)) {
      const tag = r.inHabitual ? "" : ", outside habitual";
      lines.push(
        `  ${r.store} — ${formatCurrency(r.amount)}  (${r.category}, ${bigSpenderReasonLabel(r)}${tag})`,
      );
    }
    const hidden = digest.bigSpenders.length - MAX_BIG_SPENDER_ROWS;
    if (hidden > 0) lines.push(`  + ${hidden} more over the threshold`);
    lines.push(
      `  In habitual: ${formatCurrency(digest.bigSpenderTotals.habitual)}`,
      `  Rent, school, travel: ${formatCurrency(digest.bigSpenderTotals.excluded)}`,
    );
  }

  lines.push("", "WHERE IT GOES, MONTH BY MONTH");
  if (digest.grid.rows.length === 0) {
    lines.push("  No habitual spending on the ledger yet.");
  } else {
    lines.push(`  ${["", ...digest.grid.months.map(formatMonthAbbr)].join("\t")}`);
    for (const row of digest.grid.rows) {
      lines.push(`  ${row.category}\t${row.values.map(compact).join("\t")}`);
    }
    if (digest.grid.otherRow) {
      lines.push(
        `  ${digest.grid.otherRow.category}\t${digest.grid.otherRow.values.map(compact).join("\t")}`,
      );
    }
    lines.push(`  Habitual\t${digest.grid.totals.map(compact).join("\t")}`);
  }

  lines.push("", "WHAT TO EXPECT");
  if (p.categories.length === 0) {
    lines.push("  Not enough complete months to project from yet.");
  } else {
    lines.push(`  ${formatMonthLong(p.nextMonth)}:`);
    for (const row of p.categories) {
      lines.push(
        `    ${row.category}: ${compact(row.perMonth)}  (typical ${rangeLabel(row.low, row.high)}${row.trend ? `, ${row.trend}` : ""})`,
      );
    }
    lines.push(
      `    Subscriptions: ${compact(p.subscriptionsNextMonth)} (from the schedule)`,
      `    Next month total: ${compact(p.nextMonthTotal.total)} (typical ${rangeLabel(p.nextMonthTotal.low, p.nextMonthTotal.high)})`,
      `  Through ${formatMonthLong(p.horizonThrough)} (${p.horizonMonths} months): ${compact(p.horizonTotal.total)} (typical ${rangeLabel(p.horizonTotal.low, p.horizonTotal.high)})`,
      `  Buffer for one-offs: about ${compact(p.oneOffBuffer)} a month.`,
      "  Habitual + subscriptions only — excludes rent, school and travel.",
    );
  }

  lines.push("", "WHAT CAME IN");
  if (digest.income.count === 0) {
    lines.push("  No disbursements recorded this month.");
  } else {
    for (const e of digest.income.entities) {
      lines.push(
        `  ${e.name}: ${formatCurrency(e.total)} (${e.count} disbursement${e.count === 1 ? "" : "s"})`,
      );
    }
    lines.push(`  Total: ${formatCurrency(digest.income.total)}`);
  }

  if (digest.topStores.length > 0) {
    lines.push("", "WHERE THE MONEY WENT (habitual only)");
    for (const s of digest.topStores) {
      lines.push(
        `  ${s.name}: ${formatCurrency(s.total)} over ${s.count} visit${s.count === 1 ? "" : "s"}`,
      );
    }
  }

  const changes = digest.changes.slice(0, MAX_CHANGE_ROWS);
  if (changes.length > 0) {
    lines.push("", "WHAT MOVED");
    for (const row of changes) {
      const sign = row.deltaSpent >= 0 ? "+" : "-";
      lines.push(
        `  ${row.category}: ${sign}${compact(Math.abs(row.deltaSpent))} — ${changeDriverLabel(row)}`,
      );
    }
  }

  const wins = digest.quietWins.slice(0, MAX_QUIET_WINS);
  if (wins.length > 0) {
    lines.push(
      `  Quiet wins: ${wins.map((w) => `${w.category} ${compact(Math.abs(w.delta))} under`).join(", ")}`,
    );
  }

  if (digest.eatingOut && digest.eatingOut.stressedShare !== null) {
    lines.push(
      `  Eating out: ${Math.round(digest.eatingOut.stressedShare * 100)}% stressed, ${formatCurrency(digest.eatingOut.stressed)} vs ${formatCurrency(digest.eatingOut.social)} social`,
    );
  }

  lines.push(
    "",
    `Generated ${formatLongDate(digest.generatedFor)} for ${formatMonthLong(digest.month)}. Figures are net of refunds.`,
  );
  return lines.join("\n");
}

// ---------------------------------------------------------------------------

export async function sendMonthlyDigestEmail(
  digest: MonthlyDigest,
  options: { categoryColors: Record<string, string>; appUrl?: string },
): Promise<SendResult & { subject: string }> {
  const subject = digestSubject(digest);
  const result = await sendEmail({
    to: reportRecipient(),
    subject,
    html: buildDigestHtml(digest, options),
    text: buildDigestText(digest),
  });
  return { ...result, subject };
}
