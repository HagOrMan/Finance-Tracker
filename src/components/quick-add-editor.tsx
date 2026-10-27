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
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AutocompleteInput } from "@/components/autocomplete-input";
import { CategorySelect } from "@/components/category-select";
import { useMediaQuery } from "@/hooks/use-media-query";
import {
  useAddQuickAdd,
  useDeleteQuickAdd,
  useDisbursements,
  useMergedReceipts,
  useUpdateQuickAdd,
} from "@/hooks/use-finance-data";
import {
  quickAddSchema,
  type QuickAddFormInput,
  type QuickAddFormValues,
} from "@/lib/data/schemas";
import type { QuickAdd, QuickAddKind } from "@/lib/data/types";
import { buildStoreGroups } from "@/lib/stores";

/**
 * Create / edit a quick-add preset. Dialog on desktop, Drawer on mobile,
 * matching the other editors.
 */
export function QuickAddEditor({
  quickAdd,
  open,
  onOpenChange,
}: {
  /** Omit to create. */
  quickAdd?: QuickAdd;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const isDesktop = useMediaQuery("(min-width: 640px)");
  const title = quickAdd ? "Edit quick add" : "New quick add";
  const subtitle =
    "Pre-fills the quick-add form. Nothing is added until you press Add there.";

  const body = (
    <QuickAddForm
      key={quickAdd?.id ?? "new"}
      quickAdd={quickAdd}
      onClose={() => onOpenChange(false)}
    />
  );

  if (isDesktop) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
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
          <DrawerTitle>{title}</DrawerTitle>
          <DrawerDescription>{subtitle}</DrawerDescription>
        </DrawerHeader>
        <DrawerBody>{body}</DrawerBody>
      </DrawerContent>
    </Drawer>
  );
}

