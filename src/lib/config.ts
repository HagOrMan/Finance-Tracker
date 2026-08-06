export const APP_TITLE = "Finance Tracker";
export const APP_ICON = "💸";
export const DEFAULT_DATE_RANGE_DAYS = 30;
export const DEFAULT_SUBTRACT_REFUNDS = true;
export const EXTRAPOLATION_FORWARD_DAYS = 30;

/**
 * IANA zone that decides what "today" means when the cron dates a generated
 * subscription charge. Overridable via `APP_TIMEZONE`.
 *
 * Read at module scope rather than per-call: this is a server-side constant,
 * and nothing should be able to change the meaning of "today" mid-run. The
 * zone observes DST, so the fixed UTC cron hour maps to a different local hour
 * half the year — irrelevant here, since the catch-up design only cares about
 * the date, never the time.
 */
export const APP_TIMEZONE = process.env.APP_TIMEZONE || "America/Toronto";

// ---------------------------------------------------------------------------
// Spending reports (ARCHITECTURE.md)
// ---------------------------------------------------------------------------

/**
 * The three report sizes. One rule for all of them: **a window is the `days`
 * days ending yesterday** (ARCHITECTURE.md).
 *
 * Run on a Saturday, the weekly window *is* last Sat→Fri — not because Saturday
 * is special-cased anywhere, but because that's what "the 7 days ending
 * yesterday" means on a Saturday. Nothing in the report builder knows what day
 * of the week it is; only the cron does.
 *
 * Month is 30 days and year is 365 days, deliberately not calendar periods: the
 * comparison is only honest between equal-length windows, and a trailing window
 * is always current. 365 ignores leap years, which shifts the "year ago"
 * boundary by a day per leap year and changes nothing about comparability.
 */
export const REPORT_PERIODS = {
  week: { days: 7, baselines: 4, noun: "week", label: "Week" },
  month: { days: 30, baselines: 4, noun: "month", label: "Month" },
  year: { days: 365, baselines: 1, noun: "year", label: "Year" },
} as const;

/**
 * Categories held out of the headline figure and every comparison (ARCHITECTURE.md
 * §2.2).
 *
 * This is **policy, not data** — spending here is real, but it is lumpy and
 * decided once a year, and averaging a rent payment into a weekly comparison
 * drowns out every signal the comparison exists to show. The rows are still
 * reported, in their own strip with an all-in total; they are just outside the
 * math.
 *
 * Changing this list changes every future report *and* every re-render of a
 * past one, since nothing about a report is stored. That's correct: the email
 * is a photograph, the ledger is the subject.
 */
export const COMPARISON_EXCLUDED_CATEGORIES = [
  "Travel",
  "School",
  "Rent",
] as const;

/**
 * Category rows in a report before the tail is rolled into a single "N other
 * categories" line.
 *
 * Gmail clips a message over ~102 KB and hides the rest behind a "[Message
 * clipped]" link; a yearly report over free-text categories is the only
 * realistic way this app approaches that. The cap is stated in the roll-up row
 * rather than silently truncating.
 */
export const REPORT_MAX_CATEGORY_ROWS = 25;

// ---------------------------------------------------------------------------
// Monthly digest (ARCHITECTURE.md)
//
// A second lens, not a fourth period: calendar months can't satisfy the
// equal-length-window assumption `REPORT_PERIODS` is built on. Everything here
// is policy the way `COMPARISON_EXCLUDED_CATEGORIES` is policy — changing a
// number changes every past digest on re-render, which is correct, because a
// digest is a photograph and the ledger is the subject.
// ---------------------------------------------------------------------------

/**
 * Day of the month the digest mails on. **The 3rd, not the 1st.**
 *
 * Receipts are entered as they happen, so the last days of a month are the
 * least likely to be on the ledger the moment it closes. Two days of grace cost
 * nothing — the lookback is a fixed calendar month either way — and a digest is
 * a lens, so a receipt entered late is silently absent forever rather than
 * retroactively corrected.
 */
export const DIGEST_SEND_DAY_OF_MONTH = 3;

/**
 * Completed months of history behind the digest's own month.
 *
 * Drives both the grid (these + the digest month = 7 columns, which is what
 * fits a 600px email) and the forecast baseline. Short enough that stale habits
 * age out; long enough that the trimmed mean has something to trim.
 */
export const DIGEST_BASELINE_MONTHS = 6;

/** Category rows in the grid. Far below `REPORT_MAX_CATEGORY_ROWS` — 7 columns of numbers stops being readable long before 25 rows. */
export const DIGEST_MAX_GRID_CATEGORIES = 10;

/** Rows in the top-stores table. */
export const DIGEST_TOP_STORES = 5;

/**
 * Below this many usable baseline months the forecast uses the median instead
 * of the trimmed mean. Drop-high-drop-low leaves 4 of 6; trimming 2 of 3 points
 * is not an estimator, it is a coin flip with extra steps.
 */
export const FORECAST_MIN_TRIM_MONTHS = 5;

/** The long horizon, in months, alongside the next-month figure. */
export const FORECAST_HORIZON_MONTHS = 4;

/**
 * Relative gap between the last-3-month median and the prior-3-month median
 * before a category is flagged as trending.
 *
 * The point of the flag: a trimmed mean is deliberately blind to drift, so
 * something else has to say when the stable number is about to be wrong.
 */
export const FORECAST_TREND_THRESHOLD = 0.25;

/** A category this far below its baseline is a "quiet win" worth naming. */
export const DIGEST_QUIET_WIN_THRESHOLD = 0.1;

/**
 * The three big-spender rules (ARCHITECTURE.md). A receipt qualifies on **any**
 * of them, and the digest states which one it hit — a bare threshold cannot
 * explain why a brake job belongs next to rent.
 */
export const BIG_SPENDER = {
  /** Over this, always a row, whatever else is true. */
  absoluteFloor: 150,
  /** Multiple of the category's own trailing median receipt. */
  relativeMultiple: 3,
  /** Floor under the relative rule, so a $12 coffee can't be an outlier in a $4-median category. */
  relativeFloor: 60,
  /** Fraction of the month's all-in spend. Catches domination in a quiet month. */
  shareOfAllIn: 0.05,
  /** Trailing months the category median is taken over. Longer than the baseline: this is a "what is typical here", not a "what is recent here". */
  medianMonths: 12,
} as const;

/**
 * The two eating-out categories, split in `CATEGORY_OPTIONS` on purpose.
 *
 * Matched through `nameGroupKey` like every other category comparison, so
 * spelling drift in the ledger can't silently drop one side of the ratio.
 */
export const EATING_OUT_STRESSED = "Eating Out (Stressed)";
export const EATING_OUT_SOCIAL = "Eating Out (Social)";
