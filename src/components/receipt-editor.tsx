"use client";

import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";

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
  DrawerBody,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AutocompleteInput } from "@/components/autocomplete-input";
import { CategorySelect } from "@/components/category-select";
import { useMediaQuery } from "@/hooks/use-media-query";
import {
  linkedDisbursements,
  useDeleteReceipt,
  useMergedReceipts,
  useUpdateReceipt,
} from "@/hooks/use-finance-data";
import {
  updateReceiptSchema,
  type UpdateReceiptFormInput,
  type UpdateReceiptFormValues,
} from "@/lib/data/schemas";
import type { Disbursement, Receipt } from "@/lib/data/types";
import { formatCurrency } from "@/lib/format";

/**
 * The single edit surface for a receipt — used by the Stores modal (Phase 1)
 * and the manage table (Phase 2). Dialog on desktop, Drawer on mobile, matching
 * `quick-add-modal.tsx`.
 *
 * Both wrappers unmount their content when closed, so the form's state
 * (category mode, delete confirmation, the blocked-delete list) resets on every
 * open without needing to be reset by hand.
 */
export function ReceiptEditor({
  receipt,
  open,
  onOpenChange,
  onSaved,
  onDeleted,
}: {
  receipt: Receipt;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved?: (receipt: Receipt) => void;
  onDeleted?: (id: number) => void;
}) {
  const isDesktop = useMediaQuery("(min-width: 640px)");
  const title = "Edit receipt";
  const subtitle = `${receipt.date} · ${receipt.store}${
    receipt.updated_at ? ` · last edited ${receipt.updated_at.slice(0, 10)}` : ""
  }`;

  // `key` so that opening a different row while the dialog is already mounted
  // rebuilds the form against the new defaults rather than keeping the old ones.
  const form = (
    <ReceiptEditorForm
      key={receipt.id}
      receipt={receipt}
      onClose={() => onOpenChange(false)}
      onSaved={onSaved}
      onDeleted={onDeleted}
    />
  );

  if (isDesktop) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>{subtitle}</DialogDescription>
          </DialogHeader>
          {form}
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle>{title}</DrawerTitle>
          <DrawerDescription>{subtitle}</DrawerDescription>
        </DrawerHeader>
        {/* DrawerBody, not a plain div: without a scroll container vaul reads
            every downward swipe on an overflowing form as drag-to-dismiss. */}
        <DrawerBody>{form}</DrawerBody>
      </DrawerContent>
    </Drawer>
  );
}

