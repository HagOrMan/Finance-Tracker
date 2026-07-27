import { formatCurrency } from "@/lib/format";

interface TooltipEntry {
  name?: string;
  value?: number | string;
  color?: string;
}

// Shared Recharts tooltip renderer, styled against the app's popover tokens
// so it matches in both light and dark mode.
export function ChartTooltip({
  active,
  label,
  payload,
}: {
  active?: boolean;
  label?: string;
  payload?: TooltipEntry[];
}) {
  if (!active || !payload?.length) return null;

  return (
    <div className="rounded-md border border-border bg-popover px-3 py-2 text-sm text-popover-foreground shadow-md">
      {label && <div className="mb-1 font-medium">{label}</div>}
      <div className="flex flex-col gap-0.5">
        {payload
          .filter((entry) => typeof entry.value === "number" && entry.value !== 0)
          .map((entry, i) => (
            <div key={i} className="flex items-center gap-2">
              <span
                className="size-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: entry.color }}
              />
              <span className="text-muted-foreground">{entry.name}</span>
              <span className="ml-auto tabular-nums">
                {formatCurrency(Number(entry.value))}
              </span>
            </div>
          ))}
      </div>
    </div>
  );
}
