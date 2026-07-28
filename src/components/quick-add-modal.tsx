"use client";

import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Check, ChevronsUpDown, Plus } from "lucide-react";
import { toast } from "sonner";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Drawer,
  DrawerBody,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { AutocompleteInput } from "@/components/autocomplete-input";
import { CategorySelect } from "@/components/category-select";
import { useMediaQuery } from "@/hooks/use-media-query";
import {
  useAddDisbursement,
  useAddReceipt,
  useDisbursements,
  useMergedReceipts,
} from "@/hooks/use-finance-data";
import {
  newDisbursementSchema,
  newReceiptSchema,
  type NewDisbursementFormInput,
  type NewDisbursementFormValues,
  type NewReceiptFormInput,
  type NewReceiptFormValues,
} from "@/lib/data/schemas";
import { todayISO } from "@/lib/filters";
import { nameGroupKey } from "@/lib/name-groups";
import { buildStoreGroups } from "@/lib/stores";

export function QuickAddButton() {
  const [open, setOpen] = useState(false);
  const isDesktop = useMediaQuery("(min-width: 640px)");

  const trigger = (
    <Button
      type="button"
      size="icon"
      // Bottom offset clears the iOS home indicator — `viewportFit: "cover"` in
      // the root layout is what makes `env(safe-area-inset-bottom)` non-zero.
      className="fixed right-6 bottom-[max(1.5rem,calc(env(safe-area-inset-bottom)+0.5rem))] z-30 size-14 rounded-full shadow-lg"
      aria-label="Quick add"
    >
      <Plus className="size-6" />
    </Button>
  );

  if (isDesktop) {
    return (
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>{trigger}</DialogTrigger>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Quick add</DialogTitle>
            <DialogDescription>Log a new receipt or disbursement.</DialogDescription>
          </DialogHeader>
          <QuickAddForm onDone={() => setOpen(false)} />
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Drawer open={open} onOpenChange={setOpen}>
      <DrawerTrigger asChild>{trigger}</DrawerTrigger>
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle>Quick add</DrawerTitle>
          <DrawerDescription>Log a new receipt or disbursement.</DrawerDescription>
        </DrawerHeader>
        {/* DrawerBody, not a plain div — see its doc comment. A plain wrapper
            is what made every downward swipe drag the whole sheet closed. */}
        <DrawerBody>
          <QuickAddForm onDone={() => setOpen(false)} />
        </DrawerBody>
      </DrawerContent>
    </Drawer>
  );
}

function QuickAddForm({ onDone }: { onDone: () => void }) {
  // Lifted above the tabs so the choice survives switching between them —
  // a bulk-entry session is usually a mix of receipts and disbursements.
  const [bulk, setBulk] = useState(false);

  return (
    <Tabs defaultValue="receipt" className="mt-2">
      <TabsList className="w-full">
        <TabsTrigger value="receipt" className="flex-1">
          Receipt
        </TabsTrigger>
        <TabsTrigger value="disbursement" className="flex-1">
          Disbursement
        </TabsTrigger>
      </TabsList>
      <TabsContent value="receipt">
        <ReceiptForm onDone={onDone} bulk={bulk} onBulkChange={setBulk} />
      </TabsContent>
      <TabsContent value="disbursement">
        <DisbursementForm onDone={onDone} bulk={bulk} onBulkChange={setBulk} />
      </TabsContent>
    </Tabs>
  );
}

/** Props every quick-add tab takes. */
type FormProps = {
  onDone: () => void;
  bulk: boolean;
  onBulkChange: (value: boolean) => void;
};

function BulkAddToggle({
  id,
  bulk,
  onBulkChange,
}: {
  id: string;
} & Pick<FormProps, "bulk" | "onBulkChange">) {
  return (
    <div className="mt-2 flex items-start gap-2">
      <Checkbox
        id={id}
        checked={bulk}
        // Radix hands back `boolean | "indeterminate"`; this checkbox never is.
        onCheckedChange={(checked) => onBulkChange(checked === true)}
        className="mt-0.5"
      />
      <Label htmlFor={id} className="text-xs leading-snug font-normal text-muted-foreground">
        Keep adding — stay open and leave the fields as they are
      </Label>
    </div>
  );
}

function ReceiptForm({ onDone, bulk, onBulkChange }: FormProps) {
  const addReceipt = useAddReceipt();
  const { data: receipts } = useMergedReceipts();

  // Store stays free text, but every store already used is offered as a
  // suggestion so the same shop doesn't end up spelled two ways.
  //
  // Suggestions are the *group display names* rather than every raw spelling:
  // picking one hands back the canonical spelling, so accepting a suggestion
  // can only reduce drift, never add a variant back. Same grouping the Stores
  // page uses, so the two never disagree about what one store is.
  const storeGroups = useMemo(
    () => buildStoreGroups(receipts ?? []),
    [receipts],
  );
  const storeSuggestions = useMemo(
    () => storeGroups.map((g) => g.displayName).sort(),
    [storeGroups],
  );

  // Tracked by hand rather than read off `formState.touchedFields`: the
  // category is written with `setValue`, which doesn't mark a field touched.
  const [categoryTouched, setCategoryTouched] = useState(false);
  const [autofilled, setAutofilled] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
    reset,
  } = useForm<NewReceiptFormInput, unknown, NewReceiptFormValues>({
    resolver: zodResolver(newReceiptSchema),
    defaultValues: {
      store: "",
      category: "",
      price: 0,
      discount: 0,
      discount_percentage: 0,
      note: "",
      date: todayISO(),
    },
  });

  const store = watch("store");
  const category = watch("category");

  // The group the currently-typed store belongs to, if it's one we've seen.
  const knownStore = useMemo(
    () => storeGroups.find((g) => g.key === nameGroupKey(store ?? "")),
    [storeGroups, store],
  );

  /**
   * Category autofill (FEATURES.md §4.6). The Stores page finds mis-filed
   * receipts; this is what stops them being created.
   *
   * Derived from history — deliberately **no store→category defaults table**.
   * A second place that knows what category a store belongs to is exactly what
   * §0 forbids; the receipts already say it.
   *
   * Only fills when the category is still empty and untouched, so it can never
   * overwrite a deliberate choice — including one carried over from the
   * previous entry in a bulk-add session.
   */
  function handleStorePick(value: string) {
    setValue("store", value, { shouldValidate: true });

    const group = storeGroups.find((g) => g.key === nameGroupKey(value));
    if (!group?.dominantCategory) return;
    if (categoryTouched || category) return;

    setValue("category", group.dominantCategory, { shouldValidate: true });
    setAutofilled(group.dominantCategory);
  }

  const categoryHint =
    autofilled && category === autofilled
      ? `Filled from history — ${knownStore?.displayName ?? "this store"} is usually ${autofilled}.`
      : knownStore?.dominantCategory && knownStore.dominantCategory !== category
        ? `${knownStore.displayName} is usually ${knownStore.dominantCategory}.`
        : null;

  async function onSubmit(values: NewReceiptFormValues) {
    try {
      await addReceipt.mutateAsync(values);
      toast.success(`Receipt added: ${values.store} — $${values.price.toFixed(2)}`);
      if (bulk) {
        // Deliberately no `reset` — the point of bulk mode is that the next
        // receipt is usually a small edit of this one.
        return;
      }
      reset({
        store: "",
        category: "",
        price: 0,
        discount: 0,
        discount_percentage: 0,
        note: "",
        date: values.date,
      });
      setCategoryTouched(false);
      setAutofilled(null);
      onDone();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to add receipt");
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="mt-4 flex flex-col gap-3">
      <div className="flex min-w-0 flex-col gap-1.5">
        <Label htmlFor="r-store">Store</Label>
        <AutocompleteInput
          id="r-store"
          query={store}
          suggestions={storeSuggestions}
          onPick={handleStorePick}
          {...register("store")}
        />
        {errors.store && <p className="text-xs text-destructive">{errors.store.message}</p>}
      </div>

      <div className="flex min-w-0 flex-col gap-1.5">
        <Label htmlFor="r-category">Category</Label>
        <CategorySelect
          id="r-category"
          value={category}
          onChange={(v) => {
            setCategoryTouched(true);
            setAutofilled(null);
            setValue("category", v, { shouldValidate: true });
          }}
        />
        {errors.category && (
          <p className="text-xs text-destructive">{errors.category.message}</p>
        )}
        {!errors.category && categoryHint && (
          <p className="text-xs text-muted-foreground">{categoryHint}</p>
        )}
      </div>

      {/* One column in the mobile drawer, two in the desktop dialog — and
          since the drawer only renders below 640px and the dialog only at or
          above it, `sm:` splits them exactly. Pairing Price with Date at
          390px left the date field wider than its column, which is what was
          scrolling the sheet sideways. */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="flex min-w-0 flex-col gap-1.5">
          <Label htmlFor="r-price">Price ($)</Label>
          {/* `inputMode="decimal"` so mobile opens the numeric keypad with a
              decimal point — `type="number"` alone gives a keypad without one
              on several Android keyboards. */}
          <Input
            id="r-price"
            type="number"
            inputMode="decimal"
            step="0.01"
            {...register("price")}
          />
          {errors.price && <p className="text-xs text-destructive">{errors.price.message}</p>}
        </div>
        <div className="flex min-w-0 flex-col gap-1.5">
          <Label htmlFor="r-date">Date</Label>
          <Input id="r-date" type="date" {...register("date")} />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="flex min-w-0 flex-col gap-1.5">
          <Label htmlFor="r-discount">Discount ($)</Label>
          <Input
            id="r-discount"
            type="number"
            inputMode="decimal"
            step="0.01"
            {...register("discount")}
          />
        </div>
        <div className="flex min-w-0 flex-col gap-1.5">
          <Label htmlFor="r-discount-pct">Discount (%)</Label>
          <Input
            id="r-discount-pct"
            type="number"
            inputMode="decimal"
            step="0.1"
            {...register("discount_percentage")}
          />
        </div>
      </div>

      <div className="flex min-w-0 flex-col gap-1.5">
        <Label htmlFor="r-note">Note (optional)</Label>
        <Input id="r-note" {...register("note")} />
      </div>

      <BulkAddToggle id="r-bulk" bulk={bulk} onBulkChange={onBulkChange} />

      <Button type="submit" disabled={addReceipt.isPending} className="mt-1">
        {addReceipt.isPending ? "Adding…" : bulk ? "Add receipt & keep going" : "Add receipt"}
      </Button>
    </form>
  );
}

function DisbursementForm({ onDone, bulk, onBulkChange }: FormProps) {
  const addDisbursement = useAddDisbursement();
  const { data: receipts } = useMergedReceipts();
  const { data: disbursements } = useDisbursements();
  const [comboOpen, setComboOpen] = useState(false);

  // Same treatment the Store field gets: free text, but every entity already
  // used is offered so the same payer doesn't end up spelled two ways.
  const entitySuggestions = useMemo(
    () => [...new Set((disbursements ?? []).map((d) => d.entity))].sort(),
    [disbursements],
  );

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
    reset,
  } = useForm<NewDisbursementFormInput, unknown, NewDisbursementFormValues>({
    resolver: zodResolver(newDisbursementSchema),
    defaultValues: {
      entity: "",
      amount: 0,
      date_received: todayISO(),
      reason: "",
      refunded_from_receipt: null,
    },
  });

  const entity = watch("entity");
  const refundedFromReceipt = watch("refunded_from_receipt");
  const linkedReceipt = receipts?.find((r) => r.id === refundedFromReceipt);

  async function onSubmit(values: NewDisbursementFormValues) {
    try {
      await addDisbursement.mutateAsync(values);
      toast.success(`Disbursement added: ${values.entity} — $${values.amount.toFixed(2)}`);
      if (bulk) return;
      reset({
        entity: "",
        amount: 0,
        date_received: values.date_received,
        reason: "",
        refunded_from_receipt: null,
      });
      onDone();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to add disbursement");
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="mt-4 flex flex-col gap-3">
      <div className="flex min-w-0 flex-col gap-1.5">
        <Label htmlFor="d-entity">Entity</Label>
        <AutocompleteInput
          id="d-entity"
          query={entity}
          suggestions={entitySuggestions}
          onPick={(value) => setValue("entity", value, { shouldValidate: true })}
          {...register("entity")}
        />
        {errors.entity && <p className="text-xs text-destructive">{errors.entity.message}</p>}
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="flex min-w-0 flex-col gap-1.5">
          <Label htmlFor="d-amount">Amount ($)</Label>
          <Input
            id="d-amount"
            type="number"
            inputMode="decimal"
            step="0.01"
            {...register("amount")}
          />
          {errors.amount && <p className="text-xs text-destructive">{errors.amount.message}</p>}
        </div>
        <div className="flex min-w-0 flex-col gap-1.5">
          <Label htmlFor="d-date">Date received</Label>
          <Input id="d-date" type="date" {...register("date_received")} />
        </div>
      </div>

      <div className="flex min-w-0 flex-col gap-1.5">
        <Label htmlFor="d-reason">Reason (optional)</Label>
        <Input id="d-reason" {...register("reason")} />
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
          {/* Was a flat 320px, which overflows the screen edge on a narrow
              phone once the drawer's own padding is accounted for. */}
          <PopoverContent
            className="w-[min(20rem,calc(100vw-2rem))] p-0"
            align="start"
          >
            <Command>
              <CommandInput placeholder="Search receipts…" />
              <CommandList>
                <CommandEmpty>No receipts found.</CommandEmpty>
                <CommandGroup>
                  <CommandItem
                    onSelect={() => {
                      setValue("refunded_from_receipt", null);
                      setComboOpen(false);
                    }}
                  >
                    <Check
                      className={cn(
                        "mr-2 size-4",
                        refundedFromReceipt == null ? "opacity-100" : "opacity-0"
                      )}
                    />
                    Not linked
                  </CommandItem>
                  {(receipts ?? []).map((r) => (
                    <CommandItem
                      key={r.id}
                      value={`${r.date} ${r.store} ${r.category} ${r.id}`}
                      onSelect={() => {
                        setValue("refunded_from_receipt", r.id, { shouldValidate: true });
                        setComboOpen(false);
                      }}
                    >
                      <Check
                        className={cn(
                          "mr-2 size-4",
                          refundedFromReceipt === r.id ? "opacity-100" : "opacity-0"
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

      <BulkAddToggle id="d-bulk" bulk={bulk} onBulkChange={onBulkChange} />

      <Button type="submit" disabled={addDisbursement.isPending} className="mt-1">
        {addDisbursement.isPending
          ? "Adding…"
          : bulk
            ? "Add disbursement & keep going"
            : "Add disbursement"}
      </Button>
    </form>
  );
}