function ReceiptEditorForm({
  receipt,
  onClose,
  onSaved,
  onDeleted,
}: {
  receipt: Receipt;
  onClose: () => void;
  onSaved?: (receipt: Receipt) => void;
  onDeleted?: (id: number) => void;
}) {
  const updateReceipt = useUpdateReceipt();
  const deleteReceipt = useDeleteReceipt();
  const { data: receipts } = useMergedReceipts();

  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [blockedBy, setBlockedBy] = useState<Disbursement[]>([]);

  const storeSuggestions = useMemo(
    () => [...new Set((receipts ?? []).map((r) => r.store))].sort(),
    [receipts],
  );

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<UpdateReceiptFormInput, unknown, UpdateReceiptFormValues>({
    resolver: zodResolver(updateReceiptSchema),
    defaultValues: {
      store: receipt.store,
      category: receipt.category,
      price: receipt.price,
      discount: receipt.discount,
      discount_percentage: receipt.discount_percentage,
      note: receipt.note ?? "",
      date: receipt.date,
    },
  });

  const store = watch("store") ?? "";
  const category = watch("category") ?? "";

  async function onSubmit(values: UpdateReceiptFormValues) {
    try {
      const saved = await updateReceipt.mutateAsync({
        id: receipt.id,
        patch: {
          ...values,
          // An emptied note means "no note", not "a note that is the empty
          // string" — the column is nullable and every read path treats null
          // as absent.
          note: values.note?.trim() ? values.note.trim() : null,
        },
      });
      toast.success(`Receipt updated: ${saved.store}`);
      onSaved?.(saved);
      onClose();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to update receipt",
      );
    }
  }

  async function onDelete() {
    if (!confirmingDelete) {
      setConfirmingDelete(true);
      return;
    }
    try {
      await deleteReceipt.mutateAsync(receipt.id);
      toast.success(`Receipt deleted: ${receipt.store}`);
      onDeleted?.(receipt.id);
      onClose();
    } catch (error) {
      // 409: refunds point at this receipt. Show them rather than a toast that
      // scrolls away — the next action is to go fix those rows.
      const linked = linkedDisbursements(error);
      setBlockedBy(linked);
      setConfirmingDelete(false);
      if (linked.length === 0) {
        toast.error(
          error instanceof Error ? error.message : "Failed to delete receipt",
        );
      }
    }
  }

  const busy = updateReceipt.isPending || deleteReceipt.isPending;

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="mt-2 flex flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="e-store">Store</Label>
        <AutocompleteInput
          id="e-store"
          query={store}
          suggestions={storeSuggestions}
          onPick={(value) => setValue("store", value, { shouldValidate: true })}
          {...register("store")}
        />
        {errors.store && (
          <p className="text-xs text-destructive">{errors.store.message}</p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="e-category">Category</Label>
        <CategorySelect
          id="e-category"
          value={category}
          onChange={(v) => setValue("category", v, { shouldValidate: true })}
        />
        {errors.category && (
          <p className="text-xs text-destructive">{errors.category.message}</p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="e-price">Price ($)</Label>
          <Input
            id="e-price"
            type="number"
            inputMode="decimal"
            step="0.01"
            {...register("price")}
          />
          {errors.price && (
            <p className="text-xs text-destructive">{errors.price.message}</p>
          )}
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="e-date">Date</Label>
          <Input id="e-date" type="date" {...register("date")} />
          {errors.date && (
            <p className="text-xs text-destructive">{errors.date.message}</p>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="e-discount">Discount ($)</Label>
          <Input
            id="e-discount"
            type="number"
            inputMode="decimal"
            step="0.01"
            {...register("discount")}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="e-discount-pct">Discount (%)</Label>
          <Input
            id="e-discount-pct"
            type="number"
            inputMode="decimal"
            step="0.1"
            {...register("discount_percentage")}
          />
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="e-note">Note (optional)</Label>
        <Input id="e-note" {...register("note")} />
      </div>

      {blockedBy.length > 0 && (
        <div className="rounded-md border border-destructive/50 bg-destructive/5 p-3 text-xs">
          <p className="font-medium text-destructive">
            Can&apos;t delete — {blockedBy.length} disbursement
            {blockedBy.length === 1 ? "" : "s"} refund this receipt. Delete or
            unlink {blockedBy.length === 1 ? "it" : "them"} first.
          </p>
          <ul className="mt-2 flex flex-col gap-1 text-muted-foreground">
            {blockedBy.map((d) => (
              <li key={d.id} className="truncate">
                {d.date_received} · {d.entity} · {formatCurrency(d.amount)}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-1 flex items-center gap-2">
        <Button
          type="button"
          variant={confirmingDelete ? "destructive" : "outline"}
          onClick={onDelete}
          disabled={busy}
          aria-label="Delete receipt"
          title={
            confirmingDelete
              ? "Click again to permanently delete"
              : "Delete receipt"
          }
        >
          <Trash2 />
          {confirmingDelete ? "Confirm delete" : "Delete"}
        </Button>
        {confirmingDelete && (
          <Button
            type="button"
            variant="ghost"
            onClick={() => setConfirmingDelete(false)}
            disabled={busy}
          >
            Cancel
          </Button>
        )}
        <Button type="submit" disabled={busy} className="ml-auto">
          {updateReceipt.isPending ? "Saving…" : "Save changes"}
        </Button>
      </div>
    </form>
  );
}
