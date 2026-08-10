"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronsUpDown } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import type { MergedReceipt } from "@/lib/data/types";

/** Enough to pick from; short enough that the list stays fast on a phone. */
const MAX_RESULTS = 50;

function receiptLabel(r: MergedReceipt) {
  return `${r.date} · ${r.store} · $${r.price.toFixed(2)}`;
}

/**
 * "Refund of receipt" picker, shared by `quick-add-modal.tsx` and
 * `disbursement-editor.tsx` — both of which render it *inside* a Dialog or a
 * vaul Drawer, which is where all three of its non-obvious details come from:
 *
 * - **`modal` on the Popover is load-bearing.** The surrounding Dialog/Drawer
 *   holds a `react-remove-scroll` lock, and only the topmost lock on the stack
 *   handles wheel/touch events. The popover portals to `<body>`, i.e. outside
 *   that lock, so without a lock of its own every wheel tick and every touch
 *   drag over the list was cancelled — the scrollbar could still be dragged,
 *   which is what made it look like a styling problem rather than a scroll one.
 * - **Filtering is ours, not cmdk's** (`shouldFilter={false}`). cmdk keeps every
 *   receipt mounted and re-scores the lot on each keystroke; with a few thousand
 *   rows that is slow on mobile, and the surviving list stayed tall enough to
 *   hold a stale scroll offset, so the best match sat off-screen above you.
 *   Matching here and capping at {@link MAX_RESULTS} keeps the list short.
 * - **The scroll offset is reset by hand** on every query change. Shrinking the
 *   list clamps `scrollTop` rather than zeroing it, so a second keystroke could
 *   still leave you part-way down.
 */
export function ReceiptLinkCombobox({
  receipts,
  value,
  onChange,
  className,
}: {
  receipts: MergedReceipt[] | undefined;
  value: number | null | undefined;
  onChange: (id: number | null) => void;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const listRef = useRef<HTMLDivElement>(null);

  const linked = receipts?.find((r) => r.id === value);

  // Newest-first from the API, and every match keeps that order — the receipt
  // you are refunding is nearly always a recent one.
  const matches = useMemo(() => {
    const tokens = query.toLowerCase().split(/\s+/).filter(Boolean);
    if (tokens.length === 0) return receipts ?? [];
    return (receipts ?? []).filter((r) => {
      const haystack = `${r.date} ${r.store} ${r.category}`.toLowerCase();
      return tokens.every((t) => haystack.includes(t));
    });
  }, [receipts, query]);

  const shown = matches.slice(0, MAX_RESULTS);

  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = 0;
  }, [query]);

  const label = linked ? receiptLabel(linked) : "Not linked to a receipt";

  return (
    <Popover
      modal
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        // A stale query — and its scroll position — shouldn't greet you the
        // next time the picker opens.
        setQuery("");
      }}
    >
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          title={label}
          className={cn("w-full justify-between font-normal", className)}
        >
          <span className="min-w-0 truncate">{label}</span>
          <ChevronsUpDown className="opacity-50" />
        </Button>
      </PopoverTrigger>
      {/* Not a flat 320px: that overflows the screen edge on a narrow phone
          once the drawer's own padding is accounted for. */}
      <PopoverContent
        className="w-[min(20rem,calc(100vw-2rem))] p-0"
        align="start"
      >
        <Command shouldFilter={false}>
          <CommandInput
            placeholder="Search receipts…"
            value={query}
            onValueChange={setQuery}
          />
          <CommandList ref={listRef} className="overscroll-contain">
            <CommandGroup>
              <CommandItem
                value="__unlinked__"
                onSelect={() => {
                  onChange(null);
                  setOpen(false);
                }}
              >
                <Check
                  className={cn(
                    "mr-2 size-4",
                    value == null ? "opacity-100" : "opacity-0",
                  )}
                />
                Not linked
              </CommandItem>
              {shown.map((r) => (
                <CommandItem
                  key={r.id}
                  value={String(r.id)}
                  onSelect={() => {
                    onChange(r.id);
                    setOpen(false);
                  }}
                >
                  <Check
                    className={cn(
                      "mr-2 size-4",
                      value === r.id ? "opacity-100" : "opacity-0",
                    )}
                  />
                  <span className="min-w-0 truncate" title={receiptLabel(r)}>
                    {receiptLabel(r)}
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
            {shown.length === 0 && (
              <p className="py-6 text-center text-sm text-muted-foreground">
                No receipts found.
              </p>
            )}
            {/* Say the list was cut off rather than letting it read as "that's
                everything" — a common store name easily matches more than 50. */}
            {matches.length > shown.length && (
              <p className="border-t border-border px-2 py-2 text-center text-xs text-muted-foreground">
                Showing the {MAX_RESULTS} newest of {matches.length} matches —
                keep typing to narrow.
              </p>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
