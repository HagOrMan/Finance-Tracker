"use client";

import { cn } from "@/lib/utils";
import { changeDirection, formatChange } from "@/lib/reports";

/**
 * A relative-change figure: "▲ 14.2%", "▼ 8.0%", "0.0%" or "—".
 *
 * The string comes from `formatChange`, which the email template also calls, so
 * the two surfaces can't render the same number differently.
 *
 * **The glyph carries the meaning, not the color.** An increase is red and a
 * decrease is the brand turquoise, but nobody should have to see either to read
 * the direction — which matters for colour-vision deficiency and, in the email,
 * because Gmail's dark-mode inversion can shift a hue far enough to change what
 * it appears to say.
 */
export function ReportChange({
  change,
  suffix,
  className,
}: {
  change: number | null;
  /** e.g. "vs 4-week avg". Omitted when there's nothing to compare against. */
  suffix?: string | null;
  className?: string;
}) {
  const direction = changeDirection(change);

  return (
    <span
      className={cn(
        "tabular-nums",
        direction === "up" && "text-destructive",
        direction === "down" && "text-primary",
        (direction === "flat" || direction === "none") && "text-muted-foreground",
        className,
      )}
    >
      {direction === "none" ? "no baseline" : formatChange(change)}
      {suffix && direction !== "none" ? (
        <span className="text-muted-foreground"> {suffix}</span>
      ) : null}
    </span>
  );
}