function QuickAddForm({
  quickAdd,
  onClose,
}: {
  quickAdd?: QuickAdd;
  onClose: () => void;
}) {
  const addQuickAdd = useAddQuickAdd();
  const updateQuickAdd = useUpdateQuickAdd();
  const deleteQuickAdd = useDeleteQuickAdd();
  const { data: receipts } = useMergedReceipts();
  const { data: disbursements } = useDisbursements();

  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<QuickAddFormInput, unknown, QuickAddFormValues>({
    resolver: zodResolver(quickAddSchema),
    defaultValues: {
      kind: quickAdd?.kind ?? "receipt",
      name: quickAdd?.name ?? "",
      counterparty: quickAdd?.counterparty ?? "",
      category: quickAdd?.category ?? "",
      // `""`, not null: the field's input type is `unknown` (it's preprocessed),
      // and react-hook-form's `DeepPartial<unknown>` won't accept null.
      amount: quickAdd?.amount ?? "",
      note: quickAdd?.note ?? "",
    },
  });

  const kind = (watch("kind") ?? "receipt") as QuickAddKind;
  const counterparty = watch("counterparty") ?? "";
  const category = watch("category") ?? "";
  const isReceipt = kind === "receipt";

  // Same suggestion sources the quick-add form itself uses, so a preset's
  // spelling matches what's already on the ledger.
  const storeSuggestions = useMemo(
    () => buildStoreGroups(receipts ?? []).map((g) => g.displayName).sort(),
    [receipts],
  );
  const entitySuggestions = useMemo(
    () => [...new Set((disbursements ?? []).map((d) => d.entity))].sort(),
    [disbursements],
  );

  async function onSubmit(values: QuickAddFormValues) {
    try {
      if (quickAdd) {
        await updateQuickAdd.mutateAsync({ id: quickAdd.id, input: values });
        toast.success(`Quick add updated: ${values.name}`);
      } else {
        await addQuickAdd.mutateAsync(values);
        toast.success(`Quick add saved: ${values.name}`);
      }
      onClose();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to save quick add",
      );
    }
  }

  async function onDelete() {
    if (!quickAdd) return;
    if (!confirmingDelete) {
      setConfirmingDelete(true);
      return;
    }
    try {
      await deleteQuickAdd.mutateAsync(quickAdd.id);
      toast.success(`Quick add deleted: ${quickAdd.name}`);
      onClose();
    } catch (error) {
      setConfirmingDelete(false);
      toast.error(error instanceof Error ? error.message : "Failed to delete");
    }
  }

  const busy =
    addQuickAdd.isPending || updateQuickAdd.isPending || deleteQuickAdd.isPending;

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="mt-2 flex flex-col gap-3">
      <Tabs
        value={kind}
        onValueChange={(v) =>
          setValue("kind", v as QuickAddKind, { shouldValidate: true })
        }
      >
        <TabsList className="w-full">
          <TabsTrigger value="receipt" className="flex-1">
            Receipt
          </TabsTrigger>
          <TabsTrigger value="disbursement" className="flex-1">
            Disbursement
          </TabsTrigger>
        </TabsList>
      </Tabs>

      <div className="flex min-w-0 flex-col gap-1.5">
        <Label htmlFor="q-name">Name</Label>
        <Input
          id="q-name"
          placeholder={isReceipt ? "Rent – Alex" : "Utilities split"}
          {...register("name")}
        />
        <p className="text-xs text-muted-foreground">
          The button label in the quick-add sheet. Not saved onto the{" "}
          {isReceipt ? "receipt" : "disbursement"}.
        </p>
        {errors.name && (
          <p className="text-xs text-destructive">{errors.name.message}</p>
        )}
      </div>

      <div className="flex min-w-0 flex-col gap-1.5">
        <Label htmlFor="q-counterparty">{isReceipt ? "Store" : "Entity"}</Label>
        <AutocompleteInput
          id="q-counterparty"
          query={counterparty}
          suggestions={isReceipt ? storeSuggestions : entitySuggestions}
          onPick={(value) =>
            setValue("counterparty", value, { shouldValidate: true })
          }
          {...register("counterparty")}
        />
        {errors.counterparty && (
          <p className="text-xs text-destructive">
            {errors.counterparty.message}
          </p>
        )}
      </div>

      {isReceipt && (
        <div className="flex min-w-0 flex-col gap-1.5">
          <Label htmlFor="q-category">Category</Label>
          <CategorySelect
            id="q-category"
            value={category}
            onChange={(v) => setValue("category", v, { shouldValidate: true })}
          />
          {errors.category && (
            <p className="text-xs text-destructive">
              {errors.category.message}
            </p>
          )}
        </div>
      )}

      <div className="flex min-w-0 flex-col gap-1.5">
        <Label htmlFor="q-amount">Amount ($, optional)</Label>
        <Input
          id="q-amount"
          type="number"
          inputMode="decimal"
          step="0.01"
          {...register("amount")}
        />
        <p className="text-xs text-muted-foreground">
          Leave blank if it changes — you&apos;ll type it each time.
        </p>
        {errors.amount && (
          <p className="text-xs text-destructive">{errors.amount.message}</p>
        )}
      </div>

      <div className="flex min-w-0 flex-col gap-1.5">
        <Label htmlFor="q-note">
          {isReceipt ? "Note (optional)" : "Reason (optional)"}
        </Label>
        <Input id="q-note" {...register("note")} />
      </div>

      <div className="mt-1 flex items-center gap-2">
        {quickAdd && (
          <Button
            type="button"
            variant={confirmingDelete ? "destructive" : "outline"}
            onClick={onDelete}
            disabled={busy}
            title={
              confirmingDelete
                ? "Click again to permanently delete"
                : "Delete quick add"
            }
          >
            <Trash2 />
            {confirmingDelete ? "Confirm delete" : "Delete"}
          </Button>
        )}
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
          {busy ? "Saving…" : quickAdd ? "Save changes" : "Save quick add"}
        </Button>
      </div>
    </form>
  );
}
