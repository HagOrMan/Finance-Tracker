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
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AutocompleteInput } from "@/components/autocomplete-input";
import { ConfirmButton } from "@/components/confirm-button";
import { DisbursementEditor } from "@/components/disbursement-editor";
import { MultiSelect } from "@/components/multi-select";
import {
  BulkFieldDialog,
  SelectionActionBar,
} from "@/components/selection-action-bar";
import {
  useBulkUpdateDisbursements,
  useDeleteDisbursement,
} from "@/hooks/use-finance-data";
import { deleteSequentially } from "@/lib/bulk-delete";
import { buildEntityGroups } from "@/lib/entities";
import { formatCurrency } from "@/lib/format";
import type { Disbursement, MergedReceipt } from "@/lib/data/types";

type TypeFilter = "All" | "Refund" | "Standalone";

/**
 * The disbursements table, shaped like `receipts-table.tsx` — same
 * `editable` / `selectable` opt-ins, same selection semantics.
 *
 * FEATURES.md §5 is emphatic that this tab matters as much as the receipts one:
 * a wrong refund amount silently corrupts `actual_price` on every net-paid
 * figure across the app, and until now there was no way to fix one.
 *
 * "Set entity" in the action bar is the §4.7 amendment's second surface — the
 * escape hatch for two spellings that share no substring, which the Entities
 * tab's grouping can't suggest on its own.
 */
