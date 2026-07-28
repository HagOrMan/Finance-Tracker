"use client";

import { useMemo, useState } from "react";
import { Pencil } from "lucide-react";
import { toast } from "sonner";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { CategoryMixBar } from "@/components/category-mix-bar";
import { CategorySelect } from "@/components/category-select";
import { ConfirmButton } from "@/components/confirm-button";
import { ReceiptEditor } from "@/components/receipt-editor";
import { useBulkUpdateReceipts } from "@/hooks/use-finance-data";
import { useMediaQuery } from "@/hooks/use-media-query";
import type { MergedReceipt, UpdateReceiptInput } from "@/lib/data/types";
import { formatCurrency } from "@/lib/format";
import {
  receiptIdsOutsideCategory,
  storeReceipts,
  type StoreGroup,
} from "@/lib/stores";

/** Matches `bulkUpdateReceiptsSchema`'s id-list cap — see FEATURES.md §3.3. */
const BULK_ID_LIMIT = 1000;

/**
 * The store drill-down (FEATURES.md §4.5). Dialog on desktop, Drawer on mobile,
 * matching `receipt-editor.tsx` and `quick-add-modal.tsx`.
 *
 * The bulk bar is the reason the page exists: recategorize, rename and merge
 * are all one `PATCH /api/receipts/bulk` with a different id list (D7). The
 * receipt list below it is the escape hatch for the rows bulk can't express,
 * and each row opens the Phase 0 `ReceiptEditor`.
 */
export function StoreDetailModal({
  group,
  receipts,
  allGroups,
  colorMap,
  open,
  onOpenChange,
}: {
  group: StoreGroup;
  /** Every receipt — the modal derives its own rows so the parent needn't. */
  receipts: MergedReceipt[];
  /** Merge targets. Includes `group`, which is filtered out below. */
  allGroups: StoreGroup[];
  colorMap: Record<string, string>;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const isDesktop = useMediaQuery("(min-width: 640px)");
  const title = group.displayName;
  const subtitle = `${group.receiptCount} receipt${
    group.receiptCount === 1 ? "" : "s"
  } · ${group.firstDate} – ${group.lastDate} · ${formatCurrency(group.net)} net`;

  // `key` so switching stores while the modal is mounted rebuilds the bulk-bar
  // state (armed confirmations, the rename box) against the new store rather
  // than carrying the previous one's half-finished action over.
  const body = (
    <StoreDetailBody
      key={group.key}
      group={group}
      receipts={receipts}
      allGroups={allGroups}
      colorMap={colorMap}
      onClose={() => onOpenChange(false)}
    />
  );

  if (isDesktop) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle className="truncate" title={title}>
              {title}
            </DialogTitle>
            <DialogDescription>{subtitle}</DialogDescription>
          </DialogHeader>
          {body}
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle className="truncate" title={title}>
            {title}
          </DrawerTitle>
          <DrawerDescription>{subtitle}</DrawerDescription>
        </DrawerHeader>
        <div className="overflow-y-auto px-4 pb-6">{body}</div>
      </DrawerContent>
    </Drawer>
  );
}

