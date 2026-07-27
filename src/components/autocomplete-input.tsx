"use client";

import { useId, useMemo, useState } from "react";
import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";

/**
 * Free-text input with a suggestion list underneath.
 *
 * Replaces a native `<datalist>`: Chrome renders that through the same popup as
 * autofill, which makes it inconsistent about opening on the first click and
 * about staying open long enough to click an entry.
 *
 * The input itself stays uncontrolled so react-hook-form's `register` can own
 * it — `query` is the current field value, passed in only to filter the list,
 * and `onPick` is where the caller writes the chosen value back (`setValue`).
 */
export function AutocompleteInput({
  query,
  suggestions,
  onPick,
  limit = 8,
  onFocus,
  onBlur,
  onKeyDown,
  ...props
}: Omit<ComponentProps<typeof Input>, "value" | "defaultValue"> & {
  query: string;
  suggestions: string[];
  onPick: (value: string) => void;
  limit?: number;
}) {
  const listId = `${useId()}-suggestions`;
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(-1);

  const trimmed = query.trim().toLowerCase();
  const matches = useMemo(
    () =>
      (trimmed
        ? suggestions.filter((s) => s.toLowerCase().includes(trimmed))
        : suggestions
      ).slice(0, limit),
    [suggestions, trimmed, limit],
  );

  // Nothing left to offer once what's typed is already the only match.
  const exhausted =
    matches.length === 1 && matches[0]?.toLowerCase() === trimmed;
  const show = open && matches.length > 0 && !exhausted;

  function pick(value: string) {
    onPick(value);
    setOpen(false);
    setHighlight(-1);
  }

  return (
    <div className="relative">
      <Input
        {...props}
        autoComplete="off"
        role="combobox"
        aria-expanded={show}
        aria-autocomplete="list"
        aria-controls={show ? listId : undefined}
        aria-activedescendant={
          show && highlight >= 0 ? `${listId}-${highlight}` : undefined
        }
        onFocus={(e) => {
          setOpen(true);
          setHighlight(-1);
          onFocus?.(e);
        }}
        onBlur={(e) => {
          setOpen(false);
          onBlur?.(e);
        }}
        onKeyDown={(e) => {
          onKeyDown?.(e);
          if (e.key === "Escape") {
            // Don't let it reach the surrounding dialog, which would close the
            // whole quick-add modal instead of just this list.
            if (show) {
              e.stopPropagation();
              setOpen(false);
            }
            return;
          }
          if (!show) return;
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setHighlight((h) => (h + 1) % matches.length);
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setHighlight((h) => (h <= 0 ? matches.length : h) - 1);
          } else if (e.key === "Enter" && highlight >= 0) {
            // Only swallow Enter while a suggestion is highlighted — otherwise
            // it still has to submit the form.
            e.preventDefault();
            const choice = matches[highlight];
            if (choice) pick(choice);
          }
        }}
      />
      {show && (
        <ul
          id={listId}
          role="listbox"
          className="absolute z-50 mt-1 max-h-56 w-full overflow-y-auto rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-md"
        >
          {matches.map((s, i) => (
            <li
              key={s}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === highlight}
              title={s}
              // Cancel the mousedown so the input doesn't blur — and close the
              // list — before the click lands on the entry.
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => pick(s)}
              onMouseEnter={() => setHighlight(i)}
              className={cn(
                "flex cursor-pointer items-center rounded-sm px-2 py-1.5 text-sm",
                i === highlight && "bg-accent text-accent-foreground",
              )}
            >
              <span className="truncate">{s}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
