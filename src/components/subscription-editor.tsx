"use client";

import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AutocompleteInput } from "@/components/autocomplete-input";
import { CategorySelect } from "@/components/category-select";
import { useMediaQuery } from "@/hooks/use-media-query";
import {
  linkedRows,
  useAddSubscription,
  useDeleteSubscription,
  useMergedReceipts,
  useUpdateSubscription,
} from "@/hooks/use-finance-data";
import {
  newSubscriptionSchema,
  type NewSubscriptionFormInput,
  type NewSubscriptionFormValues,
} from "@/lib/data/schemas";
import {
  INTERVAL_UNITS,
  type IntervalUnit,
  type Receipt,
  type Subscription,
} from "@/lib/data/types";
import { todayISO } from "@/lib/filters";
import { formatCurrency } from "@/lib/format";
import { buildStoreGroups } from "@/lib/stores";
import { cadenceLabel, dueChargesFor } from "@/lib/subscriptions";

/**
 * Create / edit a subscription.
 *
 * The create form validates against `newSubscriptionSchema` in both modes and
 * sends the whole object either way — an edit is a full-object PATCH, which the
 * update schema accepts since every field on it is optional. That avoids
 * maintaining a second set of form types for a form whose fields are identical.
 *
 * The one piece of real design here is the **backfill warning** (§6.9). A
 * `start_date` in the past is legitimate — it's how you record a subscription
 * you've had for a year — but a mistyped one silently generating 300 receipts
 * on the next run is the worst failure mode this feature has. So the form
 * computes `dueChargesFor()` live and states the consequence before you save.
 */
