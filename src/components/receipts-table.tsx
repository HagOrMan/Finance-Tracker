"use client";

import { useMemo, useState } from "react";
import { Pencil } from "lucide-react";
import { toast } from "sonner";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AutocompleteInput } from "@/components/autocomplete-input";
import { CategorySelect } from "@/components/category-select";
import { ConfirmButton } from "@/components/confirm-button";
import { MultiSelect } from "@/components/multi-select";
import { ReceiptEditor } from "@/components/receipt-editor";
import {
  BulkFieldDialog,
  SelectionActionBar,
} from "@/components/selection-action-bar";
import {
  useBulkUpdateReceipts,
  useDeleteReceipt,
} from "@/hooks/use-finance-data";
import { deleteSequentially } from "@/lib/bulk-delete";
import { formatCurrency } from "@/lib/format";
import { buildStoreGroups } from "@/lib/stores";
import type { MergedReceipt } from "@/lib/data/types";

/**
 * The receipts table, in two modes.
 *
 * Read-only by default — `/`, `/daily` and `/monthly` pass neither new prop and
 * are unaffected. `/manage` turns on `editable` (per-row edit button, a "last
 * edited" column, the subscription badge) and `selectable` (checkbox column
 * plus the bulk action bar). FEATURES.md §5 is explicit that this is extended
 * rather than forked: one table, one set of filters, one place to fix.
 */
