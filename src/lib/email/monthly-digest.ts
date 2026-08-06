/**
 * The monthly digest email (ARCHITECTURE.md).
 *
 * Renders a `MonthlyDigest` — the same object `/reports/monthly` renders on
 * screen. Nothing here computes a figure. If a number needs deriving it belongs
 * in `src/lib/monthly-digest.ts` where both surfaces can reach it, which is why
 * the label helpers (`bigSpenderReasonLabel`, `changeDriverLabel`,
 * `changeComparisonLabel`, `formatMonthAbbr`) are imported from there rather
 * than written twice.
 *
 * Same Gmail constraints as every other template — inline styles, table layout,
 * no media queries, colour and background always set together. See `layout.ts`.
 *
 * **Three deliberate departures from `spending-report.ts`'s density**, all of
 * them because a monthly digest is read on a phone and is roughly three times
 * the length of a weekly report:
 *
 * 1. **A step larger throughout** (15/14/13 against 14/13/12). At the weekly
 *    report's scale this much content reads as a wall.
 * 2. **Every row is separated by a rule, not by whitespace alone.** Rows here
 *    carry two lines of text, so 6px of padding left no way to see which hint
 *    belonged to which label.
 * 3. **Explanatory text is a tinted callout, not just smaller type.** Size
 *    alone made the long notes read as data the reader was failing to parse.
 *    The callout sets colour *and* background together, which is the rule
 *    `layout.ts` enforces against Gmail's dark-mode inversion.
 */

import { formatCurrency } from "@/lib/format";
import {
  baselineLabel,
  bigSpenderReasonLabel,
  changeComparisonLabel,
  changeDriverLabel,
  digestTitle,
  formatCompact as compact,
  formatMonthAbbr,
  formatMonthLong,
  type BigSpenderRow,
  type CategoryChangeRow,
  type MonthlyDigest,
} from "@/lib/monthly-digest";
import { formatLongDate } from "@/lib/reports";

import {
  EMAIL_COLORS as C,
  EMAIL_FONT,
  barHtml,
  emailShell,
  escapeHtml,
} from "./layout";
import { reportRecipient, sendEmail, type SendResult } from "./send";

const base = `font-family:${EMAIL_FONT};background-color:${C.cardBg};`;
const bodyText = `${base}font-size:15px;line-height:1.5;color:${C.text};`;
const mutedText = `${base}font-size:14px;line-height:1.5;color:${C.muted};`;
/**
 * Row-level descriptions. Italic so it can't be mistaken for a second value.
 *
 * Sets `font-weight` explicitly because hints are nested inside labels that are
 * now bold, and would otherwise inherit the weight and stop reading as an aside.
 */
const hintText = `${base}font-size:13px;line-height:1.5;color:${C.faint};font-style:italic;font-weight:400;`;

/**
 * Vertical breathing room on a data row — double the weekly report's 6px.
 *
 * Rows here carry two or three lines (label, comparison, driver), so the gap
 * between rows has to beat the gap *within* one or the grouping reads wrong.
 *
 * This was briefly 20px. That was tuning against output where the padding was
 * being discarded before it rendered (`EMAIL_FONT`, ARCHITECTURE.md §6) — the
 * rows never got looser, so the number kept going up. 12px is the value this
 * was always meant to be.
 */
const ROW_PADDING = "12px";

/**
 * Row caps. **Renderer-only**, unlike `REPORT_MAX_CATEGORY_ROWS`, which the
 * model itself applies — nothing here changes a number, it only keeps the
 * message short enough to read and well under Gmail's ~102 KB clip. Every cap
 * that bites says so in the output.
 */
const MAX_BIG_SPENDER_ROWS = 12;
/** Per direction, so a month where everything rose still shows what fell. */
const MAX_MOVERS_PER_DIRECTION = 4;
/** Charts are compact but not free; the tail becomes one summary line. */
const MAX_CHART_CATEGORIES = 6;

/** Pixel height of a column chart. Fixed, because email ignores percentage heights. */
const CHART_HEIGHT = 36;

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