function StoreDetailBody({
  group,
  receipts,
  allGroups,
  colorMap,
  onClose,
}: {
  group: StoreGroup;
  receipts: MergedReceipt[];
  allGroups: StoreGroup[];
  colorMap: Record<string, string>;
  onClose: () => void;
}) {
  const bulkUpdate = useBulkUpdateReceipts();

  const [armed, setArmed] = useState<string | null>(null);
  const [scope, setScope] = useState<"all" | "minority">(
    group.minorityCount > 0 ? "minority" : "all",
  );
  const [category, setCategory] = useState("");
  const [rename, setRename] = useState(group.displayName);
  const [mergeKey, setMergeKey] = useState("");
  const [editing, setEditing] = useState<MergedReceipt | null>(null);

  const rows = useMemo(
    () => storeReceipts(receipts, group),
    [receipts, group],
  );
  const minorityIds = useMemo(
    () => receiptIdsOutsideCategory(receipts, group, group.dominantCategory),
    [receipts, group],
  );
  const mergeTargets = useMemo(
    () =>
      allGroups
        // `g.key !== ""` guards a legacy row with a blank store name: Radix
        // throws on a `SelectItem` whose value is the empty string, which would
        // take the whole modal down rather than degrade.
        .filter((g) => g.key !== group.key && g.key !== "")
        .sort((a, b) => a.displayName.localeCompare(b.displayName)),
    [allGroups, group.key],
  );

  const scopeIds = scope === "all" ? group.receiptIds : minorityIds;

  /**
   * One write path for all three actions. Every one of them rewrites rows in
   * bulk with no undo, hence the confirm click in front and the affected count
   * in the button label.
   */
  async function runBulk(
    ids: number[],
    patch: UpdateReceiptInput,
    describe: (updated: number) => string,
    closeAfter: boolean,
  ) {
    if (ids.length === 0) return;
    if (ids.length > BULK_ID_LIMIT) {
      toast.error(
        `That's ${ids.length} receipts — the bulk endpoint caps at ${BULK_ID_LIMIT}. Narrow it down first.`,
      );
      return;
    }
    try {
      const result = await bulkUpdate.mutateAsync({ ids, patch });
      toast.success(describe(result.updated));
      if (closeAfter) onClose();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Bulk update failed",
      );
    }
  }

  const renameTrimmed = rename.trim();
  const renameChanged =
    renameTrimmed.length > 0 && renameTrimmed !== group.displayName;
  const mergeTarget = mergeTargets.find((g) => g.key === mergeKey);
  const busy = bulkUpdate.isPending;

  return (
    <div className="mt-2 flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Receipts" value={String(group.receiptCount)} />
        <Stat label="Gross" value={formatCurrency(group.gross)} />
        <Stat label="Net paid" value={formatCurrency(group.net)} />
        <Stat
          label="Categories"
          value={String(group.categories.length)}
          tone={group.isInconsistent ? "warn" : undefined}
        />
      </div>

      <CategoryMixBar
        segments={group.categories}
        colorMap={colorMap}
        showLegend
      />

      {group.spellings.length > 1 && (
        <p className="text-xs text-muted-foreground">
          Spelled {group.spellings.length} ways in the data:{" "}
          {group.spellings.map((s) => `"${s}"`).join(", ")}. A rename below
          normalizes all of them.
        </p>
      )}

      <Separator />

      <section className="flex flex-col gap-4">
        <h3 className="text-sm font-medium text-foreground">Bulk actions</h3>

        {/* --- Recategorize -------------------------------------------- */}
        <div className="flex flex-col gap-2 rounded-md border border-border p-3">
          <Label className="text-xs text-muted-foreground">Recategorize</Label>
          <div className="flex flex-wrap gap-1">
            <ScopeButton
              active={scope === "all"}
              onClick={() => {
                setScope("all");
                setArmed(null);
              }}
            >
              All {group.receiptCount}
            </ScopeButton>
            <ScopeButton
              active={scope === "minority"}
              disabled={group.minorityCount === 0}
              onClick={() => {
                setScope("minority");
                setArmed(null);
              }}
            >
              {group.minorityCount === 0
                ? "Nothing off-category"
                : `Only the ${group.minorityCount} not in "${group.dominantCategory}"`}
            </ScopeButton>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="min-w-56 flex-1">
              <CategorySelect
                id="store-bulk-category"
                value={category}
                onChange={(v) => {
                  setCategory(v);
                  setArmed(null);
                }}
              />
            </div>
            <ConfirmButton
              id="recategorize"
              armed={armed}
              setArmed={setArmed}
              disabled={busy || !category || scopeIds.length === 0}
              label={`Set ${scopeIds.length} receipt${scopeIds.length === 1 ? "" : "s"}`}
              confirmLabel={`Confirm — rewrite ${scopeIds.length}`}
              onRun={() =>
                runBulk(
                  scopeIds,
                  { category },
                  (n) => `${n} receipt${n === 1 ? "" : "s"} set to ${category}`,
                  false,
                )
              }
            />
          </div>
        </div>

        {/* --- Rename --------------------------------------------------- */}
        <div className="flex flex-col gap-2 rounded-md border border-border p-3">
          <Label htmlFor="store-rename" className="text-xs text-muted-foreground">
            Rename store
          </Label>
          <div className="flex flex-wrap items-center gap-2">
            <Input
              id="store-rename"
              value={rename}
              onChange={(e) => {
                setRename(e.target.value);
                setArmed(null);
              }}
              className="min-w-56 flex-1"
            />
            <ConfirmButton
              id="rename"
              armed={armed}
              setArmed={setArmed}
              disabled={busy || !renameChanged}
              label={`Rename ${group.receiptCount} receipt${group.receiptCount === 1 ? "" : "s"}`}
              confirmLabel={`Confirm — rename ${group.receiptCount}`}
              onRun={() =>
                runBulk(
                  group.receiptIds,
                  { store: renameTrimmed },
                  (n) => `${n} receipt${n === 1 ? "" : "s"} renamed to ${renameTrimmed}`,
                  // The group's key changes under us, so the modal has nothing
                  // left to show — close rather than render a stale row.
                  true,
                )
              }
            />
          </div>
        </div>

        {/* --- Merge ----------------------------------------------------- */}
        <div className="flex flex-col gap-2 rounded-md border border-border p-3">
          <Label className="text-xs text-muted-foreground">
            Merge into another store
          </Label>
          <div className="flex flex-wrap items-center gap-2">
            <Select
              value={mergeKey}
              onValueChange={(v) => {
                setMergeKey(v);
                setArmed(null);
              }}
            >
              <SelectTrigger className="min-w-56 flex-1">
                <SelectValue placeholder="Pick a store…" />
              </SelectTrigger>
              <SelectContent>
                {mergeTargets.map((g) => (
                  <SelectItem key={g.key} value={g.key}>
                    {g.displayName} ({g.receiptCount})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <ConfirmButton
              id="merge"
              armed={armed}
              setArmed={setArmed}
              disabled={busy || !mergeTarget}
              label="Merge"
              confirmLabel={`Confirm — move ${group.receiptCount} to "${mergeTarget?.displayName ?? ""}"`}
              onRun={() =>
                runBulk(
                  group.receiptIds,
                  { store: mergeTarget?.displayName ?? "" },
                  (n) =>
                    `${n} receipt${n === 1 ? "" : "s"} merged into ${mergeTarget?.displayName}`,
                  true,
                )
              }
            />
          </div>
        </div>
      </section>

      <Separator />

      <section className="flex flex-col gap-2">
        <h3 className="text-sm font-medium text-foreground">
          Receipts ({rows.length})
        </h3>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Category</TableHead>
              <TableHead className="text-right">Price</TableHead>
              <TableHead className="text-right">Net</TableHead>
              <TableHead>Note</TableHead>
              <TableHead className="w-9" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow
                key={r.id}
                className={cn(
                  "cursor-pointer",
                  group.isInconsistent &&
                    r.category !== group.dominantCategory &&
                    "bg-destructive/5",
                )}
                onClick={() => setEditing(r)}
              >
                <TableCell>{r.date}</TableCell>
                <TableCell>{r.category}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatCurrency(r.price)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatCurrency(r.actual_price)}
                </TableCell>
                <TableCell className="max-w-40 truncate" title={r.note ?? ""}>
                  {r.note ?? ""}
                </TableCell>
                <TableCell>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-7"
                    aria-label={`Edit receipt from ${r.date}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      setEditing(r);
                    }}
                  >
                    <Pencil className="size-3.5" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </section>

      {editing && (
        <ReceiptEditor
          receipt={editing}
          open
          onOpenChange={(next) => {
            if (!next) setEditing(null);
          }}
        />
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "warn";
}) {
  return (
    <div className="rounded-md border border-border bg-card p-2">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div
        className={cn(
          "text-base font-semibold tabular-nums",
          tone === "warn" ? "text-destructive" : "text-foreground",
        )}
      >
        {value}
      </div>
    </div>
  );
}

function ScopeButton({
  active,
  disabled,
  onClick,
  children,
}: {
  active: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <Button
      type="button"
      size="sm"
      variant={active ? "secondary" : "ghost"}
      disabled={disabled}
      onClick={onClick}
      className={cn(active && "ring-1 ring-primary")}
    >
      {children}
    </Button>
  );
}
