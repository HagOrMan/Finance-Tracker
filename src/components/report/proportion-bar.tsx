"use client";

import { cn } from "@/lib/utils";
import { barPercent } from "@/lib/reports";

/**
 * A single-value horizontal bar — one category's share of the largest one.
 *
 * Not `CategoryMixBar`: that is a *stacked* bar over several segments of one
 * whole, and this is one value measured against a separate maximum. Same
 * visual family, different question.
 *
 * `color` comes from the caller's `useCategoryColors` map rather than being
 * derived here, per `CLAUDE.md`'s rule that the hook is the only source of
 * category color in the app. `barPercent` is shared with the email template so
 * both surfaces round identically.
 */
export function ProportionBar({
  value,
  max,
  color,
  label,
  className,
}: {
  value: number;
  max: number;
  color: string;
  /** Announced to screen readers, which can't see the bar at all. */
  label: string;
  className?: string;
}) {
  const percent = barPercent(value, max);

  return (
    <div
      className={cn("h-2.5 w-full overflow-hidden rounded-full bg-muted", className)}
      role="img"
      aria-label={label}
      title={label}
    >
      <div
        className="h-full rounded-full"
        style={{ width: `${percent}%`, backgroundColor: color }}
      />
    </div>
  );
}