/** "$600 – $815", the p25–p75 band. */
function rangeLabel(low: number, high: number): string {
  return `${compact(low)} – ${compact(high)}`;
}

/**
 * The explanatory callout.
 *
 * A tinted block with an accent rule down its left edge, so a paragraph of
 * "here is how this was calculated" is visibly a different *kind* of thing from
 * the numbers above it. Background and colour are both set — Gmail's dark-mode
 * inversion flips text and leaves an explicit background, and the failure mode
 * is always white-on-white.
 *
 * **Always preceded by its own rule.** Margin alone was not enough separation:
 * the last row of a table ran straight into the paragraph describing it, so the
 * description read as one more row. Closing the table off first is what makes
 * it read as commentary on what came above rather than part of it.
 */
function noteHtml(inner: string): string {
  return `${dividerHtml()}<div style="font-family:${EMAIL_FONT};font-size:13px;line-height:1.55;color:${C.muted};background-color:${C.pageBg};border-left:3px solid ${C.accent};border-radius:0 6px 6px 0;padding:12px 14px;">${inner}</div>`;
}

/**
 * A separator as a **filled table cell**, not a CSS border.
 *
 * Borders on `<td>` are widely but not universally honoured, and the failure is
 * silent: the rows below simply run together with nothing to say a line was
 * meant to be there. A cell with a background colour and an explicit `height`
 * attribute renders everywhere, which is why this is the standard email rule.
 * 2px rather than 1px because a hairline on a high-density phone screen is
 * exactly the thing that disappeared here the first time.
 */
function dividerRow(): string {
  return `<tr><td colspan="2" height="2" style="height:2px;line-height:2px;font-size:2px;background-color:${C.rule};">&nbsp;</td></tr>`;
}

/** Rows with a visible rule between each — never a trailing one. */
function rowsHtml(rows: (string | false | undefined)[]): string {
  return rows.filter(Boolean).join(dividerRow());
}

/** A standalone rule between blocks that aren't table rows. Same reasoning as `dividerRow`. */
function dividerHtml(marginTop = "14px", marginBottom = "14px"): string {
  return `<div style="height:2px;line-height:2px;font-size:2px;background-color:${C.rule};margin:${marginTop} 0 ${marginBottom};">&nbsp;</div>`;
}

/**
 * A two-column data row: label (with optional hint) on the left, value right.
 *
 * `emphasis` marks a row as a **total rather than an item** — "Next month",
 * "Total". Those rows were previously identical to the ones they summed, which
 * left the reader to work out from the wording alone which was which.
 */
function dataRow({
  label,
  hint,
  value,
  emphasis = false,
}: {
  label: string;
  hint?: string;
  value: string;
  emphasis?: boolean;
}): string {
  const labelStyle = emphasis
    ? `${bodyText}font-weight:700;`
    : `${mutedText}font-weight:600;`;
  return `<tr>
      <td style="${labelStyle}padding:${ROW_PADDING} 12px ${ROW_PADDING} 0;">${escapeHtml(label)}${
        hint ? `<div style="${hintText}margin-top:4px;">${escapeHtml(hint)}</div>` : ""
      }</td>
      <td align="right" style="${bodyText}padding:${ROW_PADDING} 0;font-weight:700;white-space:nowrap;vertical-align:top;">${escapeHtml(value)}</td>
    </tr>`;
}

function tableHtml(rows: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;">${rows}</table>`;
}

/**
 * The digest's section wrapper — `layout.ts`'s `sectionHtml` with three changes,
 * which together are why this is its own function rather than three more
 * parameters on the shared one.
 *
 * 1. **A 3px divider between sections.** Once rows inside a section are
 *    separated by a 2px rule, a 1px section boundary inverts the hierarchy —
 *    the biggest division on the page would be its faintest line.
 * 2. **A 13px heading.** At 12px the section headings did not read as headings
 *    against 15px body text.
 *
 * The padding matches `sectionHtml`'s 20px. It was briefly 24px, from the same
 * mis-tuning as `ROW_PADDING` — see the note there.
 *
 * `layout.ts` keeps its role as what both templates genuinely share — the
 * shell, the escaping, the colour tokens, `barHtml`.
 */
