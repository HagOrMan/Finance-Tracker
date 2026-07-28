// All functions here take/return plain "YYYY-MM-DD" strings and do date
// math in UTC (via the explicit T00:00:00Z anchor) specifically to avoid
// local-timezone `Date` parsing shifting the day — see migration.md's note
// on dates-as-strings.

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
