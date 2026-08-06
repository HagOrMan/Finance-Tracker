// All functions here take/return plain "YYYY-MM-DD" strings and do date
// math in UTC (via the explicit T00:00:00Z anchor) specifically to avoid
// local-timezone `Date` parsing shifting the day — see ARCHITECTURE.md's note
// on dates-as-strings.
//
// **Why this is hand-rolled rather than date-fns** — asked and answered, and
// the dependency was carried unused for months before being dropped. date-fns
// operates on `Date` objects in *local* time: `new Date("2026-07-25")` parses
// as UTC midnight, so west of Greenwich it is already the 24th locally, and
// `startOfISOWeek` on it returns the wrong week at the boundary. Using it
// safely here would mean adding date-fns-tz, or wrapping every call in the same
// explicit-UTC handling these ~20 lines already do — a dependency to work
// around a dependency. `todayInZone` has no equivalent at all without
// date-fns-tz, since it needs a named IANA zone.
//
// If a date bug ever does surface, fix it here. Reaching for a Date-based
// library is the move that reintroduces the bug class this file exists to
// prevent.

export function isoWeekStart(dateISO: string): string {
  const d = new Date(`${dateISO}T00:00:00Z`);
  const day = d.getUTCDay(); // 0 = Sun .. 6 = Sat
  const diff = (day === 0 ? -6 : 1) - day; // shift back to Monday
  d.setUTCDate(d.getUTCDate() + diff);
  return d.toISOString().slice(0, 10);
}

export function daysBetween(startISO: string, endISO: string): number {
  const start = new Date(`${startISO}T00:00:00Z`).getTime();
  const end = new Date(`${endISO}T00:00:00Z`).getTime();
  return Math.round((end - start) / 86_400_000);
}

export function addDaysISO(dateISO: string, days: number): string {
  const d = new Date(`${dateISO}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * Day of the week for a plain ISO date. 0 = Sunday … 6 = Saturday.
 *
 * UTC-anchored for the same reason as everything else in this file — the local
 * parse of "YYYY-MM-DD" shifts the day west of Greenwich, which would put the
 * weekly report on the wrong weekday for exactly the timezones this app runs in.
 *
 * The only caller is the cron's Saturday check (ARCHITECTURE.md). The report
 * builder itself never learns what day of the week it is, which is what lets
 * the identical code path serve the on-demand button on a Tuesday.
 */
export function dayOfWeekUTC(dateISO: string): number {
  return new Date(`${dateISO}T00:00:00Z`).getUTCDay();
}

export const SATURDAY = 6;

// ---------------------------------------------------------------------------
// Calendar months — "YYYY-MM"
//
// The monthly digest is the only calendar-period lens in the app
// (ARCHITECTURE.md). A month is a plain "YYYY-MM" string for the same reason a
// date is a plain "YYYY-MM-DD" one: it sorts lexicographically, compares with
// `===`, and cannot be shifted by a timezone it never touched.
//
// Every one of these anchors in UTC via Date.UTC, matching the rest of the file.
// ---------------------------------------------------------------------------

/** The "YYYY-MM" a plain date falls in. Pure slicing — no parsing at all. */
export function monthKeyOf(dateISO: string): string {
  return dateISO.slice(0, 7);
}

/** First day of a month, as "YYYY-MM-DD". */
export function monthStart(monthKey: string): string {
  return `${monthKey}-01`;
}

/**
 * Last day of a month — 28, 29, 30 or 31, leap years included.
 *
 * Day 0 of the *following* month is the last day of this one, which is the one
 * piece of `Date` arithmetic that gets month lengths right without a table.
 */
export function monthEnd(monthKey: string): string {
  const year = Number(monthKey.slice(0, 4));
  const month = Number(monthKey.slice(5, 7));
  return new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
}

/** Days in a month. The digest reports it because month totals are not comparable without it. */
export function daysInMonth(monthKey: string): number {
  return Number(monthEnd(monthKey).slice(8, 10));
}

/** Shift a month key by whole months, forward or back. Rolls the year over. */
export function addMonthsToKey(monthKey: string, months: number): string {
  const year = Number(monthKey.slice(0, 4));
  const month = Number(monthKey.slice(5, 7));
  return new Date(Date.UTC(year, month - 1 + months, 1))
    .toISOString()
    .slice(0, 7);
}

/**
 * The `count` months immediately preceding `monthKey`, **oldest first**.
 *
 * Oldest-first because every consumer is a left-to-right time axis: the grid's
 * columns and the forecast's baseline series both read forward. `reports.ts`'s
 * `precedingWindows` returns most-recent-first for the opposite reason — its
 * consumer is a "vs last week" list.
 */
export function precedingMonths(monthKey: string, count: number): string[] {
  const out: string[] = [];
  for (let i = count; i >= 1; i -= 1) {
    out.push(addMonthsToKey(monthKey, -i));
  }
  return out;
}

/**
 * Today's date in a named IANA zone, as "YYYY-MM-DD".
 *
 * `todayISO()` in `filters.ts` uses the *server's* local zone. On Vercel that
 * is UTC, so a midnight-UTC cron would date charges a day early relative to
 * Eastern time. Everything user-facing keeps using `todayISO()`; only the
 * subscription runner needs a zone-anchored "today", because it is the one
 * thing deciding what date to stamp on a row nobody is watching it write.
 *
 * `en-CA` formats as YYYY-MM-DD, which is exactly this app's date convention.
 */
export function todayInZone(timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}