export function SubscriptionEditor({
  subscription,
  open,
  onOpenChange,
}: {
  /** Omit to create. */
  subscription?: Subscription;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const isDesktop = useMediaQuery("(min-width: 640px)");
  const title = subscription ? "Edit subscription" : "New subscription";
  const subtitle = subscription
    ? `${subscription.charges_generated} charge${
        subscription.charges_generated === 1 ? "" : "s"
      } generated so far`
    : "It generates receipts on a schedule. Nothing reads it directly.";

  const body = (
    <SubscriptionForm
      key={subscription?.id ?? "new"}
      subscription={subscription}
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
        <div className="overflow-y-auto px-4 pb-6">{body}</div>
      </DrawerContent>
    </Drawer>
  );
}

function SubscriptionForm({
  subscription,
  onClose,
}: {
  subscription?: Subscription;
  onClose: () => void;
}) {
  const addSubscription = useAddSubscription();
  const updateSubscription = useUpdateSubscription();
  const deleteSubscription = useDeleteSubscription();
  const { data: receipts } = useMergedReceipts();

  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [blockedBy, setBlockedBy] = useState<Receipt[]>([]);

  const storeSuggestions = useMemo(
    () => buildStoreGroups(receipts ?? []).map((g) => g.displayName).sort(),
    [receipts],
  );

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<NewSubscriptionFormInput, unknown, NewSubscriptionFormValues>({
    resolver: zodResolver(newSubscriptionSchema),
    defaultValues: {
      name: subscription?.name ?? "",
      store: subscription?.store ?? "",
      category: subscription?.category ?? "",
      price: subscription?.price ?? 0,
      interval_unit: subscription?.interval_unit ?? "month",
      interval_count: subscription?.interval_count ?? 1,
      start_date: subscription?.start_date ?? todayISO(),
      active: subscription?.active ?? true,
      note: subscription?.note ?? "",
    },
  });

  const store = watch("store") ?? "";
  const category = watch("category") ?? "";
  const intervalUnit = (watch("interval_unit") ?? "month") as IntervalUnit;
  const intervalCount = Number(watch("interval_count")) || 1;
  const startDate = watch("start_date") ?? "";
  const price = Number(watch("price")) || 0;
  const active = watch("active") ?? true;

  /**
   * What saving this would generate on the next run.
   *
   * Counted from `charges_generated` for an existing subscription, so editing
   * one doesn't claim it's about to re-charge history. For a new one that's 0,
   * which is exactly the backfill this warns about.
   */
  const projection = useMemo(() => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !active) return null;
    const { charges, capped } = dueChargesFor(
      {
        active: true,
        start_date: startDate,
        interval_unit: intervalUnit,
        interval_count: intervalCount,
        charges_generated: subscription?.charges_generated ?? 0,
      },
      todayISO(),
    );
    if (charges.length === 0) return null;
    return { count: charges.length, total: charges.length * price, capped };
  }, [startDate, intervalUnit, intervalCount, price, active, subscription]);

  async function onSubmit(values: NewSubscriptionFormValues) {
    const payload = {
      ...values,
      note: values.note?.trim() ? values.note.trim() : null,
    };
    try {
      if (subscription) {
        await updateSubscription.mutateAsync({
          id: subscription.id,
          patch: payload,
        });
        toast.success(`Subscription updated: ${payload.name}`);
      } else {
        await addSubscription.mutateAsync(payload);
        toast.success(`Subscription added: ${payload.name}`);
      }
      onClose();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to save subscription",
      );
    }
  }

  async function onDelete() {
    if (!subscription) return;
    if (!confirmingDelete) {
      setConfirmingDelete(true);
      return;
    }
    try {
      await deleteSubscription.mutateAsync(subscription.id);
      toast.success(`Subscription deleted: ${subscription.name}`);
      onClose();
    } catch (error) {
      // 409: it has generated receipts, which keep their provenance. The list
      // is rendered inline rather than toasted, because the next action is to
      // decide whether to pause instead.
      const linked = linkedRows<Receipt>(error);
      setBlockedBy(linked);
      setConfirmingDelete(false);
      if (linked.length === 0) {
        toast.error(
          error instanceof Error ? error.message : "Failed to delete",
        );
      }
    }
  }

  const busy =
    addSubscription.isPending ||
    updateSubscription.isPending ||
    deleteSubscription.isPending;

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="mt-2 flex flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="s-name">Name</Label>
        <Input id="s-name" placeholder="Netflix Standard" {...register("name")} />
        {errors.name && (
          <p className="text-xs text-destructive">{errors.name.message}</p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="s-store">Store (goes onto each receipt)</Label>
        <AutocompleteInput
          id="s-store"
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
        <Label htmlFor="s-category">Category</Label>
        <CategorySelect
          id="s-category"
          value={category}
          onChange={(v) => setValue("category", v, { shouldValidate: true })}
        />
        {/* D9: no catch-all "Subscriptions" category. The category answers what
            KIND of spending this is, which is the axis every chart slices by. */}
        <p className="text-xs text-muted-foreground">
          Its real category, not a catch-all — this is what every chart slices
          by, and it pins the store→category pairing for every future charge.
        </p>
        {errors.category && (
          <p className="text-xs text-destructive">{errors.category.message}</p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="s-price">Price ($)</Label>
          <Input id="s-price" type="number" step="0.01" {...register("price")} />
          {errors.price && (
            <p className="text-xs text-destructive">{errors.price.message}</p>
          )}
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="s-start">First charge date</Label>
          <Input id="s-start" type="date" {...register("start_date")} />
          {errors.start_date && (
            <p className="text-xs text-destructive">
              {errors.start_date.message}
            </p>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="s-count">Every</Label>
          <Input
            id="s-count"
            type="number"
            min="1"
            step="1"
            {...register("interval_count")}
          />
          {errors.interval_count && (
            <p className="text-xs text-destructive">
              {errors.interval_count.message}
            </p>
          )}
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="s-unit">Unit</Label>
          <Select
            value={intervalUnit}
            onValueChange={(v) =>
              setValue("interval_unit", v as IntervalUnit, {
                shouldValidate: true,
              })
            }
          >
            <SelectTrigger id="s-unit" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {INTERVAL_UNITS.map((u) => (
                <SelectItem key={u} value={u}>
                  {u}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        {cadenceLabel(intervalUnit, intervalCount)}. A monthly charge anchored on
        the 31st lands on the last day of shorter months, and never drifts back.
      </p>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="s-note">Note (optional)</Label>
        <Input id="s-note" {...register("note")} />
      </div>

      <div className="flex items-start gap-2">
        <Checkbox
          id="s-active"
          checked={active}
          onCheckedChange={(checked) =>
            setValue("active", checked === true, { shouldValidate: true })
          }
          className="mt-0.5"
        />
        <Label htmlFor="s-active" className="text-xs leading-snug font-normal">
          Active — paused subscriptions generate nothing
        </Label>
      </div>

      {projection && (
        <div className="rounded-md border border-secondary bg-secondary/5 p-3 text-xs">
          <p className="font-medium text-foreground">
            This will create {projection.count} receipt
            {projection.count === 1 ? "" : "s"} totalling{" "}
            {formatCurrency(projection.total)} on the next run.
          </p>
          <p className="mt-1 text-muted-foreground">
            {projection.count > 1
              ? "That's the catch-up for a start date in the past. If you didn't mean to backfill, check the first charge date."
              : "The first charge is already due."}
            {projection.capped &&
              " It also hits the per-run cap, which almost always means a mistyped date."}
          </p>
        </div>
      )}

      {blockedBy.length > 0 && (
        <div className="rounded-md border border-destructive/50 bg-destructive/5 p-3 text-xs">
          <p className="font-medium text-destructive">
            Can&apos;t delete — this has generated {blockedBy.length} receipt
            {blockedBy.length === 1 ? "" : "s"}. Pause it instead, or delete
            those receipts first.
          </p>
          <ul className="mt-2 flex flex-col gap-1 text-muted-foreground">
            {blockedBy.slice(0, 8).map((r) => (
              <li key={r.id} className="truncate">
                {r.date} · {r.store} · {formatCurrency(r.price)}
              </li>
            ))}
            {blockedBy.length > 8 && <li>…and {blockedBy.length - 8} more</li>}
          </ul>
        </div>
      )}

      <div className="mt-1 flex items-center gap-2">
        {subscription && (
          <Button
            type="button"
            variant={confirmingDelete ? "destructive" : "outline"}
            onClick={onDelete}
            disabled={busy}
            title={
              confirmingDelete
                ? "Click again to permanently delete"
                : "Delete subscription"
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
          {busy ? "Saving…" : subscription ? "Save changes" : "Add subscription"}
        </Button>
      </div>
    </form>
  );
}
