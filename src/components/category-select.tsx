"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CATEGORY_OPTIONS } from "@/lib/data/types";

function isKnownCategory(value: string): boolean {
  return (CATEGORY_OPTIONS as readonly string[]).includes(value);
}

/**
 * The 12-option category picker, factored out of `quick-add-modal.tsx` now that
 * the receipt editor needs the same control.
 *
 * Fully controlled: callers own the value, which is what lets react-hook-form
 * keep it in form state via `setValue` rather than `register`.
 *
 * **No free-text escape hatch.** There used to be an "Other (type your own)"
 * item that swapped the select for an input; it's gone, because a category
 * typed by hand is a category that only ever holds one receipt and shows up as
 * its own colour and its own bar everywhere. `CATEGORY_OPTIONS` already ends in
 * a literal "Other", which is where a one-off belongs.
 *
 * Categories are still free text in the *database* — the list is a convenience,
 * not a constraint — so a row whose category isn't on the list keeps it: the
 * value is injected as an extra item rather than rendering as "nothing
 * selected" and getting overwritten on the next save.
 */
export function CategorySelect({
  id,
  value,
  onChange,
  className,
}: {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  className?: string;
}) {
  const offList = value !== "" && !isKnownCategory(value);

  return (
    <Select
      // "" (not undefined) for "nothing picked yet": Radix shows the
      // placeholder for both, but undefined makes the Select uncontrolled
      // until the first pick, which React warns about on the switch.
      value={value}
      onValueChange={onChange}
    >
      <SelectTrigger id={id} className={className ?? "w-full"}>
        <SelectValue placeholder="Select a category" />
      </SelectTrigger>
      <SelectContent>
        {/* An existing off-list value, preserved so opening and saving a row
            can't silently rewrite its category. Not selectable back once
            you've picked something else — that's the point. */}
        {offList && <SelectItem value={value}>{value}</SelectItem>}
        {CATEGORY_OPTIONS.map((c) => (
          <SelectItem key={c} value={c}>
            {c}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
