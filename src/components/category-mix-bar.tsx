"use client";

import { cn } from "@/lib/utils";

export interface CategoryMixSegment {
  category: string;
  count: number;
}

/**
 * A thin horizontal stacked bar showing how one store's receipts split across
 * categories (FEATURES.md §4.4).
 *
 * Colors come from the caller's `useCategoryColors` map — per `CLAUDE.md` that
 * hook is the *only* source of category color in the app, so this component
 * takes the map rather than deriving one. Same category, same color, here and
 * in every chart.
 *
 * A consistent store renders as one solid bar, which is what makes
 * inconsistency scannable down a column without reading any numbers.
 */
export function CategoryMixBar({
  segments,
  colorMap,
  className,
  showLegend = false,
}: {
  segments: readonly CategoryMixSegment[];
  colorMap: Record<string, string>;
  className?: string;
  showLegend?: boolean;
}) {
  const total = segments.reduce((sum, s) => sum + s.count, 0);
  if (total === 0) return null;

  const pct = (count: number) => (count / total) * 100;
  const describe = (s: CategoryMixSegment) =>
    `${s.category} — ${s.count} of ${total} (${pct(s.count).toFixed(0)}%)`;

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <div
        className="flex h-2 w-full overflow-hidden rounded-full bg-muted"
        role="img"
        aria-label={`Category mix: ${segments.map(describe).join("; ")}`}
      >
        {segments.map((s) => (
          <div
            key={s.category}
            // `flex: n 0 0%` rather than a percentage width: the segments then
            // divide the track by ratio, so rounding can't leave a sliver of
            // background showing between them.
            style={{
              flex: `${s.count} 0 0%`,
              backgroundColor: colorMap[s.category] ?? "var(--color-muted-foreground)",
            }}
            title={describe(s)}
          />
        ))}
      </div>

      {showLegend && (
        <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
          {segments.map((s) => (
            <li key={s.category} className="flex items-center gap-1.5">
              <span
                aria-hidden
                className="size-2 shrink-0 rounded-full"
                style={{
                  backgroundColor:
                    colorMap[s.category] ?? "var(--color-muted-foreground)",
                }}
              />
              <span className="truncate" title={describe(s)}>
                {s.category}
              </span>
              <span className="tabular-nums text-foreground">{s.count}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
