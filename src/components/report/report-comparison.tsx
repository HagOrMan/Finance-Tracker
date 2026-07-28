"use client";

import { cn } from "@/lib/utils";
import { REPORT_PERIODS } from "@/lib/config";
import { formatCurrency } from "@/lib/format";
import {
  barPercent,
  formatShortDate,
  formatWindowRange,
  type SpendingReport,
} from "@/lib/reports";

/**
 * The baseline strip (ARCHITECTURE.md).
 *
 * The bars exist so you can see whether the average is a fair baseline — a
 * headline "▲14% vs 4-week average" means something quite different when the
 * four weeks are flat than when one of them was a $900 outlier.
 *
 * Windows are rendered **oldest first**, so the column reads chronologically
 * down to "this week" at the bottom. `comparison.baselines` arrives
 * most-recent-first, hence the reverse.
 */
export function ReportComparison({ report }: { report: SpendingReport }) {
  const { comparison, habitual, period } = report;
  const spec = REPORT_PERIODS[period];

  if (comparison.usableBaselines === 0) {
    return (
      <div className="rounded-lg border border-border bg-card p-6 text-sm text-muted-foreground">
        <p className="font-medium text-foreground">Nothing to compare against yet.</p>
        <p className="mt-1">
          Every preceding {spec.noun} starts before the first receipt on the
          ledger. Those windows are left out rather than counted as zero —
          averaging them in would manufacture an increase out of the app&rsquo;s
          own age.
        </p>
      </div>
    );
  }

  const ordered = [...comparison.baselines].reverse();
  const max = Math.max(
    habitual.spent,
    ...comparison.baselines.map((b) => b.spent ?? 0),
  );

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4">
      <h2 className="text-sm font-medium text-foreground">
        {spec.baselines === 1
          ? `Vs. the previous ${spec.noun}`
          : `Vs. the previous ${comparison.usableBaselines} ${spec.noun}s`}
      </h2>

      <div className="flex flex-col gap-1.5">
        {ordered.map((baseline) => (
          <Row
            key={baseline.window.start}
            label={formatShortDate(baseline.window.start)}
            title={formatWindowRange(baseline.window)}
            value={baseline.spent}
            max={max}
          />
        ))}
        <Row
          label={`This ${spec.noun}`}
          title={formatWindowRange(report.window)}
          value={habitual.spent}
          max={max}
          current
        />
      </div>

      <p className="text-xs text-muted-foreground">
        Each bar is a {spec.days}-day window starting on the date shown, habitual
        categories only.
        {comparison.baselineAvg !== null && (
          <> Average {formatCurrency(comparison.baselineAvg)}.</>
        )}
      </p>
    </div>
  );
}

function Row({
  label,
  title,
  value,
  max,
  current = false,
}: {
  label: string;
  title: string;
  value: number | null;
  max: number;
  current?: boolean;
}) {
  return (
    <div className="flex items-center gap-3" title={title}>
      <div
        className={cn(
          "w-20 shrink-0 truncate text-xs",
          current ? "font-medium text-foreground" : "text-muted-foreground",
        )}
      >
        {label}
      </div>
      <div className="h-2.5 min-w-0 flex-1 overflow-hidden rounded-full bg-muted">
        {value !== null && (
          <div
            className={cn(
              "h-full rounded-full",
              // The current window is the subject; the baselines are the
              // backdrop it's read against, so they get a neutral fill rather
              // than a second brand hue.
              current ? "bg-primary" : "bg-muted-foreground/40",
            )}
            style={{ width: `${barPercent(value, max)}%` }}
          />
        )}
      </div>
      <div
        className={cn(
          "w-20 shrink-0 text-right text-xs tabular-nums",
          current ? "font-semibold text-foreground" : "text-muted-foreground",
        )}
      >
        {value === null ? "no data" : formatCurrency(value)}
      </div>
    </div>
  );
}
