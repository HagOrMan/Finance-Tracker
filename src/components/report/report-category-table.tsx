"use client";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ProportionBar } from "@/components/report/proportion-bar";
import { ReportChange } from "@/components/report/report-change";
import { formatCurrency } from "@/lib/format";
import { formatShortDate, type SpendingReport } from "@/lib/reports";

/**
 * Where the habitual spending went (ARCHITECTURE.md).
 *
 * Bars are **scaled to the largest row, not to the total**: the top category is
 * then always a full bar and the shape below it is readable. Scaling to the
 * total leaves every bar under a third of the track on a well-spread week,
 * which is the version that looks broken.
 *
 * Excluded categories are absent by construction — they never enter
 * `habitual.categories`.
 *
 * `colorMap` is a **prop, not a `useCategoryColors` call inside this
 * component**, and that is load-bearing. The hook assigns from the palette by
 * alphabetical index over the set it is handed, so deriving a map from this
 * window's four or five categories would colour Groceries differently here than
 * on `/monthly` — which passes every category in the ledger. Same trap the
 * email template has to avoid; the page owns the map so both this table and the
 * email are built from the same full set.
 */
export function ReportCategoryTable({
  report,
  colorMap,
}: {
  report: SpendingReport;
  colorMap: Record<string, string>;
}) {
  const { categories, hiddenCategories } = report.habitual;

  if (categories.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-card p-6 text-sm text-muted-foreground">
        No receipts between {formatShortDate(report.window.start)} and{" "}
        {formatShortDate(report.window.end)}.
      </div>
    );
  }

  const max = categories[0]!.spent;

  return (
    <div className="rounded-lg border border-border bg-card">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="pl-4">Category</TableHead>
            <TableHead className="text-right">Spent</TableHead>
            <TableHead className="text-right">Share</TableHead>
            {/* The bar column is the widest thing here; `w-full` makes it
                absorb the leftover space so the numeric columns stay snug. */}
            <TableHead className="w-full min-w-32 pr-4">vs. average</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {categories.map((row) => (
            <TableRow key={row.category}>
              <TableCell className="max-w-40 truncate pl-4 font-medium" title={row.category}>
                {row.category}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {formatCurrency(row.spent)}
              </TableCell>
              <TableCell className="text-right tabular-nums text-muted-foreground">
                {Math.round(row.shareOfHabitual * 100)}%
              </TableCell>
              <TableCell className="pr-4">
                <div className="flex min-w-28 flex-col gap-1">
                  <ProportionBar
                    value={row.spent}
                    max={max}
                    color={colorMap[row.category] ?? "var(--color-muted-foreground)"}
                    label={`${row.category} — ${formatCurrency(row.spent)}, ${Math.round(row.shareOfHabitual * 100)}% of habitual spend`}
                  />
                  <ReportChange
                    change={row.changeVsBaseline}
                    className="text-xs"
                  />
                </div>
              </TableCell>
            </TableRow>
          ))}

          {hiddenCategories && (
            <TableRow>
              <TableCell
                className="pl-4 text-muted-foreground"
                colSpan={4}
                title="Capped so the email can't exceed Gmail's ~102 KB clipping limit."
              >
                {hiddenCategories.count} other categor
                {hiddenCategories.count === 1 ? "y" : "ies"} —{" "}
                <span className="tabular-nums">
                  {formatCurrency(hiddenCategories.spent)}
                </span>
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}
