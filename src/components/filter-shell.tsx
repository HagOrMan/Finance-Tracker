"use client";

import { useState } from "react";
import { ChevronDown, SlidersHorizontal } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * The card every filter row sits in — a plain wrapper on desktop, a
 * collapsed-by-default disclosure on a phone.
 *
 * The filter rows carry five or six controls. Laid out at desktop widths
 * that's one tidy line; at 390px it wraps to roughly 300px of controls sitting
 * between the page title and the first number, so every page opened onto a
 * screenful of filters and none of the data. Collapsed, the same row is one
 * 44px bar that says how many filters are actually narrowing the view.
 *
 * Expanded, mobile stacks in a single column rather than re-wrapping: the
 * ragged two-and-a-half-per-row wrap is what makes a filter bar read as
 * broken. Callers pass `max-sm:w-full` on their fixed-width controls to opt
 * into it — the widths belong to the controls, not to this.
 *
 * `sm:` here is the same 640px boundary `useMediaQuery` uses to choose Dialog
 * over Drawer, so a viewport is never half phone-shaped and half not.
 */
export function FilterShell({
  activeCount = 0,
  children,
}: {
  /** Number of filters currently narrowing the view; shown on the collapsed bar. */
  activeCount?: number;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="rounded-lg border border-border bg-card">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full cursor-pointer items-center gap-2 px-3 py-3 text-sm font-medium text-foreground sm:hidden"
      >
        <SlidersHorizontal className="size-4 shrink-0 text-muted-foreground" />
        Filters
        {activeCount > 0 && (
          <span className="rounded-full bg-primary px-2 py-0.5 text-xs tabular-nums text-primary-foreground">
            {activeCount}
          </span>
        )}
        <ChevronDown
          className={cn(
            "ml-auto size-4 shrink-0 text-muted-foreground transition-transform",
            open && "rotate-180",
          )}
        />
      </button>

      {/* No unprefixed `display` on purpose: `sm:` and `max-sm:` between them
          cover every width, so there's no rule for the collapsed state to have
          to out-specify. */}
      <div
        className={cn(
          "gap-3 p-3 sm:flex sm:flex-wrap sm:items-end",
          open
            ? "max-sm:flex max-sm:flex-col max-sm:items-stretch max-sm:pt-0"
            : "max-sm:hidden",
        )}
      >
        {children}
      </div>
    </div>
  );
}
