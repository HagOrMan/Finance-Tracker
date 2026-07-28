/**
 * Spending reports — the pure model (ARCHITECTURE.md).
 *
 * **A report is a lens.** It writes nothing, stores nothing, and owns no table.
 * Everything in this file is a pure function of `(rows, period, today)`, which
 * is what lets the same object drive the `/reports` page and the email without
 * either one being able to disagree with the other about a number.
 *
 * No I/O lives here — `src/lib/reports-runner.ts` loads the rows and calls in.
 * That separation is what makes the model checkable by hand against literal
 * arrays.
 */

import {
  COMPARISON_EXCLUDED_CATEGORIES,
  REPORT_MAX_CATEGORY_ROWS,
  REPORT_PERIODS,
} from "@/lib/config";
import type { Disbursement, MergedReceipt } from "@/lib/data/types";
import { addDaysISO } from "@/lib/dates";
import { nameGroupKey } from "@/lib/name-groups";
import { computeSavings } from "@/lib/savings";

export type ReportPeriod = keyof typeof REPORT_PERIODS;

export const REPORT_PERIOD_VALUES = Object.keys(
  REPORT_PERIODS,
) as ReportPeriod[];

export function isReportPeriod(value: unknown): value is ReportPeriod {
  return (
    typeof value === "string" &&
    Object.prototype.hasOwnProperty.call(REPORT_PERIODS, value)
  );
}

/**
 * Normalized match against the excluded list, because categories are free text
 * (`CLAUDE.md` — not a DB enum).
 *
 * `nameGroupKey` is the app's existing "these are the same name" rule, so
 * "Rent", " rent" and "RENT" all match and there is no second normalizer to
 * keep in sync. "Rent — parking" deliberately does *not* match: every other
 * page in the app treats that as a different category, and this one must agree.
 */
const EXCLUDED_KEYS = new Set(COMPARISON_EXCLUDED_CATEGORIES.map(nameGroupKey));

export function isExcludedCategory(category: string): boolean {
  return EXCLUDED_KEYS.has(nameGroupKey(category));
}

/** Inclusive on both ends, plain "YYYY-MM-DD". */
export interface ReportWindow {
  start: string;
  end: string;
}

export interface ReportCategoryRow {
  category: string;
  /** Net — `actual_price`, so refunds have already come off. */
  spent: number;
  receiptCount: number;
  /** 0..1 of this window's habitual spend. 0 when habitual spend is 0. */
  shareOfHabitual: number;
  /** Mean of this category across the usable baseline windows; null when none are. */
  baselineAvg: number | null;
  /** Fraction, e.g. 0.142. Null when `baselineAvg` is null or 0 — never NaN or Infinity. */
  changeVsBaseline: number | null;
}

export interface ReportBaselineWindow {
  window: ReportWindow;
  /**
   * Habitual spend in that window, or **null when the window predates the
   * ledger** — which is not the same claim as zero and must not be averaged in.
   */
  spent: number | null;
}

export interface SpendingReport {
  period: ReportPeriod;
  /** The "today" this was built against, so the email is self-describing. */
  generatedFor: string;
  window: ReportWindow;

  habitual: {
    spent: number;
    saved: number;
    receiptCount: number;
    /** Desc by spent, capped at `REPORT_MAX_CATEGORY_ROWS`. */
    categories: ReportCategoryRow[];
    /** The tail rolled up by that cap, or null when nothing was rolled up. */
    hiddenCategories: { count: number; spent: number } | null;
  };

  excluded: {
    spent: number;
    saved: number;
    categories: { category: string; spent: number; receiptCount: number }[];
  };

  /** habitual.spent + excluded.spent. */
  allInSpent: number;

  /**
   * Disbursements in the window **not** linked to a receipt.
   *
   * A linked disbursement is a refund, and a refund has already reduced
   * `actual_price` — counting it here as well would report the same dollar
   * twice, once as a reduction and once as income.
   */
  received: { total: number; count: number };

  comparison: {
    /** Most recent first. */
    baselines: ReportBaselineWindow[];
    /** Mean of the non-null baselines; null when none are usable. */
    baselineAvg: number | null;
    /** Fraction. Null when `baselineAvg` is null or 0. */
    changeVsBaseline: number | null;
    usableBaselines: number;
    requestedBaselines: number;
  };
}

// ---------------------------------------------------------------------------
// Windows
// ---------------------------------------------------------------------------

/**
 * The current window for a period: the `days` days **ending yesterday**.
 *
 * Yesterday, not today, because today is still being spent — a report that
 * includes a partial day always reads low, and the reader has no way to know
 * by how much.
 */
export function currentWindow(
  period: ReportPeriod,
  today: string,
): ReportWindow {
  const end = addDaysISO(today, -1);
  return { start: addDaysISO(end, -(REPORT_PERIODS[period].days - 1)), end };
}

