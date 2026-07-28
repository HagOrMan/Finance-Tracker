"use client";

import { useMemo, useState } from "react";
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

interface MultiSelectProps {
  label: string;
  options: string[];
  selected: string[];
  onChange: (values: string[]) => void;
  placeholder?: string;
  className?: string;
}

export function MultiSelect({
  label,
  options,
  selected,
  onChange,
  placeholder = "All",
  className,
}: MultiSelectProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  // Filtering happens here rather than inside cmdk (`shouldFilter={false}`) so
  // "Select all" / "Deselect all" act on exactly the rows currently on screen —
  // cmdk's own fuzzy match would otherwise diverge from what we can compute.
  const query = search.trim().toLowerCase();
  const visible = useMemo(
    () => (query ? options.filter((o) => o.toLowerCase().includes(query)) : options),
    [options, query],
  );

  const selectedSet = new Set(selected);
  const allVisibleSelected =
    visible.length > 0 && visible.every((o) => selectedSet.has(o));
  const canDeselect = query
    ? visible.some((o) => selectedSet.has(o))
    : selected.length > 0;

  function toggle(value: string) {
    if (selectedSet.has(value)) {
      onChange(selected.filter((v) => v !== value));
    } else {
      onChange([...selected, value]);
    }
  }

  function selectAll() {
    onChange([...new Set([...selected, ...visible])]);
  }

  function deselectAll() {
    // Unsearched, this clears the filter outright — including any persisted
    // values that are no longer in `options`. While searching it only drops
    // what's on screen, leaving the rest of the selection alone.
    if (query) {
      const visibleSet = new Set(visible);
      onChange(selected.filter((v) => !visibleSet.has(v)));
    } else {
      onChange([]);
    }
  }

  const summary =
    selected.length === 0
      ? placeholder
      : selected.length === 1
        ? selected[0]
        : `${selected.length} selected`;

  return (
    <div className={cn("flex flex-col gap-1", className)}>
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <Popover
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) setSearch("");
        }}
      >
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={open}
            title={selected.length ? selected.join(", ") : placeholder}
            className="w-full justify-between font-normal"
          >
            <span className="min-w-0 truncate">{summary}</span>
            <ChevronsUpDown className="opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          className="w-auto min-w-(--radix-popover-trigger-width) max-w-80 p-0"
          align="start"
        >
          <Command shouldFilter={false}>
            <CommandInput
              placeholder={`Search ${label.toLowerCase()}…`}
              value={search}
              onValueChange={setSearch}
            />
            <div
              className="flex items-center justify-between gap-2 border-b border-border px-2 py-1.5"
              // cmdk's root handles Enter/arrows for the whole subtree; without
              // this, Enter on a focused button would also toggle the option
              // cmdk has highlighted in the list below.
              onKeyDown={(e) => e.stopPropagation()}
            >
              <span className="text-xs whitespace-nowrap text-muted-foreground">
                {selected.length}/{options.length} selected
              </span>
              <div className="flex items-center gap-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-6 px-2"
                  disabled={allVisibleSelected}
                  onClick={selectAll}
                  title={
                    query
                      ? `Select the ${visible.length} matching options`
                      : `Select all ${options.length} options`
                  }
                >
                  Select all
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-6 px-2"
                  disabled={!canDeselect}
                  onClick={deselectAll}
                  title={
                    query
                      ? "Deselect the matching options"
                      : "Deselect everything (clears this filter)"
                  }
                >
                  Deselect all
                </Button>
              </div>
            </div>
            <CommandList>
              {visible.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  No results.
                </p>
              ) : (
                <CommandGroup>
                  {visible.map((option) => (
                    <CommandItem key={option} onSelect={() => toggle(option)}>
                      <Check
                        className={cn(
                          "mr-2 size-4",
                          selectedSet.has(option) ? "opacity-100" : "opacity-0",
                        )}
                      />
                      <span className="min-w-0 truncate" title={option}>
                        {option}
                      </span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
}
