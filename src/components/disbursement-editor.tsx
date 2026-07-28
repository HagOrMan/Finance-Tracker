"use client";

import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Check, ChevronsUpDown, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
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
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { AutocompleteInput } from "@/components/autocomplete-input";
import { useMediaQuery } from "@/hooks/use-media-query";
import {
  useDeleteDisbursement,
  useDisbursements,
  useMergedReceipts,
  useUpdateDisbursement,
} from "@/hooks/use-finance-data";
import {
  updateDisbursementSchema,
  type UpdateDisbursementFormInput,
  type UpdateDisbursementFormValues,
} from "@/lib/data/schemas";
import type { Disbursement } from "@/lib/data/types";
import { buildEntityGroups } from "@/lib/entities";

/**
 * The disbursement counterpart to `receipt-editor.tsx` (ARCHITECTURE.md). The
 * `PATCH`/`DELETE` routes and hooks it uses have existed since Phase 0 and were
 * unused until now.
 *
 * Two ways it differs from the receipt editor, both consequences of what a
 * disbursement *is*:
 *
 * - **Delete needs no guard.** Nothing references a disbursement, so there is
 *   no foreign key to trip and no 409 to render. A receipt delete has both.
 * - **Editing is more dangerous, not less.** `amount` and
 *   `refunded_from_receipt` feed `actual_price` through `mergeReceipts`, so
 *   changing either silently moves every net-paid figure in the app. The form
 *   says so out loud on refund rows rather than leaving you to discover it.
 */
