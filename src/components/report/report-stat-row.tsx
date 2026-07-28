"use client";

import { Card, CardContent } from "@/components/ui/card";
import { ReportChange } from "@/components/report/report-change";
import { formatCurrency } from "@/lib/format";
import {
  comparisonLabel,
  formatWindowRange,
  type SpendingReport,
} from "@/lib/reports";

/**
 * The three headline figures (REPORTS.md §2.3, §3.1).
 *
 * **Habitual spend is the big one**, and the percentage change sits directly
 * under it because the two describe the same scope — that's the only way the
 * percentage is honest. Travel, School and Rent are in the strip further down
 * the page, not folded into this number.
 */
export function ReportStatRow({ report }: { report: SpendingReport }) {
  const { habitual, comparison, received } = report;
  const label = comparisonLabel(report);

  return (
    <div className="grid gap-3 sm:grid-cols-3">
      <Card className="min-w-0 gap-1 p-4 sm:col-span-1">
        <div className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
          Habitual spend
        </div>
        <CardContent className="p-0">
          <div className="text-3xl font-semibold tabular-nums text-foreground">
            {formatCurrency(habitual.spent)}
          </div>
          <div className="mt-1 text-sm">
            {comparison.usableBaselines === 0 ? (
              <span className="text-muted-foreground">
                Not enough history to compare yet.
              </span>
            ) : (
              <ReportChange
                change={comparison.changeVsBaseline}
                suffix={
                  label && comparison.baselineAvg !== null
                    ? `${label} (${formatCurrency(comparison.baselineAvg)})`
                    : null
                }
              />
            )}
          </div>
          <div className="mt-2 text-xs text-muted-foreground">
            {habitual.receiptCount} receipt
            {habitual.receiptCount === 1 ? "" : "s"} ·{" "}
            {formatWindowRange(report.window)}
          </div>
        </CardContent>
      </Card>

      <SupportingStat
        label="Saved on discounts"
        value={formatCurrency(habitual.saved)}
        hint="What the discounts on these receipts were worth. Same scope as the headline."
      />
      <SupportingStat
        label="Received"
        value={formatCurrency(received.total)}
        hint={`${received.count} disbursement${received.count === 1 ? "" : "s"} not linked to a receipt. Refunds are excluded here — they have already come off the spend figure, and counting them twice would report the same dollar as both a reduction and income.`}
      />
    </div>
  );
}

function SupportingStat({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint: string;
}) {
  return (
    // `min-w-0`: a grid track's automatic minimum is its content's min-content
    // width, so without it a long currency string widens the column and pushes
    // the page sideways on mobile.
    <Card className="min-w-0 gap-1 p-4" title={hint}>
      <div className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
        {label}
      </div>
      <CardContent className="p-0 text-xl font-semibold tabular-nums text-foreground sm:text-2xl">
        {value}
      </CardContent>
    </Card>
  );
}
