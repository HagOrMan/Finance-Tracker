import { formatCurrency } from "@/lib/format";

// Hand-built as a CSS grid rather than a charting-library heatmap — see
// migration.md §3 for why (Recharts has no native heatmap mark).
export function CategoryMonthHeatmap({
  categories,
  months,
  values,
}: {
  categories: string[];
  months: string[];
  values: Record<string, Record<string, number>>; // values[category][month]
}) {
  const max = Math.max(
    1,
    ...categories.flatMap((cat) => months.map((m) => values[cat]?.[m] ?? 0))
  );

  return (
    <div className="overflow-x-auto">
      <div
        className="grid gap-1"
        style={{
          gridTemplateColumns: `140px repeat(${months.length}, minmax(72px, 1fr))`,
        }}
      >
        <div />
        {months.map((m) => (
          <div
            key={m}
            className="px-1 pb-1 text-center text-xs font-medium text-muted-foreground"
          >
            {m}
          </div>
        ))}
        {categories.map((cat) => (
          <div key={cat} className="contents">
            <div className="flex items-center truncate pr-2 text-sm text-foreground">
              {cat}
            </div>
            {months.map((m) => {
              const v = values[cat]?.[m] ?? 0;
              const intensity = v / max;
              return (
                <div
                  key={m}
                  title={`${cat} · ${m} · ${formatCurrency(v)}`}
                  className="flex h-9 items-center justify-center rounded-sm text-xs tabular-nums"
                  style={{
                    backgroundColor: `color-mix(in oklch, var(--color-primary) ${Math.round(intensity * 90)}%, var(--color-card))`,
                    color:
                      intensity > 0.55
                        ? "var(--color-primary-foreground)"
                        : "var(--color-foreground)",
                  }}
                >
                  {v > 0 ? formatCurrency(v).replace(".00", "") : ""}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
