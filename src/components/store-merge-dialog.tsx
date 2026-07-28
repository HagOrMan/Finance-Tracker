"use client";

import { useState } from "react";
import { Merge } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { DuplicateReason } from "@/lib/name-groups";

/**
 * One side of a proposed merge, reduced to the four things the dialog needs.
 * `StoreGroup` and `EntityGroup` both narrow to this, which is what lets one
 * dialog serve both tabs (FEATURES.md §4.7 — "generic over field").
 */
export interface MergeSide {
  key: string;
  displayName: string;
  spellings: string[];
  ids: number[];
  count: number;
}

const REASON_TEXT: Record<DuplicateReason, string> = {
  "same-key": "these normalize to the same name",
  contains: "one name contains the other",
  near: "the names differ by a character or two",
};

/**
 * The merge confirmation for a duplicate-name pair.
 *
 * Kept deliberately dumb: it decides *what name wins* and hands the caller a
 * target plus an id list. The caller owns the write, because a store merge and
 * an entity merge hit different endpoints with different patch shapes.
 *
 * Every row from **both** sides is rewritten, not just the losing side's. That
 * is intentional — a group can hold several raw spellings (`"Netflix"`,
 * `" netflix "`), and a merge is the natural moment to normalize all of them to
 * one string rather than leaving the winner's own variants behind.
 */
export function NameMergeDialog({
  open,
  onOpenChange,
  noun,
  a,
  b,
  reason,
  busy = false,
  onMerge,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** "store" or "entity" — used verbatim in the copy. */
  noun: string;
  a: MergeSide;
  b: MergeSide;
  reason: DuplicateReason;
  busy?: boolean;
  onMerge: (target: string, ids: number[]) => Promise<void> | void;
}) {
  const [choice, setChoice] = useState<"a" | "b" | "custom">(
    // Default to the name with more rows behind it — fewer writes, and the
    // more-used spelling is usually the one you meant.
    a.count >= b.count ? "a" : "b",
  );
  const [custom, setCustom] = useState("");

  const target =
    choice === "a" ? a.displayName : choice === "b" ? b.displayName : custom.trim();
  const ids = [...new Set([...a.ids, ...b.ids])];
  const canMerge = target.length > 0 && !busy;

  const options: { id: "a" | "b"; side: MergeSide }[] = [
    { id: "a", side: a },
    { id: "b", side: b },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Merge {noun}s</DialogTitle>
          <DialogDescription>
            Flagged because {REASON_TEXT[reason]}. Pick the name to keep — all{" "}
            {ids.length} {noun === "store" ? "receipts" : "disbursements"} from
            both will be rewritten to it.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-2">
          {options.map(({ id, side }) => (
            <button
              key={id}
              type="button"
              onClick={() => setChoice(id)}
              className={cn(
                "flex cursor-pointer flex-col items-start gap-0.5 rounded-md border p-3 text-left transition-colors",
                choice === id
                  ? "border-primary bg-primary/5"
                  : "border-border hover:bg-accent",
              )}
            >
              <span className="text-sm font-medium text-foreground">
                {side.displayName}
              </span>
              <span className="text-xs text-muted-foreground">
                {side.count} row{side.count === 1 ? "" : "s"}
                {side.spellings.length > 1 &&
                  ` · also spelled ${side.spellings
                    .filter((s) => s !== side.displayName)
                    .map((s) => `"${s}"`)
                    .join(", ")}`}
              </span>
            </button>
          ))}

          {/* A plain div, not a third option button: it holds an Input, and an
              interactive element inside a <button> is invalid HTML. Focusing or
              typing in the field is what selects this choice. */}
          <div
            className={cn(
              "flex flex-col gap-2 rounded-md border p-3 transition-colors",
              choice === "custom" ? "border-primary bg-primary/5" : "border-border",
            )}
          >
            <Label htmlFor="merge-custom" className="text-sm font-medium">
              Use a different name
            </Label>
            <Input
              id="merge-custom"
              value={custom}
              placeholder={`New ${noun} name`}
              onFocus={() => setChoice("custom")}
              onChange={(e) => {
                setCustom(e.target.value);
                setChoice("custom");
              }}
            />
          </div>
        </div>

        <p className="text-xs text-muted-foreground">
          This rewrites {ids.length} row{ids.length === 1 ? "" : "s"} and cannot
          be undone. No amounts change
          {noun === "entity" &&
            " — refund links are foreign keys, not names, so nothing recalculates"}
          .
        </p>

        <div className="flex items-center justify-end gap-2">
          <Button
            type="button"
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={busy}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            disabled={!canMerge}
            onClick={() => onMerge(target, ids)}
          >
            <Merge />
            {busy ? "Merging…" : `Merge into “${target || "…"}”`}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
