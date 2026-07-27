"use client";

import { useRef, useState } from "react";

import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CATEGORY_OPTIONS } from "@/lib/data/types";

const OTHER = "__other__";

function isKnownCategory(value: string): boolean {
  return (CATEGORY_OPTIONS as readonly string[]).includes(value);
}

/**
 * The 12-option category picker with its free-text escape hatch, factored out
 * of `quick-add-modal.tsx` now that the receipt editor needs the same control.
 *
 * Fully controlled: callers own the value, which is what lets react-hook-form
 * keep it in form state via `setValue` rather than `register`.
 *
 * Categories are free text in the database, not an enum — the list is a
 * convenience, not a constraint. So a row whose category isn't on the list
 * opens straight into the text input with its real value, instead of silently
 * rendering as "nothing selected" and getting overwritten on the next save.
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
  // Captured on first render only. Focus should follow a deliberate switch to
  // "Other", not the mere fact that an existing row has an off-list category.
  const startedCustom = useRef(value !== "" && !isKnownCategory(value)).current;
  const [custom, setCustom] = useState(startedCustom);

  if (custom) {
    return (
      <Input
        id={id}
        className={className}
        placeholder="Category"
        autoFocus={!startedCustom}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    );
  }

  return (
    <Select
      // "" (not undefined) for "nothing picked yet": Radix shows the
      // placeholder for both, but undefined makes the Select uncontrolled
      // until the first pick, which React warns about on the switch.
      value={isKnownCategory(value) ? value : ""}
      onValueChange={(v) => {
        if (v === OTHER) {
          setCustom(true);
          onChange("");
        } else {
          onChange(v);
        }
      }}
    >
      <SelectTrigger id={id} className={className ?? "w-full"}>
        <SelectValue placeholder="Select a category" />
      </SelectTrigger>
      <SelectContent>
        {CATEGORY_OPTIONS.map((c) => (
          <SelectItem key={c} value={c}>
            {c}
          </SelectItem>
        ))}
        <SelectItem value={OTHER}>Other (type your own)</SelectItem>
      </SelectContent>
    </Select>
  );
}