export function DisbursementEditor({
  disbursement,
  open,
  onOpenChange,
  onSaved,
  onDeleted,
}: {
  disbursement: Disbursement;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved?: (disbursement: Disbursement) => void;
  onDeleted?: (id: number) => void;
}) {
  const isDesktop = useMediaQuery("(min-width: 640px)");
  const title = "Edit disbursement";
  const subtitle = `${disbursement.date_received} · ${disbursement.entity}${
    disbursement.updated_at
      ? ` · last edited ${disbursement.updated_at.slice(0, 10)}`
      : ""
  }`;

  // `key` so opening a different row while the dialog is mounted rebuilds the
  // form against the new defaults instead of keeping the old ones.
  const form = (
    <DisbursementEditorForm
      key={disbursement.id}
      disbursement={disbursement}
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

function DisbursementEditorForm({
  disbursement,
  onClose,
  onSaved,
  onDeleted,
}: {
  disbursement: Disbursement;
  onClose: () => void;
  onSaved?: (disbursement: Disbursement) => void;
  onDeleted?: (id: number) => void;
}) {
  const updateDisbursement = useUpdateDisbursement();
  const deleteDisbursement = useDeleteDisbursement();
  const { data: receipts } = useMergedReceipts();
  const { data: disbursements } = useDisbursements();

  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [comboOpen, setComboOpen] = useState(false);

  // Canonical spellings only, same as quick-add — accepting a suggestion can
  // then only reduce entity drift, never add a variant back.
  const entitySuggestions = useMemo(
    () => buildEntityGroups(disbursements ?? []).map((g) => g.displayName).sort(),
    [disbursements],
  );

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<
    UpdateDisbursementFormInput,
    unknown,
    UpdateDisbursementFormValues
  >({
    resolver: zodResolver(updateDisbursementSchema),
    defaultValues: {
      entity: disbursement.entity,
      amount: disbursement.amount,
      date_received: disbursement.date_received,
      reason: disbursement.reason ?? "",
      refunded_from_receipt: disbursement.refunded_from_receipt,
    },
  });

  const entity = watch("entity") ?? "";
  const refundedFromReceipt = watch("refunded_from_receipt");
  const linkedReceipt = receipts?.find((r) => r.id === refundedFromReceipt);

  async function onSubmit(values: UpdateDisbursementFormValues) {
    try {
      const saved = await updateDisbursement.mutateAsync({
        id: disbursement.id,
        patch: {
          ...values,
          // An emptied reason means "no reason", not "a reason that is the
          // empty string" — the column is nullable and reads treat null as
          // absent.
          reason: values.reason?.trim() ? values.reason.trim() : null,
        },
      });
      toast.success(`Disbursement updated: ${saved.entity}`);
      onSaved?.(saved);
      onClose();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to update disbursement",
      );
    }
  }

  async function onDelete() {
    if (!confirmingDelete) {
      setConfirmingDelete(true);
      return;
    }
    try {
      await deleteDisbursement.mutateAsync(disbursement.id);
      toast.success(`Disbursement deleted: ${disbursement.entity}`);
      onDeleted?.(disbursement.id);
      onClose();
    } catch (error) {
      setConfirmingDelete(false);
      toast.error(
        error instanceof Error ? error.message : "Failed to delete disbursement",
      );
    }
  }

  const busy = updateDisbursement.isPending || deleteDisbursement.isPending;
  const wasRefund = disbursement.refunded_from_receipt != null;

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="mt-2 flex flex-col gap-3">
      <div className="flex min-w-0 flex-col gap-1.5">
        <Label htmlFor="de-entity">Entity</Label>
        <AutocompleteInput
          id="de-entity"
          query={entity}
          suggestions={entitySuggestions}
          onPick={(value) => setValue("entity", value, { shouldValidate: true })}
          {...register("entity")}
        />
        {errors.entity && (
          <p className="text-xs text-destructive">{errors.entity.message}</p>
        )}
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="flex min-w-0 flex-col gap-1.5">
          <Label htmlFor="de-amount">Amount ($)</Label>
          <Input
            id="de-amount"
            type="number"
            inputMode="decimal"
            step="0.01"
            {...register("amount")}
          />
          {errors.amount && (
            <p className="text-xs text-destructive">{errors.amount.message}</p>
          )}
        </div>
        <div className="flex min-w-0 flex-col gap-1.5">
          <Label htmlFor="de-date">Date received</Label>
          <Input id="de-date" type="date" {...register("date_received")} />
          {errors.date_received && (
            <p className="text-xs text-destructive">
              {errors.date_received.message}
            </p>
          )}
        </div>
      </div>

      <div className="flex min-w-0 flex-col gap-1.5">
        <Label htmlFor="de-reason">Reason (optional)</Label>
        <Input id="de-reason" {...register("reason")} />
      </div>

      <div className="flex min-w-0 flex-col gap-1.5">
        <Label>Refund of receipt (optional)</Label>
        <Popover open={comboOpen} onOpenChange={setComboOpen}>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="outline"
              role="combobox"
              title={
                linkedReceipt
                  ? `${linkedReceipt.date} · ${linkedReceipt.store} · $${linkedReceipt.price.toFixed(2)}`
                  : "Not linked to a receipt"
              }
              className="w-full justify-between font-normal"
            >
              <span className="min-w-0 truncate">
                {linkedReceipt
                  ? `${linkedReceipt.date} · ${linkedReceipt.store} · $${linkedReceipt.price.toFixed(2)}`
                  : "Not linked to a receipt"}
              </span>
              <ChevronsUpDown className="opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[320px] p-0" align="start">
            <Command>
              <CommandInput placeholder="Search receipts…" />
              <CommandList>
                <CommandEmpty>No receipts found.</CommandEmpty>
                <CommandGroup>
                  <CommandItem
                    onSelect={() => {
                      setValue("refunded_from_receipt", null, {
                        shouldValidate: true,
                      });
                      setComboOpen(false);
                    }}
                  >
                    <Check
                      className={cn(
                        "mr-2 size-4",
                        refundedFromReceipt == null
                          ? "opacity-100"
                          : "opacity-0",
                      )}
                    />
                    Not linked
                  </CommandItem>
                  {(receipts ?? []).map((r) => (
                    <CommandItem
                      key={r.id}
                      value={`${r.date} ${r.store} ${r.category} ${r.id}`}
                      onSelect={() => {
                        setValue("refunded_from_receipt", r.id, {
                          shouldValidate: true,
                        });
                        setComboOpen(false);
                      }}
                    >
                      <Check
                        className={cn(
                          "mr-2 size-4",
                          refundedFromReceipt === r.id
                            ? "opacity-100"
                            : "opacity-0",
                        )}
                      />
                      <span
                        className="min-w-0 truncate"
                        title={`${r.date} · ${r.store} · $${r.price.toFixed(2)}`}
                      >
                        {r.date} · {r.store} · ${r.price.toFixed(2)}
                      </span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
      </div>

      {(wasRefund || refundedFromReceipt != null) && (
        <p className="rounded-md border border-secondary bg-secondary/5 p-2 text-xs text-muted-foreground">
          This is a refund, so its amount and link feed the linked receipt&apos;s
          net paid. Changing either moves every net-paid figure that receipt
          appears in.
        </p>
      )}

      <div className="mt-1 flex items-center gap-2">
        <Button
          type="button"
          variant={confirmingDelete ? "destructive" : "outline"}
          onClick={onDelete}
          disabled={busy}
          aria-label="Delete disbursement"
          title={
            confirmingDelete
              ? "Click again to permanently delete"
              : "Delete disbursement"
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
          {updateDisbursement.isPending ? "Saving…" : "Save changes"}
        </Button>
      </div>
    </form>
  );
}