/** The `count` equal-length windows immediately preceding `window`, most recent first. */
export function precedingWindows(
  window: ReportWindow,
  days: number,
  count: number,
): ReportWindow[] {
  const out: ReportWindow[] = [];
  let cursor = window;
  for (let i = 0; i < count; i += 1) {
    const end = addDaysISO(cursor.start, -1);
    cursor = { start: addDaysISO(end, -(days - 1)), end };
    out.push(cursor);
  }
  return out;
}

const inWindow = (date: string, w: ReportWindow) =>
  date >= w.start && date <= w.end;

// ---------------------------------------------------------------------------
// The builder
// ---------------------------------------------------------------------------

export function buildSpendingReport(
  receipts: MergedReceipt[],
  disbursements: Disbursement[],
  period: ReportPeriod,
  today: string,
): SpendingReport {
  const spec = REPORT_PERIODS[period];
  const window = currentWindow(period, today);
  const baselineWindows = precedingWindows(window, spec.days, spec.baselines);

  // The ledger's own start date. A baseline window beginning before this has no
  // data *for a reason that has nothing to do with spending*, so averaging it
  // in would manufacture an increase out of the app's own age.
  const ledgerStart = receipts.reduce<string | null>(
    (min, r) => (min === null || r.date < min ? r.date : min),
    null,
  );
  const covers = (w: ReportWindow) =>
    ledgerStart !== null && ledgerStart <= w.start;

  const current = receipts.filter((r) => inWindow(r.date, window));
  const habitualRows = current.filter((r) => !isExcludedCategory(r.category));
  const excludedRows = current.filter((r) => isExcludedCategory(r.category));

  const habitualSpent = sumBy(habitualRows, (r) => r.actual_price);
  const excludedSpent = sumBy(excludedRows, (r) => r.actual_price);

  // ---- category rows -------------------------------------------------------

  const usableBaselineWindows = baselineWindows.filter(covers);

  // One pass per baseline window, reused by every category row below rather
  // than re-filtering the receipt list once per category.
  const baselineCategoryTotals = usableBaselineWindows.map((w) =>
    totalsByCategory(
      receipts.filter(
        (r) => inWindow(r.date, w) && !isExcludedCategory(r.category),
      ),
    ),
  );

  const allCategoryRows = [...totalsByCategory(habitualRows).entries()]
    .map(([category, stat]) => {
      const baselineAvg =
        baselineCategoryTotals.length === 0
          ? null
          : mean(
              baselineCategoryTotals.map(
                (totals) => totals.get(category)?.spent ?? 0,
              ),
            );
      return {
        category,
        spent: stat.spent,
        receiptCount: stat.receiptCount,
        shareOfHabitual: habitualSpent > 0 ? stat.spent / habitualSpent : 0,
        baselineAvg,
        changeVsBaseline: relativeChange(stat.spent, baselineAvg),
      } satisfies ReportCategoryRow;
    })
    .sort((a, b) => b.spent - a.spent || a.category.localeCompare(b.category));

  const categories = allCategoryRows.slice(0, REPORT_MAX_CATEGORY_ROWS);
  const tail = allCategoryRows.slice(REPORT_MAX_CATEGORY_ROWS);

  // ---- comparison ----------------------------------------------------------

  const baselines: ReportBaselineWindow[] = baselineWindows.map((w) => ({
    window: w,
    spent: covers(w)
      ? sumBy(
          receipts.filter(
            (r) => inWindow(r.date, w) && !isExcludedCategory(r.category),
          ),
          (r) => r.actual_price,
        )
      : null,
  }));

  const usable = baselines
    .map((b) => b.spent)
    .filter((s): s is number => s !== null);
  const baselineAvg = usable.length > 0 ? mean(usable) : null;

  // ---- received ------------------------------------------------------------

  const unlinked = disbursements.filter(
    (d) => d.refunded_from_receipt == null && inWindow(d.date_received, window),
  );

  return {
    period,
    generatedFor: today,
    window,
    habitual: {
      spent: habitualSpent,
      saved: sumBy(habitualRows, computeSavings),
      receiptCount: habitualRows.length,
      categories,
      hiddenCategories:
        tail.length > 0
          ? { count: tail.length, spent: sumBy(tail, (r) => r.spent) }
          : null,
    },
    excluded: {
      spent: excludedSpent,
      saved: sumBy(excludedRows, computeSavings),
      categories: [...totalsByCategory(excludedRows).entries()]
        .map(([category, stat]) => ({ category, ...stat }))
        .sort((a, b) => b.spent - a.spent || a.category.localeCompare(b.category)),
    },
    allInSpent: habitualSpent + excludedSpent,
    received: {
      total: sumBy(unlinked, (d) => d.amount),
      count: unlinked.length,
    },
    comparison: {
      baselines,
      baselineAvg,
      changeVsBaseline: relativeChange(habitualSpent, baselineAvg),
      usableBaselines: usable.length,
      requestedBaselines: spec.baselines,
    },
  };
}

/**
 * Relative change, or **null** where the question has no answer.
 *
 * A zero or absent baseline is the normal first run of this feature, not an
 * exotic input: a first-ever week compared against four empty windows hits this
 * on every field. Returning null rather than `Infinity` forces every renderer
 * to say "no baseline" instead of printing `∞%` or, worse, `0%` — which reads
 * as "unchanged", a claim nobody made.
 */