function section(heading: string | null, inner: string): string {
  const headingHtml = heading
    ? `<div style="margin:0 0 14px;font-size:13px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:${C.muted};background-color:${C.cardBg};">${escapeHtml(heading)}</div>`
    : "";
  return [
    `<tr><td style="padding:20px;background-color:${C.cardBg};border-bottom:3px solid ${C.rule};">`,
    headingHtml,
    inner,
    `</td></tr>`,
  ].join("");
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
    trendSection(digest, options.categoryColors),
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
  return section(
    null,
    `<div style="${bodyText}font-size:17px;font-weight:700;">💸 Finance Tracker</div>
     <div style="${mutedText}margin-top:4px;">${escapeHtml(digestTitle(digest))} · ${digest.days} days</div>`,
  );
}

function headlineSection(digest: MonthlyDigest): string {
  const { net, received, allInSpent } = digest.net;

  return section(
    null,
    `<div style="${base}font-size:13px;line-height:1.4;color:${C.faint};font-weight:700;letter-spacing:0.08em;text-transform:uppercase;">Net for ${escapeHtml(formatMonthLong(digest.month))}</div>
     <div style="${base}font-size:36px;line-height:1.15;font-weight:700;color:${netColor(net)};margin-top:8px;">${escapeHtml(formatCurrency(net))}</div>
     <div style="${mutedText}margin-top:6px;">${escapeHtml(`${formatCurrency(received)} in · ${formatCurrency(allInSpent)} out`)}</div>
     ${dividerHtml("16px", "0")}
     <div style="background-color:${C.cardBg};">
       ${tableHtml(
         rowsHtml([
           dataRow({
             label: "Habitual spend",
             hint: `${digest.habitual.receiptCount} receipt${digest.habitual.receiptCount === 1 ? "" : "s"} — the part you control`,
             value: formatCurrency(digest.habitual.spent),
           }),
           dataRow({
             label: "Rent, school, travel",
             hint: "Listed below; held out of every average",
             value: formatCurrency(digest.excluded.spent),
           }),
           dataRow({
             label: "All-in spend",
             hint: "Everything, before income",
             value: formatCurrency(allInSpent),
           }),
           dataRow({
             label: "Saved on discounts",
             hint: `${formatCurrency(digest.savings.yearToDate)} so far this year`,
             value: formatCurrency(digest.savings.month),
           }),
         ]),
       )}
     </div>`,
  );
}

function bigSpenderSection(digest: MonthlyDigest): string {
  const { oneOffs } = digest;

  const note =
    oneOffs.months === 0
      ? ""
      : noteHtml(
          `Purchases like these in habitual categories — not rent, school, travel or subscriptions — are left out of <strong style="background-color:${C.pageBg};color:${C.text};">What to expect</strong>, because a car repair can't be predicted, only budgeted for.<br><br>Over the ${
            oneOffs.months === 1 ? "month" : `${oneOffs.months} months`
          } before this one there were <strong style="background-color:${C.pageBg};color:${C.text};">${oneOffs.count}</strong> of them totalling <strong style="background-color:${C.pageBg};color:${C.text};">${escapeHtml(formatCurrency(oneOffs.total))}</strong> — about <strong style="background-color:${C.pageBg};color:${C.text};">${escapeHtml(formatCurrency(oneOffs.perMonth))} a month</strong> worth setting aside.`,
        );

  if (digest.bigSpenders.length === 0) {
    return section(
      "Big spenders",
      `<div style="${mutedText}">Nothing unusually large this month.</div>${note}`,
    );
  }

  const shown = digest.bigSpenders.slice(0, MAX_BIG_SPENDER_ROWS);
  const hidden = digest.bigSpenders.length - shown.length;

  const row = (r: BigSpenderRow) => {
    // "outside habitual" is load-bearing: without it the same dollars read as
    // if they were inside the habitual figure two sections up.
    const tags = [
      bigSpenderReasonLabel(r),
      ...(r.inHabitual ? [] : ["outside habitual"]),
      ...(r.recurring ? ["recurring"] : []),
    ].join(" · ");
    return `<tr>
        <td style="${bodyText}padding:${ROW_PADDING} 12px ${ROW_PADDING} 0;font-weight:600;">${escapeHtml(r.store)}
          <div style="${hintText}margin-top:4px;">${escapeHtml(`${r.category} · ${tags}`)}</div>
        </td>
        <td align="right" style="${bodyText}padding:${ROW_PADDING} 0;font-weight:700;white-space:nowrap;vertical-align:top;">${escapeHtml(formatCurrency(r.amount))}</td>
      </tr>`;
  };

  const hiddenRow =
    hidden > 0
      ? `<tr><td colspan="2" style="${hintText}padding:${ROW_PADDING} 0;">+ ${hidden} more over the threshold</td></tr>`
      : undefined;

  return section(
    "Big spenders",
    `${tableHtml(rowsHtml([...shown.map(row), hiddenRow]))}${note}`,
  );
}

