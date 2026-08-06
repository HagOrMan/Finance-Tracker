"use client";

import {
  formatCompact,
  formatMonthAbbr,
  type MonthlyDigest,
} from "@/lib/monthly-digest";

/**
 * Habitual spend, category × month (ARCHITECTURE.md).
 *
 * **Replaces the weekly report's single "vs average" column**, and that is the
 * point of it: one average can't distinguish a rising trend from one bad month,
 * and for a student the dominant structure is seasonal — September's textbooks
 * and December's travel are the signal an average smears out.
 *
 * Rows are ranked by their total across the whole window, never by the current
 * month, so a category can't pop in and out between digests and break the
 * comparison the grid exists to support.
 *
 * A dash is not a zero: it means the ledger doesn't reach that month, which is
 * a different claim and must not read as "spent nothing".
 *
 * Scrolls horizontally inside its own container rather than shrinking the type
 * — seven columns of currency will not fit a phone, and the alternative is a
 * font size nobody can read.
 */
export function DigestGrid({
  digest,
  colorMap,
}: {
  digest: MonthlyDigest;
  colorMap: Record<string, string>;
}) {
  const { months, rows, otherRow, totals } = digest.grid;

  if (rows.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-card p-6 text-sm text-muted-foreground">
        No habitual spending on the ledger yet.
      </div>
    );
  }

  const cell = "px-2 py-1.5 text-right tabular-nums whitespace-nowrap";
  const lastIndex = months.length - 1;

  return (
    <div className="flex flex-col gap-2">
      <div className="overflow-x-auto rounded-lg border border-border bg-card">
        <table className="w-full min-w-136 border-collapse text-sm">
          <thead>
            <tr className="border-b border-border">
              <th className="sticky left-0 bg-card px-3 py-2 text-left text-xs font-medium text-muted-foreground">
                Category
              </th>
              {months.map((month, i) => (
                <th
                  key={month}
                  className={`${cell} text-xs font-medium ${
                    i === lastIndex
                      ? "text-foreground"
                      : "text-muted-foreground"
                  }`}
                >
                  {formatMonthAbbr(month)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.category} className="border-b border-border/50">
                <th
                  scope="row"
                  className="sticky left-0 max-w-40 truncate bg-card px-3 py-1.5 text-left font-normal"
                  title={row.category}
                >
                  <span
                    aria-hidden
                    className="mr-2 inline-block size-2 shrink-0 rounded-xs align-middle"
                    style={{
                      backgroundColor:
                        colorMap[row.category] ??
                        "var(--color-muted-foreground)",
                    }}
                  />
                  {row.category}
                </th>
                {row.values.map((value, i) => (
                  <td
                    key={months[i]}
                    className={`${cell} ${
                      i === lastIndex
                        ? "font-medium text-foreground"
                        : "text-muted-foreground"
                    }`}
                  >
                    {formatCompact(value)}
                  </td>
                ))}
              </tr>
            ))}

            {otherRow && (
              <tr className="border-b border-border/50 text-muted-foreground">
                <th
                  scope="row"
                  className="sticky left-0 bg-card px-3 py-1.5 text-left font-normal"
                >
                  {otherRow.category}
                </th>
                {otherRow.values.map((value, i) => (
                  <td key={months[i]} className={cell}>
                    {formatCompact(value)}
                  </td>
                ))}
              </tr>
            )}

            <tr className="font-semibold">
              <th
                scope="row"
                className="sticky left-0 bg-card px-3 py-2 text-left"
              >
                Habitual
              </th>
              {totals.map((value, i) => (
                <td key={months[i]} className={`${cell} py-2`}>
                  {formatCompact(value)}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>

      <p className="text-xs text-muted-foreground">
        A dash means the ledger doesn&rsquo;t reach that month — not that
        nothing was spent. Rent, school and travel are excluded here; they
        appear under Big spenders.
      </p>
    </div>
  );
}