function relativeChange(current: number, baseline: number | null): number | null {
  if (baseline === null || baseline === 0) return null;
  return (current - baseline) / baseline;
}

function totalsByCategory(
  rows: MergedReceipt[],
): Map<string, { spent: number; receiptCount: number }> {
  const out = new Map<string, { spent: number; receiptCount: number }>();
  for (const r of rows) {
    const existing = out.get(r.category);
    if (existing) {
      existing.spent += r.actual_price;
      existing.receiptCount += 1;
    } else {
      out.set(r.category, { spent: r.actual_price, receiptCount: 1 });
    }
  }
  return out;
}

function sumBy<T>(rows: readonly T[], value: (row: T) => number): number {
  return rows.reduce((sum, row) => sum + value(row), 0);
}

function mean(values: readonly number[]): number {
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

// ---------------------------------------------------------------------------
// Shared presentation helpers
//
// These live here, not in either renderer, so the page and the email produce
// byte-identical strings. A number formatted two ways in two places is a bug
// waiting for someone to compare a screenshot against an inbox.
// ---------------------------------------------------------------------------

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/**
 * "Jul 25". Pure string work — no `new Date`, per `CLAUDE.md`'s date rule.
 *
 * Falls back to the raw string rather than rendering "undefined NaN" if it is
 * ever handed something that isn't a "YYYY-MM-DD": these strings end up in an
 * email, where a mangled date is worse than an ugly one.
 */
export function formatShortDate(iso: string): string {
  const [, month, day] = iso.split("-");
  const name = MONTHS[Number(month) - 1];
  if (!name || !day) return iso;
  return `${name} ${Number(day)}`;
}

/** "Jul 25, 2026". */
export function formatLongDate(iso: string): string {
  return `${formatShortDate(iso)}, ${iso.slice(0, 4)}`;
}

/** "Jul 25 – Jul 31, 2026", or both years when the window straddles New Year. */
export function formatWindowRange(window: ReportWindow): string {
  const sameYear = window.start.slice(0, 4) === window.end.slice(0, 4);
  return sameYear
    ? `${formatShortDate(window.start)} – ${formatLongDate(window.end)}`
    : `${formatLongDate(window.start)} – ${formatLongDate(window.end)}`;
}

/** "Week of Jul 25 – Jul 31, 2026". */
export function reportTitle(report: SpendingReport): string {
  return `${REPORT_PERIODS[report.period].label} of ${formatWindowRange(report.window)}`;
}

/** "Week of Jul 25" — the subject-line form. */
export function reportShortTitle(report: SpendingReport): string {
  return `${REPORT_PERIODS[report.period].label} of ${formatShortDate(report.window.start)}`;
}

/**
 * "vs 4-week avg" / "vs last year" / null when there is nothing to compare to.
 *
 * Counts the **usable** baselines, not the requested ones, so a report with two
 * of four windows predating the ledger says "vs 2-week avg" rather than quietly
 * dividing by a number the reader assumed was four.
 */
export function comparisonLabel(report: SpendingReport): string | null {
  const { usableBaselines } = report.comparison;
  if (usableBaselines === 0) return null;
  const noun = REPORT_PERIODS[report.period].noun;
  if (usableBaselines === 1) return `vs last ${noun}`;
  return `vs ${usableBaselines}-${noun} avg`;
}

export type ChangeDirection = "up" | "down" | "flat" | "none";

export function changeDirection(change: number | null): ChangeDirection {
  if (change === null) return "none";
  // Sub-0.05% rounds to "0.0%", and an arrow next to 0.0% reads as a
  // contradiction. Call it flat and drop the arrow.
  if (Math.abs(change) < 0.0005) return "flat";
  return change > 0 ? "up" : "down";
}

/** "▲ 14.2%", "▼ 8.0%", "0.0%", or "—". Both renderers use this. */
export function formatChange(change: number | null): string {
  const direction = changeDirection(change);
  if (direction === "none" || change === null) return "—";
  if (direction === "flat") return "0.0%";
  const pct = `${(Math.abs(change) * 100).toFixed(1)}%`;
  return `${direction === "up" ? "▲" : "▼"} ${pct}`;
}

/**
 * Bar fill as an integer percentage of the largest value in the set.
 *
 * **Scaled to the largest row, not to the total.** The top category is then
 * always a full bar and the shape below it is readable; scaling to the total
 * leaves every bar under a third of the track on a well-spread week, which is
 * the version that looks broken.
 *
 * Floored at 1% for any positive value so a real-but-tiny category shows a
 * sliver rather than reading as zero, and clamped at 0 for the negative totals
 * a fully-refunded receipt can produce.
 */
export function barPercent(value: number, max: number): number {
  if (max <= 0 || value <= 0) return 0;
  return Math.max(1, Math.min(100, Math.round((value / max) * 100)));
}