/**
 * A month-by-month column chart per category.
 *
 * **Replaces the numeric grid that used to be here.** Seven columns of currency
 * at a readable size do not fit a 600px email, and shrinking the type to make
 * them fit produced something nobody would read. A bar answers "is this month
 * high, and which way is it going" without parsing seven numbers; the two
 * figures that matter — this month and a typical month — are still written out.
 *
 * The full numeric grid is still on `/reports/monthly`, where it can scroll.
 *
 * **Bars are coloured table cells with pixel heights**, not images and not
 * percentages: email clients ignore percentage heights, and an image-based
 * chart is invisible to anyone with images off, which for many recipients is
 * always. Prior months use `baselineBar` — the neutral grey `layout.ts` defines
 * for exactly this, since the current month is the subject and the rest is the
 * backdrop it's read against.
 */
function trendSection(
  digest: MonthlyDigest,
  categoryColors: Record<string, string>,
): string {
  const { months, rows, otherRow } = digest.grid;
  if (rows.length === 0) {
    return section(
      "Where it goes, month by month",
      `<div style="${mutedText}">No habitual spending on the ledger yet.</div>`,
    );
  }

  // The projection's per-month figure for each category — the same number the
  // What-moved rows call "typical", so the three sections reconcile on sight.
  const typical = new Map(
    digest.projection.categories.map((c) => [c.category, c.perMonth]),
  );

  const shown = rows.slice(0, MAX_CHART_CATEGORIES);
  const tail = rows.slice(MAX_CHART_CATEGORIES);

  const block = (
    category: string,
    values: (number | null)[],
    color: string,
    first: boolean,
  ) => {
    const current = values[values.length - 1] ?? null;
    const typicalValue = typical.get(category);
    return `${first ? "" : dividerHtml()}<div style="background-color:${C.cardBg};">
        ${tableHtml(
          `<tr>
             <td style="${bodyText}padding:0 12px 8px 0;font-weight:600;">${escapeHtml(category)}</td>
             <td align="right" style="${bodyText}padding:0 0 8px;font-weight:700;white-space:nowrap;">${escapeHtml(compact(current))}</td>
           </tr>
           ${
             typicalValue === undefined
               ? ""
               : `<tr><td colspan="2" style="${hintText}padding:0 0 12px;">typical month ${escapeHtml(compact(typicalValue))}</td></tr>`
           }`,
        )}
        ${columnChartHtml(values, color)}
      </div>`;
  };

  const blocks = shown
    .map((row, i) =>
      block(
        row.category,
        row.values,
        categoryColors[row.category] ?? C.accentDeep,
        i === 0,
      ),
    )
    .join("");

  // Everything past the chart cap, plus the model's own roll-up, as one line —
  // stated rather than silently dropped. No count: `otherRow` already stands
  // for several categories, so adding it to `tail.length` would undercount, and
  // the number it stands for isn't carried on the row.
  const remainder = [...tail, ...(otherRow ? [otherRow] : [])];
  const remainderLine =
    remainder.length > 0
      ? `${dividerHtml()}<div style="${mutedText}">Everything else — ${escapeHtml(
          compact(
            remainder.reduce(
              (sum, row) => sum + (row.values[row.values.length - 1] ?? 0),
              0,
            ),
          ),
        )} this month</div>`
      : "";

  return section(
    "Where it goes, month by month",
    `${monthAxisHtml(months)}${blocks}${remainderLine}${noteHtml(
      `Each bar is one month, scaled to that category's own biggest month — so the shape is comparable within a row, not between rows. The last bar is ${escapeHtml(formatMonthAbbr(months[months.length - 1] ?? ""))}. A missing bar means the ledger doesn't reach that month, which is not the same as spending nothing.<br><br>Rent, school and travel aren't here; they're under Big spenders. The full table of figures is on the site.`,
    )}`,
  );
}

