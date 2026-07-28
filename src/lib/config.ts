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
// Spending reports (REPORTS.md)
// ---------------------------------------------------------------------------

/**
 * The three report sizes. One rule for all of them: **a window is the `days`
 * days ending yesterday** (REPORTS.md §2.1).
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
 * Categories held out of the headline figure and every comparison (REPORTS.md
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
