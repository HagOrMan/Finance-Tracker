"use client";

import { FilterX, RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useRefreshFinanceData } from "@/hooks/use-finance-data";
import { cn } from "@/lib/utils";
import { useFiltersStore } from "@/store/filters-store";

/**
 * The two buttons that sit at the end of every filter bar, and the one thing
 * that matters about them: **they are not the same button.**
 *
 * - **Reset filters** changes *what you are looking at*. It touches no data,
 *   makes no request, and restores the view a first visit would have shown.
 * - **Refresh data** changes *what the app knows*. It re-reads the ledger from
 *   Postgres, bypassing both caches, and leaves every filter exactly as it was.
 *
 * They used to be one icon-only control each, a circular arrow next to nothing
 * — which is how "reset" and "refresh" become the same word. So Reset carries a
 * text label and a filter-shaped icon, Refresh stays the circular arrow and
 * spins while it's working, and both carry a `title` that names the *effect*
 * rather than repeating the label.
 */

export function ResetFiltersButton({
  /**
   * Page-local filter state to clear alongside the store — `/monthly`'s month
   * selection is the only one, since months are that page's alone.
   */
  onReset,
  className,
}: {
  onReset?: () => void;
  className?: string;
}) {
  const resetFilters = useFiltersStore((s) => s.resetFilters);

  return (
    <Button
      type="button"
      variant="outline"
      onClick={() => {
        resetFilters();
        onReset?.();
      }}
      title="Clear all filters and go back to the default view. Does not touch your data."
      className={cn("gap-2", className)}
    >
      <FilterX className="size-4" />
      Reset filters
    </Button>
  );
}

export function RefreshButton({ className }: { className?: string }) {
  const { refresh, isRefreshing } = useRefreshFinanceData();

  return (
    <Button
      type="button"
      variant="outline"
      size="icon"
      onClick={() => refresh()}
      disabled={isRefreshing}
      aria-label="Refresh data"
      title="Re-read the ledger from the database. Leaves your filters alone."
      className={className}
    >
      <RefreshCw className={cn("size-4", isRefreshing && "animate-spin")} />
    </Button>
  );
}