/** The shared month axis, drawn once above the first chart — all charts align. */
function monthAxisHtml(months: string[]): string {
  const cells = months
    .map((month, i) => {
      const isCurrent = i === months.length - 1;
      return `<td align="center" style="font-family:${EMAIL_FONT};font-size:12px;line-height:1.3;padding:0 2px 10px;background-color:${C.cardBg};color:${isCurrent ? C.text : C.faint};${isCurrent ? "font-weight:700;" : ""}">${escapeHtml(formatMonthAbbr(month))}</td>`;
    })
    .join("");
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;table-layout:fixed;"><tr>${cells}</tr></table>`;
}

function columnChartHtml(
  values: (number | null)[],
  currentColor: string,
): string {
  const max = Math.max(0, ...values.map((v) => v ?? 0));

  const cells = values
    .map((value, i) => {
      const isCurrent = i === values.length - 1;
      const cell = `valign="bottom" height="${CHART_HEIGHT}" style="padding:0 2px;background-color:${C.cardBg};font-size:0;line-height:0;"`;

      if (value === null) {
        // A hairline on the baseline, not an empty column — an absent bar and a
        // zero bar would otherwise look identical.
        return `<td ${cell}><div style="height:2px;background-color:${C.track};font-size:0;line-height:0;">&nbsp;</div></td>`;
      }

      // Floored at 3px so a real-but-tiny month is visible rather than reading
      // as no data, and clamped at 0 for the negative total a fully refunded
      // receipt can produce. Same reasoning as `barPercent` in `reports.ts`.
      const height =
        max > 0 && value > 0
          ? Math.max(3, Math.round((value / max) * CHART_HEIGHT))
          : 3;
      return `<td ${cell}><div style="height:${height}px;background-color:${
        isCurrent ? currentColor : C.baselineBar
      };border-radius:2px 2px 0 0;font-size:0;line-height:0;">&nbsp;</div></td>`;
    })
    .join("");

  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;table-layout:fixed;"><tr>${cells}</tr></table>`;
}

function projectionSection(digest: MonthlyDigest): string {
  const p = digest.projection;
  if (p.categories.length === 0) {
    return section(
      "What to expect",
      `<div style="${mutedText}">Not enough complete months on the ledger to project from yet.</div>`,
    );
  }

  const trendTag = (trend: "rising" | "falling" | null) =>
    trend === null ? "" : ` · ${trend}`;

  const categoryRows = p.categories.map((row) =>
    dataRow({
      label: row.category,
      hint: `typical ${rangeLabel(row.low, row.high)}${trendTag(row.trend)}`,
      value: compact(row.perMonth),
    }),
  );

  const rule =
    p.categories[0]?.rule === "trimmed-mean"
      ? "Trimmed mean — the highest and lowest month are dropped"
      : "Median — too few complete months to trim";
  const baseline = baselineLabel(digest);

  return section(
    "What to expect",
    `<div style="${base}font-size:13px;line-height:1.4;color:${C.faint};font-weight:700;letter-spacing:0.06em;text-transform:uppercase;margin-bottom:10px;">${escapeHtml(formatMonthLong(p.nextMonth))}</div>
     ${tableHtml(
       rowsHtml([
         ...categoryRows,
         dataRow({
           label: "Subscriptions",
           hint: "From the schedule — known, not estimated",
           value: compact(p.subscriptionsNextMonth),
         }),
         dataRow({
           label: "Next month",
           hint: `typical ${rangeLabel(p.nextMonthTotal.low, p.nextMonthTotal.high)}`,
           value: compact(p.nextMonthTotal.total),
           emphasis: true,
         }),
         dataRow({
           label: `Through ${formatMonthLong(p.horizonThrough)}`,
           hint: `${p.horizonMonths} months · typical ${rangeLabel(p.horizonTotal.low, p.horizonTotal.high)}`,
           value: compact(p.horizonTotal.total),
           emphasis: true,
         }),
       ]),
     )}
     ${noteHtml(
       `Habitual spend plus subscriptions only — <strong style="background-color:${C.pageBg};color:${C.text};">excludes rent, school and travel</strong>, which are paid ad hoc and have no schedule to project from. Income is never projected either.<br><br>${escapeHtml(rule)}${baseline ? `, over ${escapeHtml(baseline)}` : ""}. Ranges are the middle half of those months; the multi-month band widens as √n, since good and bad months partly cancel.`,
     )}`,
  );
}

