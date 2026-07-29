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

/**
 * A named selection — "everything except X", "just the ones that Y".
 *
 * Presets live in the popover rather than as another control in the filter bar
 * because they *are* the selection: pressing one writes a concrete list into
 * `selected`, visible in the same "12 selected" summary as hand-picking would
 * be. Nothing about the filter afterwards remembers a preset was used, which is
 * the point — there is no second, invisible rule to reason about.
 */
export interface MultiSelectPreset {
  label: string;
  title?: string;
  /** Given every option, returns the selection to apply. */
  select: (options: string[]) => string[];
}

interface MultiSelectProps {
  label: string;
  options: string[];
  selected: string[];
  onChange: (values: string[]) => void;
  placeholder?: string;
  className?: string;
  presets?: MultiSelectPreset[];
}

export function MultiSelect({
  label,
  options,
  selected,
  onChange,
  placeholder = "All",
  className,
  presets,
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
            {presets && presets.length > 0 && (
              // Its own row rather than crowding in beside Select/Deselect all:
              // a preset name is a phrase, not a verb, and the two kinds of
              // action read as one undifferentiated strip of buttons together.
              // Search does not narrow a preset — it computes over every option
              // on purpose, so "Common spending" means the same thing whether
              // or not you happen to be typing.
              <div
                className="flex flex-wrap items-center gap-1 border-b border-border px-2 py-1.5"
                onKeyDown={(e) => e.stopPropagation()}
              >
                {presets.map((preset) => (
                  <Button
                    key={preset.label}
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-6 px-2"
                    title={preset.title}
                    onClick={() => onChange(preset.select(options))}
                  >
                    {preset.label}
                  </Button>
                ))}
              </div>
            )}
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
