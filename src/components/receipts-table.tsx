"use client";

import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown, Pencil } from "lucide-react";
import { toast } from "sonner";

import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
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
import { cn } from "@/lib/utils";
import type { MergedReceipt } from "@/lib/data/types";

/**
 * Everything worth ordering by. `"amount"` is the caller's `priceKey` column
 * (net or gross), which is why it isn't just a field name — that column's
 * *meaning* is set by the "Net paid" toggle, so the sort has to follow it rather
 * than pin to one field.
 *
 * `note` is missing on purpose: alphabetical free text answers no question.
 */
type SortColumn =
  | "date"
  | "store"
  | "category"
  | "price"
  | "total_refunded"
  | "amount"
  | "discount"
  | "discount_percentage"
  | "updated_at";

interface Sort {
  column: SortColumn;
  dir: "asc" | "desc";
}

/**
 * Which way a column reads when you first click it. Names want A→Z; dates and
 * money want biggest/newest first, because "click Price, see the top" is the
 * whole reason to sort a spending table.
 */
const ASCENDING_FIRST = new Set<SortColumn>(["store", "category"]);

function sortValue(
  r: MergedReceipt,
  column: SortColumn,
  priceKey: "price" | "actual_price",
): string | number {
  switch (column) {
    case "amount":
      return r[priceKey];
    // Case-folded so a lowercase store name doesn't sort after every
    // capitalised one — ASCII puts the whole uppercase alphabet first.
    case "store":
      return r.store.toLowerCase();
    case "category":
      return r.category.toLowerCase();
    // Typed non-null, but the cell below still renders "—" for an empty one; as
    // a sort key "" lands at the oldest end, which is where "never edited"
    // belongs.
    case "updated_at":
      return r.updated_at;
    default:
      return r[column];
  }
}

/**
 * Compares two values of the *same* column, so the pair is always both numbers
 * or both strings. Split out rather than inlined because `<` on a
 * `string | number` union is a type error, and widening the accessor's return to
 * `any` to dodge that would give up the checking that keeps a new column honest.
 *
 * ISO dates are compared as strings, which is chronological for zero-padded
 * "YYYY-MM-DD" — the same property the filters rely on.
 */
function compareValues(a: string | number, b: string | number): number {
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a).localeCompare(String(b));
}

