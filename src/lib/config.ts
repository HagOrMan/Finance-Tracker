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