export function DisbursementsTable({
  disbursements,
  receipts,
  editable = false,
  selectable = false,
}: {
  disbursements: Disbursement[];
  /** Used to name the receipt a refund points at. */
  receipts: MergedReceipt[];
  editable?: boolean;
  selectable?: boolean;
}) {
  const [entities, setEntities] = useState<string[]>([]);
  const [type, setType] = useState<TypeFilter>("All");
  const [reasonSearch, setReasonSearch] = useState("");

  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [editing, setEditing] = useState<Disbursement | null>(null);
  const [bulkEntity, setBulkEntity] = useState("");
  const [armed, setArmed] = useState<string | null>(null);

  const bulkUpdate = useBulkUpdateDisbursements();
  const deleteDisbursement = useDeleteDisbursement();

  const entityOptions = useMemo(
    () => [...new Set(disbursements.map((d) => d.entity))].sort(),
    [disbursements],
  );
  const entitySuggestions = useMemo(
    () => buildEntityGroups(disbursements).map((g) => g.displayName).sort(),
    [disbursements],
  );
  const receiptById = useMemo(
    () => new Map(receipts.map((r) => [r.id, r])),
    [receipts],
  );

  const filtered = useMemo(
    () =>
      disbursements
        .filter((d) => (entities.length ? entities.includes(d.entity) : true))
        .filter((d) => {
          if (type === "Refund") return d.refunded_from_receipt != null;
          if (type === "Standalone") return d.refunded_from_receipt == null;
          return true;
        })
        .filter((d) =>
          reasonSearch
            ? (d.reason ?? "")
                .toLowerCase()
                .includes(reasonSearch.toLowerCase())
            : true,
        )
        .sort((a, b) =>
          a.date_received < b.date_received
            ? 1
            : a.date_received > b.date_received
              ? -1
              : b.id - a.id,
        ),
    [disbursements, entities, type, reasonSearch],
  );

  const colSpan = 6 + (selectable ? 1 : 0) + (editable ? 2 : 0);

  const selectedIds = [...selected];
  const allFilteredSelected =
    filtered.length > 0 && filtered.every((d) => selected.has(d.id));
  const someFilteredSelected =
    !allFilteredSelected && filtered.some((d) => selected.has(d.id));

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
      if (allFilteredSelected) filtered.forEach((d) => next.delete(d.id));
      else filtered.forEach((d) => next.add(d.id));
      return next;
    });
    setArmed(null);
  }

  async function applyEntity() {
    try {
      const result = await bulkUpdate.mutateAsync({
        ids: selectedIds,
        patch: { entity: bulkEntity.trim() },
      });
      toast.success(
        `${result.updated} disbursement${result.updated === 1 ? "" : "s"} updated`,
      );
      setSelected(new Set());
      setBulkEntity("");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Bulk update failed");
    }
  }

  async function deleteSelected() {
    const { deleted, failed } = await deleteSequentially(selectedIds, (id) =>
      deleteDisbursement.mutateAsync(id),
    );
    if (deleted.length > 0) {
      toast.success(
        `${deleted.length} disbursement${deleted.length === 1 ? "" : "s"} deleted`,
      );
    }
    if (failed.length > 0) {
      toast.error(
        `${failed.length} couldn't be deleted — ${failed[0]?.message ?? ""}`,
      );
    }
    setSelected(new Set(failed.map((f) => f.id)));
  }

  const busy = bulkUpdate.isPending || deleteDisbursement.isPending;
  const refundCount = filtered.filter(
    (d) => d.refunded_from_receipt != null,
  ).length;
  // Counted over every disbursement, not just the filtered ones: selection
  // survives a filter change, so a selected refund can be off-screen and the
  // delete confirmation must still warn about it.
  const selectedRefunds = disbursements.filter(
    (d) => selected.has(d.id) && d.refunded_from_receipt != null,
  ).length;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-3">
        <MultiSelect
          label="Filter by entity"
          options={entityOptions}
          selected={entities}
          onChange={setEntities}
          className="w-50 max-sm:w-full"
        />
        <div className="flex flex-col gap-1">
          <Label className="text-xs font-medium text-muted-foreground">
            Type
          </Label>
          <Select value={type} onValueChange={(v) => setType(v as TypeFilter)}>
            <SelectTrigger className="w-35 max-sm:w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="All">All</SelectItem>
              <SelectItem value="Refund">Refund</SelectItem>
              <SelectItem value="Standalone">Standalone</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex min-w-50 flex-1 flex-col gap-1 max-sm:min-w-0 max-sm:basis-full">
          <Label className="text-xs font-medium text-muted-foreground">
            Search reason
          </Label>
          <Input
            value={reasonSearch}
            onChange={(e) => setReasonSearch(e.target.value)}
            placeholder="type to search…"
          />
        </div>
      </div>

      {editable && (
        <p className="text-xs text-muted-foreground">
          Showing {filtered.length} of {disbursements.length} disbursements ·{" "}
          {refundCount} refund{refundCount === 1 ? "" : "s"}
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
                  aria-label="Select all matching disbursements"
                />
              </TableHead>
            )}
            <TableHead>Date</TableHead>
            <TableHead>Entity</TableHead>
            <TableHead className="text-right">Amount</TableHead>
            <TableHead>Type</TableHead>
            <TableHead>Reason</TableHead>
            <TableHead>Refund of</TableHead>
            {editable && <TableHead>Last edited</TableHead>}
            {/* Pinned to the right edge of the scroll container — see the same
                treatment in receipts-table.tsx. */}
            {editable && (
              <TableHead className="sticky right-0 w-9 border-l border-border bg-background" />
            )}
          </TableRow>
        </TableHeader>
        <TableBody>
          {filtered.map((d) => {
            const linked =
              d.refunded_from_receipt != null
                ? receiptById.get(d.refunded_from_receipt)
                : undefined;
            return (
              <TableRow
                key={d.id}
                className="group/row"
                data-state={selected.has(d.id) ? "selected" : undefined}
              >
                {selectable && (
                  <TableCell>
                    <Checkbox
                      checked={selected.has(d.id)}
                      onCheckedChange={() => toggleRow(d.id)}
                      aria-label={`Select disbursement from ${d.date_received}`}
                    />
                  </TableCell>
                )}
                <TableCell>{d.date_received}</TableCell>
                <TableCell>{d.entity}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatCurrency(d.amount)}
                </TableCell>
                <TableCell>
                  {d.refunded_from_receipt != null ? "Refund" : "Standalone"}
                </TableCell>
                <TableCell className="max-w-40 truncate" title={d.reason ?? ""}>
                  {d.reason ?? ""}
                </TableCell>
                <TableCell
                  className="max-w-50 truncate"
                  title={linked ? `${linked.date} · ${linked.store}` : ""}
                >
                  {linked ? `${linked.date} · ${linked.store}` : ""}
                </TableCell>
                {editable && (
                  <TableCell className="text-xs text-muted-foreground">
                    {d.updated_at ? d.updated_at.slice(0, 10) : "—"}
                  </TableCell>
                )}
                {editable && (
                  <TableCell className="sticky right-0 z-10 border-l border-border bg-background group-hover/row:bg-muted/50 group-data-[state=selected]/row:bg-muted">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="size-7"
                      aria-label={`Edit disbursement from ${d.date_received}`}
                      onClick={() => setEditing(d)}
                    >
                      <Pencil className="size-3.5" />
                    </Button>
                  </TableCell>
                )}
              </TableRow>
            );
          })}
          {filtered.length === 0 && (
            <TableRow>
              <TableCell
                colSpan={colSpan}
                className="text-center text-muted-foreground"
              >
                No disbursements match.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>

      {selectable && (
        <SelectionActionBar
          count={selected.size}
          noun="disbursement"
          onClear={() => {
            setSelected(new Set());
            setArmed(null);
          }}
        >
          <BulkFieldDialog
            label="Set entity"
            title="Set entity"
            description={`Applies to the ${selected.size} selected disbursement${
              selected.size === 1 ? "" : "s"
            }. Renaming can't change any amount — refund links are foreign keys, not names.`}
            applyLabel={`Apply to ${selected.size}`}
            canApply={bulkEntity.trim().length > 0}
            busy={busy}
            onApply={applyEntity}
          >
            <Label htmlFor="bulk-entity" className="text-xs text-muted-foreground">
              Entity
            </Label>
            <AutocompleteInput
              id="bulk-entity"
              query={bulkEntity}
              suggestions={entitySuggestions}
              onPick={setBulkEntity}
              value={bulkEntity}
              onChange={(e) => setBulkEntity(e.target.value)}
            />
          </BulkFieldDialog>

          <ConfirmButton
            id="delete"
            armed={armed}
            setArmed={setArmed}
            disabled={busy}
            label={`Delete ${selected.size}`}
            confirmLabel={
              selectedRefunds > 0
                ? `Confirm — delete ${selected.size} (${selectedRefunds} refund${selectedRefunds === 1 ? "" : "s"})`
                : `Confirm — delete ${selected.size} permanently`
            }
            onRun={deleteSelected}
          />
        </SelectionActionBar>
      )}

      {editing && (
        <DisbursementEditor
          disbursement={editing}
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