/**
 * The receipts table, in two modes.
 *
 * Read-only by default — `/` and `/monthly` pass neither new prop and are
 * unaffected. `/manage` turns on `editable` (per-row edit button, a "last
 * edited" column, the subscription badge) and `selectable` (checkbox column
 * plus the bulk action bar). ARCHITECTURE.md is explicit that this is extended
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
  // Newest first, as the table has always opened.
  const [sort, setSort] = useState<Sort>({ column: "date", dir: "desc" });

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

  const dir = sort.dir === "asc" ? 1 : -1;
  let filtered = receipts
    .filter((r) => (category.length ? category.includes(r.category) : true))
    .filter((r) => (store.length ? store.includes(r.store) : true))
    .filter((r) =>
      noteSearch
        ? (r.note ?? "").toLowerCase().includes(noteSearch.toLowerCase())
        : true,
    )
    // Sorting the array `.filter()` just produced, so this never mutates the
    // caller's `receipts`.
    .sort((a, b) => {
      const cmp = compareValues(
        sortValue(a, sort.column, priceKey),
        sortValue(b, sort.column, priceKey),
      );
      // Always tie-break newest-id-first, in a fixed direction. A whole column
      // of equal values (every discount 0.0%) would otherwise have no defined
      // order, and rows could reshuffle on an unrelated re-render.
      return cmp !== 0 ? cmp * dir : b.id - a.id;
    });

  // After the sort, so a "top N" slice follows whatever is on screen rather
  // than always meaning "the N most recent". No page passes `limit` since the
  // overview was folded into `/`; the prop stays for the next one that wants a
  // preview slice.
  if (limit) filtered = filtered.slice(0, limit);

  function toggleSort(column: SortColumn) {
    setSort((prev) =>
      prev.column === column
        ? { column, dir: prev.dir === "asc" ? "desc" : "asc" }
        : { column, dir: ASCENDING_FIRST.has(column) ? "asc" : "desc" },
    );
  }

  const totals = filtered.reduce(
    (acc, r) => ({
      price: acc.price + r.price,
      refunded: acc.refunded + r.total_refunded,
      amount: acc.amount + r[priceKey],
    }),
    { price: 0, refunded: 0, amount: 0 },
  );

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
            {/* Column order is by how often it's read, not by how the row is
                shaped: date, where, how much, what kind, what it was. Price
                (gross), Refunded and the discount pair are the derivation
                behind the net figure — kept, but off to the right where a wide
                table scrolls them out of the way. */}
            <SortHead column="date" label="Date" sort={sort} onSort={toggleSort} />
            <SortHead
              column="store"
              label="Store"
              sort={sort}
              onSort={toggleSort}
              emphasis
            />
            <SortHead
              column="amount"
              label={priceLabel}
              sort={sort}
              onSort={toggleSort}
              align="right"
              emphasis
            />
            <SortHead
              column="category"
              label="Category"
              sort={sort}
              onSort={toggleSort}
            />
            <TableHead>Note</TableHead>
            <SortHead
              column="price"
              label="Price"
              sort={sort}
              onSort={toggleSort}
              align="right"
            />
            <SortHead
              column="total_refunded"
              label="Refunded"
              sort={sort}
              onSort={toggleSort}
              align="right"
            />
            {showDiscountColumns && (
              <SortHead
                column="discount"
                label="Discount"
                sort={sort}
                onSort={toggleSort}
                align="right"
              />
            )}
            {showDiscountColumns && (
              <SortHead
                column="discount_percentage"
                label="Discount %"
                sort={sort}
                onSort={toggleSort}
                align="right"
              />
            )}
            {editable && (
              <SortHead
                column="updated_at"
                label="Last edited"
                sort={sort}
                onSort={toggleSort}
              />
            )}
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
              {/* Store and the net figure carry `font-semibold` for their whole
                  column, header and footer included — they're what a row is
                  scanned for. Not `font-medium`: against the 400 the other
                  cells inherit, 500 is a real difference in the CSS and no
                  difference on screen at `text-sm`. 600 is the first step that
                  actually reads as emphasis. */}
              <TableCell className="font-semibold">
                {r.store}
                {editable && r.subscription_id != null && (
                  // Labels only, links nowhere: the natural target is /manage
                  // filtered by subscription_id, and this page has no
                  // URL-driven filter state to link into yet.
                  <Badge variant="secondary" className="ml-2" title="Generated by a subscription">
                    Sub
                  </Badge>
                )}
              </TableCell>
              <TableCell className="text-right font-semibold tabular-nums">
                {formatCurrency(r[priceKey])}
              </TableCell>
              <TableCell>{r.category}</TableCell>
              <TableCell className="max-w-60 truncate" title={r.note ?? ""}>
                {r.note ?? ""}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {formatCurrency(r.price)}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {formatCurrency(r.total_refunded)}
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

        {/* Sums exactly the rows above, which is why it's suppressed when
            `limit` is in play: on a "top 10" slice a total would be the sum
            of an arbitrary ten, and a footer labelled "Total" that
            silently means "total of a slice" is worse than no footer.

            It exists at all because this table carries its own category / store
            / note filters, so its subset is often narrower than the page's — a
            page-level stat card can't answer "and how much of that was
            Costco". */}
        {!limit && filtered.length > 0 && (
          <TableFooter>
            <TableRow>
              {/* Cells track the header order above — checkbox + Date + Store,
                  then the net total under its own column. */}
              <TableCell colSpan={(selectable ? 1 : 0) + 2}>
                Total — {filtered.length} receipt
                {filtered.length === 1 ? "" : "s"}
              </TableCell>
              {/* `font-semibold` over the `font-medium` the footer sets on
                  every cell, so the net column keeps one weight top to bottom. */}
              <TableCell className="text-right font-semibold tabular-nums">
                {formatCurrency(totals.amount)}
              </TableCell>
              {/* Category and Note. */}
              <TableCell colSpan={2} />
              <TableCell className="text-right tabular-nums">
                {formatCurrency(totals.price)}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {formatCurrency(totals.refunded)}
              </TableCell>
              {/* Discount and the editable columns: a summed discount is
                  misleading next to a mean percentage, so these stay empty
                  rather than carrying a number nobody asked for. Rendered
                  conditionally because with neither option on there is no
                  column left to span, and `colSpan={0}` means "to the end of
                  the row" in HTML — it would silently widen the footer. */}
              {(showDiscountColumns || editable) && (
                <TableCell
                  colSpan={(showDiscountColumns ? 2 : 0) + (editable ? 2 : 0)}
                />
              )}
            </TableRow>
          </TableFooter>
        )}
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

/**
 * A clickable column header.
 *
 * The button is inside the `th` rather than being the `th` — a header cell can't
 * itself be a button, and wrapping keeps `aria-sort` on the cell where screen
 * readers look for it. Being inline-flex, it follows the cell's own
 * `text-right`, so the numeric columns still align to their figures.
 *
 * Inactive columns keep a faint double arrow instead of revealing one on hover:
 * hover affordances don't exist on the phone this app is mostly read on, and
 * "the table sorts" is worth stating unconditionally.
 */
function SortHead({
  column,
  label,
  sort,
  onSort,
  align = "left",
  emphasis = false,
}: {
  column: SortColumn;
  label: string;
  sort: Sort;
  onSort: (column: SortColumn) => void;
  align?: "left" | "right";
  /** A lead column — matches the heavier weight its cells carry. */
  emphasis?: boolean;
}) {
  const active = sort.column === column;
  const Icon = !active ? ArrowUpDown : sort.dir === "asc" ? ArrowUp : ArrowDown;

  return (
    <TableHead
      className={align === "right" ? "text-right" : undefined}
      aria-sort={
        active ? (sort.dir === "asc" ? "ascending" : "descending") : "none"
      }
    >
      <button
        type="button"
        onClick={() => onSort(column)}
        className={cn(
          "inline-flex cursor-pointer items-center gap-1 font-medium hover:text-foreground",
          // After `font-medium` so tailwind-merge drops the lighter one rather
          // than emitting both and leaving the winner to source order.
          emphasis && "font-semibold",
          active && "text-foreground",
        )}
        title={`Sort by ${label.toLowerCase()}`}
      >
        {label}
        <Icon className={cn("size-3 shrink-0", !active && "opacity-40")} />
      </button>
    </TableHead>
  );
}