export function ReceiptsTable({
  receipts,
  priceKey,
  priceLabel,
  showDiscountColumns = false,
  limit,
  editable = false,
  selectable = false,
}: {
  receipts: MergedReceipt[];
  /** Which column the `priceLabel` header actually reflects — "price" (gross) or "actual_price" (net). */
  priceKey: "price" | "actual_price";
  priceLabel: string;
  showDiscountColumns?: boolean;
  limit?: number;
  /** Per-row edit button, "last edited" column, subscription badge. */
  editable?: boolean;
  /** Checkbox column and the bulk selection action bar. */
  selectable?: boolean;
}) {
  const [category, setCategory] = useState<string[]>([]);
  const [store, setStore] = useState<string[]>([]);
  const [noteSearch, setNoteSearch] = useState("");

  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [editing, setEditing] = useState<MergedReceipt | null>(null);
  const [bulkCategory, setBulkCategory] = useState("");
  const [bulkStore, setBulkStore] = useState("");
  const [armed, setArmed] = useState<string | null>(null);

  const bulkUpdate = useBulkUpdateReceipts();
  const deleteReceipt = useDeleteReceipt();

  const categoryOptions = useMemo(
    () => [...new Set(receipts.map((r) => r.category))].sort(),
    [receipts],
  );
  const storeOptions = useMemo(
    () => [...new Set(receipts.map((r) => r.store))].sort(),
    [receipts],
  );
  // Canonical spellings for the bulk "set store" field, matching quick-add and
  // the Stores page — picking a suggestion can't reintroduce a variant.
  const storeSuggestions = useMemo(
    () => buildStoreGroups(receipts).map((g) => g.displayName).sort(),
    [receipts],
  );

  let filtered = receipts
    .filter((r) => (category.length ? category.includes(r.category) : true))
    .filter((r) => (store.length ? store.includes(r.store) : true))
    .filter((r) =>
      noteSearch
        ? (r.note ?? "").toLowerCase().includes(noteSearch.toLowerCase())
        : true,
    )
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : b.id - a.id));

  if (limit) filtered = filtered.slice(0, limit);

  const colSpan =
    7 +
    (showDiscountColumns ? 2 : 0) +
    (selectable ? 1 : 0) +
    (editable ? 2 : 0);

  // Selection is by id and survives a filter change — you can select a few
  // rows, refine the filter, select a few more, and act on all of them.
  const selectedIds = [...selected];
  const allFilteredSelected =
    filtered.length > 0 && filtered.every((r) => selected.has(r.id));
  const someFilteredSelected =
    !allFilteredSelected && filtered.some((r) => selected.has(r.id));

  function toggleRow(id: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    setArmed(null);
  }

  function toggleAllFiltered() {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allFilteredSelected) filtered.forEach((r) => next.delete(r.id));
      else filtered.forEach((r) => next.add(r.id));
      return next;
    });
    setArmed(null);
  }

  async function applyPatch(patch: { category: string } | { store: string }) {
    try {
      const result = await bulkUpdate.mutateAsync({
        ids: selectedIds,
        patch,
      });
      toast.success(
        `${result.updated} receipt${result.updated === 1 ? "" : "s"} updated`,
      );
      setSelected(new Set());
      setBulkCategory("");
      setBulkStore("");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Bulk update failed");
    }
  }

  async function deleteSelected() {
    const { deleted, failed } = await deleteSequentially(selectedIds, (id) =>
      deleteReceipt.mutateAsync(id),
    );
    if (deleted.length > 0) {
      toast.success(
        `${deleted.length} receipt${deleted.length === 1 ? "" : "s"} deleted`,
      );
    }
    if (failed.length > 0) {
      // Almost always the 409 delete guard: a refund points at the receipt.
      toast.error(
        `${failed.length} couldn't be deleted — ${failed[0]?.message ?? ""}`,
      );
    }
    // Leave exactly the failures selected, so the bar now describes what's left
    // to deal with rather than clearing and hiding the problem.
    setSelected(new Set(failed.map((f) => f.id)));
  }

  const busy = bulkUpdate.isPending || deleteReceipt.isPending;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-3">
        <MultiSelect
          label="Filter by category"
          options={categoryOptions}
          selected={category}
          onChange={setCategory}
          className="w-50 max-sm:w-full"
        />
        <MultiSelect
          label="Filter by store"
          options={storeOptions}
          selected={store}
          onChange={setStore}
          className="w-50 max-sm:w-full"
        />
        <div className="flex min-w-50 flex-1 flex-col gap-1 max-sm:min-w-0 max-sm:basis-full">
          <span className="text-xs font-medium text-muted-foreground">
            Search notes
          </span>
          <Input
            value={noteSearch}
            onChange={(e) => setNoteSearch(e.target.value)}
            placeholder="type to search…"
          />
        </div>
      </div>

      {editable && (
        <p className="text-xs text-muted-foreground">
          Showing {filtered.length} of {receipts.length} receipts
          {selected.size > 0 && ` · ${selected.size} selected`}
        </p>
      )}

      <Table>
        <TableHeader>
          <TableRow>
            {selectable && (
              <TableHead className="w-9">
                <Checkbox
                  checked={
                    allFilteredSelected
                      ? true
                      : someFilteredSelected
                        ? "indeterminate"
                        : false
                  }
                  onCheckedChange={toggleAllFiltered}
                  aria-label="Select all matching receipts"
                />
              </TableHead>
            )}
            <TableHead>Date</TableHead>
            <TableHead>Store</TableHead>
            <TableHead>Category</TableHead>
            <TableHead className="text-right">Price</TableHead>
            <TableHead className="text-right">Refunded</TableHead>
            <TableHead className="text-right">{priceLabel}</TableHead>
            {showDiscountColumns && (
              <TableHead className="text-right">Discount</TableHead>
            )}
            {showDiscountColumns && (
              <TableHead className="text-right">Discount %</TableHead>
            )}
            <TableHead>Note</TableHead>
            {editable && <TableHead>Last edited</TableHead>}
            {/* Pinned to the right edge of the horizontal scroll container, so
                the edit affordance is reachable without scrolling a wide table
                all the way over. `bg-background` is required — a transparent
                sticky cell lets the columns underneath show through it. */}
            {editable && (
              <TableHead className="sticky right-0 w-9 border-l border-border bg-background" />
            )}
          </TableRow>
        </TableHeader>
        <TableBody>
          {filtered.map((r) => (
            <TableRow
              key={r.id}
              // Named group so the pinned cell below can mirror the row's own
              // hover / selected background instead of punching a
              // solid-coloured hole through it.
              className="group/row"
              data-state={selected.has(r.id) ? "selected" : undefined}
            >
              {selectable && (
                <TableCell>
                  <Checkbox
                    checked={selected.has(r.id)}
                    onCheckedChange={() => toggleRow(r.id)}
                    aria-label={`Select receipt from ${r.date}`}
                  />
                </TableCell>
              )}
              <TableCell>{r.date}</TableCell>
              <TableCell>
                {r.store}
                {editable && r.subscription_id != null && (
                  // Nothing sets subscription_id until Phase 3's migration, so
                  // this never renders yet. It links nowhere until
                  // /subscriptions exists — a badge pointing at a 404 is worse
                  // than a badge that only labels.
                  <Badge variant="secondary" className="ml-2" title="Generated by a subscription">
                    Sub
                  </Badge>
                )}
              </TableCell>
              <TableCell>{r.category}</TableCell>
              <TableCell className="text-right tabular-nums">
                {formatCurrency(r.price)}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {formatCurrency(r.total_refunded)}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {formatCurrency(r[priceKey])}
              </TableCell>
              {showDiscountColumns && (
                <TableCell className="text-right tabular-nums">
                  {formatCurrency(r.discount)}
                </TableCell>
              )}
              {showDiscountColumns && (
                <TableCell className="text-right tabular-nums">
                  {r.discount_percentage.toFixed(1)}%
                </TableCell>
              )}
              <TableCell className="max-w-60 truncate" title={r.note ?? ""}>
                {r.note ?? ""}
              </TableCell>
              {editable && (
                <TableCell className="text-xs text-muted-foreground">
                  {r.updated_at ? r.updated_at.slice(0, 10) : "—"}
                </TableCell>
              )}
              {editable && (
                <TableCell className="sticky right-0 z-10 border-l border-border bg-background group-hover/row:bg-muted/50 group-data-[state=selected]/row:bg-muted">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-7"
                    aria-label={`Edit receipt from ${r.date}`}
                    onClick={() => setEditing(r)}
                  >
                    <Pencil className="size-3.5" />
                  </Button>
                </TableCell>
              )}
            </TableRow>
          ))}
          {filtered.length === 0 && (
            <TableRow>
              <TableCell
                colSpan={colSpan}
                className="text-center text-muted-foreground"
              >
                No receipts match.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>

      {selectable && (
        <SelectionActionBar
          count={selected.size}
          noun="receipt"
          onClear={() => {
            setSelected(new Set());
            setArmed(null);
          }}
        >
          <BulkFieldDialog
            label="Set category"
            title="Set category"
            description={`Applies to the ${selected.size} selected receipt${selected.size === 1 ? "" : "s"}.`}
            applyLabel={`Apply to ${selected.size}`}
            canApply={bulkCategory.length > 0}
            busy={busy}
            onApply={() => applyPatch({ category: bulkCategory })}
          >
            <Label htmlFor="bulk-category" className="text-xs text-muted-foreground">
              Category
            </Label>
            <CategorySelect
              id="bulk-category"
              value={bulkCategory}
              onChange={setBulkCategory}
            />
          </BulkFieldDialog>

          <BulkFieldDialog
            label="Set store"
            title="Set store"
            description={`Applies to the ${selected.size} selected receipt${selected.size === 1 ? "" : "s"}.`}
            applyLabel={`Apply to ${selected.size}`}
            canApply={bulkStore.trim().length > 0}
            busy={busy}
            onApply={() => applyPatch({ store: bulkStore.trim() })}
          >
            <Label htmlFor="bulk-store" className="text-xs text-muted-foreground">
              Store
            </Label>
            <AutocompleteInput
              id="bulk-store"
              query={bulkStore}
              suggestions={storeSuggestions}
              onPick={setBulkStore}
              value={bulkStore}
              onChange={(e) => setBulkStore(e.target.value)}
            />
          </BulkFieldDialog>

          <ConfirmButton
            id="delete"
            armed={armed}
            setArmed={setArmed}
            disabled={busy}
            label={`Delete ${selected.size}`}
            confirmLabel={`Confirm — delete ${selected.size} permanently`}
            onRun={deleteSelected}
          />
        </SelectionActionBar>
      )}

      {editing && (
        <ReceiptEditor
          receipt={editing}
          open
          onOpenChange={(next) => {
            if (!next) setEditing(null);
          }}
          onDeleted={(id) =>
            setSelected((prev) => {
              const next = new Set(prev);
              next.delete(id);
              return next;
            })
          }
        />
      )}
    </div>
  );
}
