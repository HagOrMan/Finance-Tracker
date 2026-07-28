"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

/**
 * The bar that appears once rows are selected in a manage table
 * (FEATURES.md §5). Sticky to the bottom of the viewport, so it stays reachable
 * however far down a long table the selection was made.
 *
 * The actions themselves are passed in as children — receipts and
 * disbursements offer different ones, but the shell, the count and the clear
 * affordance are the same and shouldn't drift apart.
 */
export function SelectionActionBar({
  count,
  noun,
  onClear,
  children,
}: {
  count: number;
  /** Singular; pluralized here. */
  noun: string;
  onClear: () => void;
  children: React.ReactNode;
}) {
  if (count === 0) return null;

  return (
    <div className="sticky bottom-4 z-20 flex flex-wrap items-center gap-2 rounded-lg border-2 border-primary bg-card p-2 shadow-lg">
      <span className="px-1 text-sm font-medium text-foreground">
        {count} {noun}
        {count === 1 ? "" : "s"} selected
      </span>
      {children}
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="ml-auto"
        onClick={onClear}
      >
        Clear
      </Button>
    </div>
  );
}

/**
 * One "set this field on every selected row" action.
 *
 * A **Dialog**, not a Popover, on purpose: the controls these hold are a Radix
 * `Select` (`CategorySelect`) and `AutocompleteInput`, and a Select's content
 * portals outside its trigger's DOM subtree — inside a Popover that reads as a
 * pointer-down outside, which can dismiss the Popover the moment you pick an
 * option. Dialog-wrapping-Select is the combination `quick-add-modal.tsx`
 * already proves out in this codebase.
 *
 * Opening it is itself the deliberate step, so these don't need the two-click
 * `ConfirmButton` treatment delete gets — a bulk field edit is reversible by
 * running it again, a bulk delete is not.
 */
export function BulkFieldDialog({
  label,
  title,
  description,
  applyLabel,
  canApply,
  busy,
  onApply,
  children,
}: {
  label: string;
  title: string;
  description: string;
  applyLabel: string;
  canApply: boolean;
  busy: boolean;
  onApply: () => void | Promise<void>;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" size="sm">
          {label}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-2">{children}</div>
        <div className="flex items-center justify-end gap-2">
          <Button
            type="button"
            variant="ghost"
            onClick={() => setOpen(false)}
            disabled={busy}
          >
            Cancel
          </Button>
          <Button
            type="button"
            disabled={!canApply || busy}
            onClick={async () => {
              await onApply();
              setOpen(false);
            }}
          >
            {busy ? "Applying…" : applyLabel}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
