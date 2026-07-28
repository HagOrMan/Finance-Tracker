"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Drawer,
  DrawerBody,
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
import { ConfirmButton } from "@/components/confirm-button";
import { useBulkUpdateDisbursements } from "@/hooks/use-finance-data";
import { useMediaQuery } from "@/hooks/use-media-query";
import type { Disbursement, MergedReceipt } from "@/lib/data/types";
import { entityDisbursements, type EntityGroup } from "@/lib/entities";
import { formatCurrency } from "@/lib/format";

/** Matches `bulkUpdateDisbursementsSchema`'s id-list cap — FEATURES.md §3.3. */
const BULK_ID_LIMIT = 1000;

/**
 * The entity drill-down (FEATURES.md §4.7). The store modal minus the category
 * axis: an entity has no mix bar and no dominant category, so the bulk bar is
 * just rename and merge — both one `PATCH /api/disbursements/bulk` with
 * `{ ids, patch: { entity } }`.
 *
 * Renaming is safe in bulk in a way editing an amount is not:
 * `refunded_from_receipt` is a foreign key, not a name, so no rename can
 * disturb `actual_price` anywhere in the app.
 *
 * The row list is **read-only in Phase 1.** Its receipt-row equivalent opens
 * `ReceiptEditor`, but the disbursement counterpart (`DisbursementEditor`) is
 * assigned to Phase 2 by FEATURES.md §5.1 — the `PATCH`/`DELETE` routes and
 * hooks it will use already exist from Phase 0 and are simply unused until
 * then. Until it lands, per-row fixes go through the Disbursements page.
 */
export function EntityDetailModal({
  group,
  disbursements,
  allGroups,
  receipts,
  open,
  onOpenChange,
}: {
  group: EntityGroup;
  /** Every disbursement — the modal derives its own rows. */
  disbursements: Disbursement[];
  allGroups: EntityGroup[];
  /** For naming the receipt a refund points at. */
  receipts: MergedReceipt[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const isDesktop = useMediaQuery("(min-width: 640px)");
  const title = group.displayName;
  const subtitle = `${group.count} disbursement${
    group.count === 1 ? "" : "s"
  } · ${group.firstDate} – ${group.lastDate} · ${formatCurrency(group.total)}`;

  const body = (
    <EntityDetailBody
      key={group.key}
      group={group}
      disbursements={disbursements}
      allGroups={allGroups}
      receipts={receipts}
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
        <DrawerBody>{body}</DrawerBody>
      </DrawerContent>
    </Drawer>
  );
}

function EntityDetailBody({
  group,
  disbursements,
  allGroups,
  receipts,
  onClose,
}: {
  group: EntityGroup;
  disbursements: Disbursement[];
  allGroups: EntityGroup[];
  receipts: MergedReceipt[];
  onClose: () => void;
}) {
  const bulkUpdate = useBulkUpdateDisbursements();

  const [armed, setArmed] = useState<string | null>(null);
  const [rename, setRename] = useState(group.displayName);
  const [mergeKey, setMergeKey] = useState("");

  const rows = useMemo(
    () => entityDisbursements(disbursements, group),
    [disbursements, group],
  );
  const receiptById = useMemo(
    () => new Map(receipts.map((r) => [r.id, r])),
    [receipts],
  );
  const mergeTargets = useMemo(
    () =>
      allGroups
        // Blank names are excluded: Radix throws on a `SelectItem` with an
        // empty-string value, which would take the modal down entirely.
        .filter((g) => g.key !== group.key && g.key !== "")
        .sort((a, b) => a.displayName.localeCompare(b.displayName)),
    [allGroups, group.key],
  );

  async function runBulk(entity: string, describe: (updated: number) => string) {
    const ids = group.disbursementIds;
    if (ids.length === 0) return;
    if (ids.length > BULK_ID_LIMIT) {
      toast.error(
        `That's ${ids.length} disbursements — the bulk endpoint caps at ${BULK_ID_LIMIT}.`,
      );
      return;
    }
    try {
      const result = await bulkUpdate.mutateAsync({ ids, patch: { entity } });
      toast.success(describe(result.updated));
      // Either action changes the group's key, so there is nothing left here to
      // show — close rather than render a row that no longer exists.
      onClose();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Bulk update failed");
    }
  }

  const renameTrimmed = rename.trim();
  const renameChanged =
    renameTrimmed.length > 0 && renameTrimmed !== group.displayName;
  const mergeTarget = mergeTargets.find((g) => g.key === mergeKey);
  const busy = bulkUpdate.isPending;
  const standaloneTotal = group.total - group.refundTotal;

  return (
    <div className="mt-2 flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Entries" value={String(group.count)} />
        <Stat label="Total" value={formatCurrency(group.total)} />
        <Stat
          label={`Refunds (${group.refundCount})`}
          value={formatCurrency(group.refundTotal)}
        />
        <Stat label="Standalone" value={formatCurrency(standaloneTotal)} />
      </div>

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

        <div className="flex flex-col gap-2 rounded-md border border-border p-3">
          <Label htmlFor="entity-rename" className="text-xs text-muted-foreground">
            Rename entity
          </Label>
          <div className="flex flex-wrap items-center gap-2">
            <Input
              id="entity-rename"
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
              label={`Rename ${group.count} row${group.count === 1 ? "" : "s"}`}
              confirmLabel={`Confirm — rename ${group.count}`}
              onRun={() =>
                runBulk(
                  renameTrimmed,
                  (n) =>
                    `${n} disbursement${n === 1 ? "" : "s"} renamed to ${renameTrimmed}`,
                )
              }
            />
          </div>
        </div>

        <div className="flex flex-col gap-2 rounded-md border border-border p-3">
          <Label className="text-xs text-muted-foreground">
            Merge into another entity
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
                <SelectValue placeholder="Pick an entity…" />
              </SelectTrigger>
              <SelectContent>
                {mergeTargets.map((g) => (
                  <SelectItem key={g.key} value={g.key}>
                    {g.displayName} ({g.count})
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
              confirmLabel={`Confirm — move ${group.count} to "${mergeTarget?.displayName ?? ""}"`}
              onRun={() =>
                runBulk(
                  mergeTarget?.displayName ?? "",
                  (n) =>
                    `${n} disbursement${n === 1 ? "" : "s"} merged into ${mergeTarget?.displayName}`,
                )
              }
            />
          </div>
        </div>
      </section>

      <Separator />

      <section className="flex flex-col gap-2">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="text-sm font-medium text-foreground">
            Disbursements ({rows.length})
          </h3>
          <span className="text-xs text-muted-foreground">
            Read-only — per-row editing arrives with Phase 2&apos;s
            DisbursementEditor.
          </span>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead className="text-right">Amount</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Reason</TableHead>
              <TableHead>Refund of</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((d) => {
              const linked =
                d.refunded_from_receipt != null
                  ? receiptById.get(d.refunded_from_receipt)
                  : undefined;
              return (
                <TableRow key={d.id}>
                  <TableCell>{d.date_received}</TableCell>
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
                    className="max-w-40 truncate"
                    title={linked ? `${linked.date} · ${linked.store}` : ""}
                  >
                    {linked ? `${linked.date} · ${linked.store}` : ""}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border bg-card p-2">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-base font-semibold tabular-nums text-foreground">
        {value}
      </div>
    </div>
  );
}
