"use client";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  baselineLabel,
  formatCompact,
  formatMonthLong,
  type MonthlyDigest,
  type ProjectedCategory,
} from "@/lib/monthly-digest";

/**
 * What to expect (ARCHITECTURE.md).
 *
 * Three things are deliberately absent, and each absence is a decision:
 *
 * - **Income** is never projected. Term-time hours are structurally lower than
 *   summer, so any average over recent months overestimates exactly when the
 *   number matters. It is reported as observed instead.
 * - **Rent, school and travel** are out. They are paid ad hoc rather than on a
 *   schedule, so there is nothing here to extrapolate from — hence the label on
 *   the total, which stops a figure that omits the largest cost reading as a
 *   cost of living.
 * - **One-offs** are stripped from the baseline and shown as a buffer instead.
 *   They can't be forecast, which is not the same as not happening.
 *
 * The ranges are the middle half of the baseline months, and the multi-month
 * band widens as √n rather than n — good and bad months partly cancel, so
 * scaling linearly would overstate the long horizon by roughly double.
 */
export function DigestProjection({ digest }: { digest: MonthlyDigest }) {
  const p = digest.projection;

  if (p.categories.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-card p-6 text-sm text-muted-foreground">
        Not enough complete months on the ledger to project from yet. This fills
        in once there is at least one month of history behind the digest.
      </div>
    );
  }

  const rule =
    p.categories[0]?.rule === "trimmed-mean"
      ? "Trimmed mean — the highest and lowest month are dropped"
      : "Median — too few complete months to trim";
  const baseline = baselineLabel(digest);

  return (
    <div className="flex flex-col gap-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <HorizonCard
          label={formatMonthLong(p.nextMonth)}
          total={p.nextMonthTotal.total}
          low={p.nextMonthTotal.low}
          high={p.nextMonthTotal.high}
          hint="Next month"
        />
        <HorizonCard
          label={`Through ${formatMonthLong(p.horizonThrough)}`}
          total={p.horizonTotal.total}
          low={p.horizonTotal.low}
          high={p.horizonTotal.high}
          hint={`${p.horizonMonths} months`}
        />
      </div>

      <div className="rounded-lg border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="pl-4">Category</TableHead>
              <TableHead className="w-full min-w-32">Typical range</TableHead>
              <TableHead className="pr-4 text-right">Per month</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {p.categories.map((row) => (
              <CategoryRow key={row.category} row={row} />
            ))}

            <TableRow className="border-t border-border">
              <TableCell className="pl-4">
                Subscriptions
                <div className="text-xs text-muted-foreground">
                  From the schedule, not estimated
                </div>
              </TableCell>
              <TableCell className="text-sm text-muted-foreground">
                known exactly
              </TableCell>
              <TableCell className="pr-4 text-right tabular-nums">
                {formatCompact(p.subscriptionsNextMonth)}
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </div>

      <div className="rounded-lg border border-border bg-card p-4">
        <p className="text-sm text-foreground">
          Set aside about{" "}
          <span className="font-semibold tabular-nums">
            {formatCurrency(p.oneOffBuffer)}
          </span>{" "}
          a month for one-offs.
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          They&rsquo;re stripped from every figure above because they can&rsquo;t
          be forecast — which isn&rsquo;t the same as not happening. This is what
          they&rsquo;ve actually averaged.
        </p>
      </div>

      <p className="text-xs text-muted-foreground">
        Habitual spend plus subscriptions only — <strong>excludes rent, school
        and travel</strong>, which are paid ad hoc and have no schedule to
        project from. Income is never projected either. {rule}
        {baseline ? `, over ${baseline}` : ""}. Ranges are the middle half of
        those months; the multi-month band widens as √n, since good and bad
        months partly cancel.
      </p>
    </div>
  );
}

function HorizonCard({
  label,
  total,
  low,
  high,
  hint,
}: {
  label: string;
  total: number;
  low: number;
  high: number;
  hint: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
        {hint}
      </div>
      <div className="mt-1 text-sm text-foreground">{label}</div>
      <div className="mt-1 text-2xl font-semibold tabular-nums text-foreground">
        {formatCurrency(total)}
      </div>
      <div className="mt-1 text-xs text-muted-foreground tabular-nums">
        typically {formatCompact(low)} – {formatCompact(high)}
      </div>
    </div>
  );
}

function CategoryRow({ row }: { row: ProjectedCategory }) {
  return (
    <TableRow>
      <TableCell className="max-w-40 truncate pl-4 font-medium" title={row.category}>
        {row.category}
      </TableCell>
      <TableCell className="text-sm text-muted-foreground tabular-nums">
        {formatCompact(row.low)} – {formatCompact(row.high)}
        {row.trend && (
          // The estimator is deliberately blind to drift, so this is the only
          // thing that says the stable number is about to be wrong. Same colour
          // pairing as `ReportChange` — rising spend destructive, falling the
          // brand turquoise — and the word carries the meaning either way.
          <span
            className={cn(
              "ml-2",
              row.trend === "rising" ? "text-destructive" : "text-primary",
            )}
            title="The last three months differ from the three before them by more than 25%"
          >
            {row.trend}
          </span>
        )}
      </TableCell>
      <TableCell className="pr-4 text-right font-medium tabular-nums">
        {formatCompact(row.perMonth)}
      </TableCell>
    </TableRow>
  );
}