function incomeSection(digest: MonthlyDigest): string {
  const { income } = digest;
  if (income.count === 0) {
    return section(
      "What came in",
      `<div style="${mutedText}">No disbursements recorded this month.</div>`,
    );
  }

  const rows = income.entities.map((entity) =>
    dataRow({
      label: entity.name,
      hint: `${entity.count} disbursement${entity.count === 1 ? "" : "s"}`,
      value: formatCurrency(entity.total),
    }),
  );

  return section(
    "What came in",
    `${tableHtml(
      rowsHtml([
        ...rows,
        dataRow({
          label: "Total",
          value: formatCurrency(income.total),
          emphasis: true,
        }),
      ]),
    )}
     ${noteHtml(
       "Refunds are excluded — they already came off the spending figures. Never projected forward: term-time hours differ too much from summer for an average to mean anything.",
     )}`,
  );
}

function topStoresSection(digest: MonthlyDigest): string {
  if (digest.topStores.length === 0) return "";
  const max = digest.topStores[0]?.total ?? 0;

  const rows = digest.topStores
    .map(
      (store, i) =>
        `${i === 0 ? "" : dividerHtml()}<div style="background-color:${C.cardBg};">
           ${tableHtml(
             `<tr>
                <td style="${bodyText}padding:0 12px 8px 0;font-weight:600;">${escapeHtml(store.name)}</td>
                <td align="right" style="${bodyText}padding:0 0 8px;font-weight:700;white-space:nowrap;">${escapeHtml(formatCurrency(store.total))}</td>
              </tr>
              <tr><td colspan="2" style="padding:0;">${barHtml(max > 0 ? (store.total / max) * 100 : 0, C.accent)}</td></tr>
              <tr><td colspan="2" style="${hintText}padding:6px 0 0;">${store.count} visit${store.count === 1 ? "" : "s"}</td></tr>`,
           )}
         </div>`,
    )
    .join("");

  return section(
    "Where the money went",
    `${rows}
     ${noteHtml("Habitual spend only — all-in would rank your landlord first every month.")}`,
  );
}

/**
 * What moved, both directions, in one section.
 *
 * There used to be a separate "quiet wins" list built from this same baseline;
 * it named the same categories a second time in a second phrasing, which is
 * most of why neither was readable. Splitting one ranked list by sign says the
 * same thing once.
 */
