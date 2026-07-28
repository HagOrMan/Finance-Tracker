"use client";

import { ReportCategoryTable } from "@/components/report/report-category-table";
import { ReportComparison } from "@/components/report/report-comparison";
import { ReportStatRow } from "@/components/report/report-stat-row";
import { COMPARISON_EXCLUDED_CATEGORIES } from "@/lib/config";
import { formatCurrency } from "@/lib/format";
import { reportTitle, type SpendingReport } from "@/lib/reports";

/**
 * A whole spending report, rendered.
 *
 * Takes a `SpendingReport` and a colour map and **nothing else** — no hooks, no
 * fetching. That's what lets the same component render a live report, a stale
 * one, or a hand-built fixture, and it keeps the page above it responsible for
 * where the data came from.
 *
 * Section order matches the email exactly (REPORTS.md §3.1): the two numbers
 * that were asked for, then the breakdown, then the comparison, then the
 * excluded strip last — it's reference material, not a finding, and putting
 * $1,200 of rent above a $412 habitual total buries the lede.
 */
export function SpendingReportView({
  report,
  colorMap,
}: {
  report: SpendingReport;
  colorMap: Record<string, string>;
}) {
  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-lg font-medium text-foreground">
        {reportTitle(report)}
      </h2>

      <ReportStatRow report={report} />

      <section className="flex flex-col gap-2">
        <h3 className="text-sm font-medium text-muted-foreground">
          Where it went
        </h3>
        <ReportCategoryTable report={report} colorMap={colorMap} />
      </section>

      <ReportComparison report={report} />

      <ExcludedStrip report={report} />
    </div>
  );
}

/**
 * Travel / School / Rent — real spending, held out of every figure above.
 *
 * Omitted entirely when none of them appear in the window: a row reading
 * "Travel $0.00" is noise, and its absence already says the same thing.
 */
function ExcludedStrip({ report }: { report: SpendingReport }) {
  const { excluded, allInSpent } = report;
  if (excluded.categories.length === 0) return null;

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border bg-card p-4">
      <h2 className="text-sm font-medium text-foreground">Not compared</h2>
      <p className="text-xs text-muted-foreground">
        {COMPARISON_EXCLUDED_CATEGORIES.join(", ")} are held out of the figures
        above. The spending is real, but it isn&rsquo;t habitual — averaging a
        rent payment into a weekly comparison drowns out everything the
        comparison exists to show.
      </p>

      <dl className="mt-1 flex flex-col gap-1 text-sm">
        {excluded.categories.map((row) => (
          <div key={row.category} className="flex items-baseline justify-between gap-4">
            <dt className="truncate text-foreground" title={row.category}>
              {row.category}
              <span className="ml-2 text-xs text-muted-foreground">
                {row.receiptCount} receipt{row.receiptCount === 1 ? "" : "s"}
              </span>
            </dt>
            <dd className="shrink-0 tabular-nums text-foreground">
              {formatCurrency(row.spent)}
            </dd>
          </div>
        ))}
        <div className="mt-1 flex items-baseline justify-between gap-4 border-t border-border pt-2 font-semibold">
          <dt className="text-foreground">All-in total</dt>
          <dd className="shrink-0 tabular-nums text-foreground">
            {formatCurrency(allInSpent)}
          </dd>
        </div>
      </dl>
    </div>
  );
}