function moversSection(digest: MonthlyDigest): string {
  const up = digest.changes
    .filter((row) => row.deltaSpent > 0)
    .slice(0, MAX_MOVERS_PER_DIRECTION);
  const down = digest.changes
    .filter((row) => row.deltaSpent < 0)
    .slice(0, MAX_MOVERS_PER_DIRECTION);
  const eating = digest.eatingOut;

  if (up.length === 0 && down.length === 0 && !eating) return "";

  const group = (title: string, rows: CategoryChangeRow[], rising: boolean) => {
    if (rows.length === 0) return "";
    const color = rising ? C.up : C.down;
    return `<div style="background-color:${C.cardBg};">
        <div style="${base}font-size:16px;line-height:1.3;color:${color};font-weight:700;margin-bottom:12px;">${escapeHtml(title)}</div>
        ${tableHtml(
          rowsHtml(
            rows.map(
              (row) =>
                `<tr>
                  <td style="${bodyText}padding:${ROW_PADDING} 12px ${ROW_PADDING} 0;font-weight:600;">${escapeHtml(row.category)}
                    <div style="${hintText}margin-top:4px;">${escapeHtml(changeComparisonLabel(row))}</div>
                    <div style="${hintText}">${escapeHtml(changeDriverLabel(row))}</div>
                  </td>
                  <td align="right" style="${bodyText}padding:${ROW_PADDING} 0;font-weight:700;white-space:nowrap;vertical-align:top;color:${color};">${escapeHtml(`${rising ? "+" : "−"}${compact(Math.abs(row.deltaSpent))}`)}</td>
                </tr>`,
            ),
          ),
        )}
      </div>`;
  };

  const upBlock = group("Spent more", up, true);
  const downBlock = group("Spent less", down, false);

  const eatingBlock =
    eating && eating.stressedShare !== null
      ? `${dividerHtml()}<div style="${mutedText}">Eating out was ${Math.round(eating.stressedShare * 100)}% stressed, ${Math.round((1 - eating.stressedShare) * 100)}% social${
          eating.baselineStressedShare !== null
            ? ` — typically ${Math.round(eating.baselineStressedShare * 100)}% stressed`
            : ""
        }.<div style="${hintText}margin-top:4px;">${escapeHtml(`${formatCurrency(eating.stressed)} stressed · ${formatCurrency(eating.social)} social`)}</div></div>`
      : "";

  return section(
    "What moved",
    `${upBlock}${upBlock && downBlock ? dividerHtml() : ""}${downBlock}${eatingBlock}
     ${noteHtml(
       "Each row is your total for the month against what a typical month costs — the same per-month figure as What to expect. One-offs are removed from both sides, so a single big purchase doesn't read as a change in habit.",
     )}`,
  );
}

function footerSection(digest: MonthlyDigest, appUrl?: string): string {
  // 44px of height on the link — it is the only tap target in the email.
  const href = appUrl ? `${appUrl}/reports/monthly?month=${digest.month}` : "";
  const button = href
    ? `<a href="${escapeHtml(href)}" style="${base}display:inline-block;padding:14px 22px;font-size:15px;font-weight:600;color:#ffffff;background-color:${C.accentDeep};border-radius:8px;text-decoration:none;">Open this month</a>`
    : "";
  return section(
    null,
    `${button}
     <div style="${hintText}margin-top:${href ? "14px" : "0"};">Generated ${escapeHtml(formatLongDate(digest.generatedFor))} for ${escapeHtml(formatMonthLong(digest.month))}. Figures are net of refunds. Anything entered after this was sent is not counted.</div>`,
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
  }

  if (digest.oneOffs.months > 0) {
    lines.push(
      "",
      `  One-offs like these in habitual categories are left out of What to expect.`,
      `  Over the ${digest.oneOffs.months} months before this one there were ${digest.oneOffs.count},`,
      `  totalling ${formatCurrency(digest.oneOffs.total)} — about ${formatCurrency(digest.oneOffs.perMonth)} a month to set aside.`,
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

  const up = digest.changes
    .filter((row) => row.deltaSpent > 0)
    .slice(0, MAX_MOVERS_PER_DIRECTION);
  const down = digest.changes
    .filter((row) => row.deltaSpent < 0)
    .slice(0, MAX_MOVERS_PER_DIRECTION);

  if (up.length > 0 || down.length > 0) {
    lines.push("", "WHAT MOVED");
    const group = (title: string, rows: CategoryChangeRow[], sign: string) => {
      if (rows.length === 0) return;
      lines.push(`  ${title}:`);
      for (const row of rows) {
        lines.push(
          `    ${row.category}: ${sign}${compact(Math.abs(row.deltaSpent))} — ${changeComparisonLabel(row)}, ${changeDriverLabel(row)}`,
        );
      }
    };
    group("Spent more", up, "+");
    group("Spent less", down, "-");
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
