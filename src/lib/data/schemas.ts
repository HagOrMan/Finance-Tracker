import { z } from "zod";

import { INTERVAL_UNITS } from "./types";

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Expected date format YYYY-MM-DD");

// ---------------------------------------------------------------------------
// Field definitions, WITHOUT defaults.
//
// The defaults live on `newReceiptSchema` alone, and that separation is
// load-bearing rather than stylistic. Writing `newReceiptSchema.partial()` for
// the update schema would carry `.default(0)` along with it, so a PATCH that
// only touches `category` would arrive at the data layer carrying
// `discount: 0` — silently zeroing a real discount on every unrelated edit.
// A defaults-free base makes that impossible to reintroduce by accident.
// ---------------------------------------------------------------------------
const receiptFields = {
  store: z.string().trim().min(1, "Store is required"),
  category: z.string().trim().min(1, "Category is required"),
  price: z.coerce.number().positive("Price must be greater than 0"),
  discount: z.coerce.number().min(0),
  discount_percentage: z.coerce.number().min(0).max(100),
  note: z.string().trim().nullable().optional(),
  date: isoDate,
} as const;

const disbursementFields = {
  entity: z.string().trim().min(1, "Entity is required"),
  amount: z.coerce.number().positive("Amount must be greater than 0"),
  date_received: isoDate,
  reason: z.string().trim().nullable().optional(),
  // Not coerced, unlike the money fields: this one never passes through a text
  // input. The combobox writes a number (or null) with `setValue`, and the API
  // reads it off JSON. Coercing would widen the *input* type to `unknown`, and
  // react-hook-form's `DeepPartial<unknown>` is `{}` — which `null` can't be
  // assigned to, breaking the form's `defaultValues`.
  refunded_from_receipt: z.number().int().positive().nullable().optional(),
} as const;

// ---------------------------------------------------------------------------
// Create — shared between the quick-add form (client-side validation/UX) and
// the API route handlers (the actual trust boundary — never rely on the form
// alone for a write path).
// ---------------------------------------------------------------------------
export const newReceiptSchema = z.object({
  ...receiptFields,
  discount: receiptFields.discount.default(0),
  discount_percentage: receiptFields.discount_percentage.default(0),
});

export const newDisbursementSchema = z.object(disbursementFields);

// ---------------------------------------------------------------------------
// Update — every field optional, but at least one required.
//
// Optional means "not being changed", NOT "clear it". An empty string still
// fails `.min(1)`, so a blanked-out Store is a validation error rather than a
// row that quietly loses its name. `note` / `reason` are the two fields that
// *can* be cleared, by sending an explicit `null`.
// ---------------------------------------------------------------------------
export const updateReceiptSchema = z
  .object(receiptFields)
  .partial()
  .refine((v) => Object.keys(v).length > 0, "No fields to update");

export const updateDisbursementSchema = z
  .object(disbursementFields)
  .partial()
  .refine((v) => Object.keys(v).length > 0, "No fields to update");

// ---------------------------------------------------------------------------
// Bulk update — id-list based, not filter-based (ARCHITECTURE.md).
//
// One endpoint per table covers recategorize, rename and merge, because all
// three are "apply this patch to these rows". The client already holds every
// receipt, so it can compute the id list itself and the server never has to
// re-derive a filter it can't see.
//
// The 1000 cap is a blast-radius limit, not a performance one: a bulk write is
// unlogged and un-undoable, and no honest UI action selects more than that.
// ---------------------------------------------------------------------------
const idList = z.array(z.number().int().positive()).min(1).max(1000);

export const bulkUpdateReceiptsSchema = z.object({
  ids: idList,
  patch: updateReceiptSchema,
});

export const bulkUpdateDisbursementsSchema = z.object({
  ids: idList,
  patch: updateDisbursementSchema,
});

// ---------------------------------------------------------------------------
// Subscriptions (Phase 3)
//
// Same defaults-free base as receipts, for the same reason: `interval_count`
// and `active` carry defaults on create, and a `.partial()` of the *defaulted*
// schema would resurrect a paused subscription on any unrelated PATCH.
//
// `charges_generated` is absent by construction. It's the runner's bookkeeping,
// and nothing reachable from a form may write it — the next charge date is
// derived from it, so a stray value would silently reschedule the whole series.
// ---------------------------------------------------------------------------
const subscriptionFields = {
  name: z.string().trim().min(1, "Name is required"),
  store: z.string().trim().min(1, "Store is required"),
  category: z.string().trim().min(1, "Category is required"),
  price: z.coerce.number().positive("Price must be greater than 0"),
  interval_unit: z.enum(INTERVAL_UNITS),
  interval_count: z.coerce
    .number()
    .int()
    .min(1, "Interval must be at least 1")
    .max(365, "Interval is unreasonably large"),
  start_date: isoDate,
  active: z.boolean(),
  note: z.string().trim().nullable().optional(),
} as const;

export const newSubscriptionSchema = z.object({
  ...subscriptionFields,
  interval_count: subscriptionFields.interval_count.default(1),
  active: subscriptionFields.active.default(true),
});

export const updateSubscriptionSchema = z
  .object(subscriptionFields)
  .partial()
  .refine((v) => Object.keys(v).length > 0, "No fields to update");

// The form needs both ends of the schema. `z.coerce` means what react-hook-form
// holds while you type (`Input` — a number field's DOM value is a string) is not
// what the resolver hands to `onSubmit` (`Values` — coerced, defaults applied),
// so `useForm` has to be told both: `useForm<Input, unknown, Values>`.
export type NewReceiptFormInput = z.input<typeof newReceiptSchema>;
export type NewDisbursementFormInput = z.input<typeof newDisbursementSchema>;
export type NewReceiptFormValues = z.output<typeof newReceiptSchema>;
export type NewDisbursementFormValues = z.output<typeof newDisbursementSchema>;

export type UpdateReceiptFormInput = z.input<typeof updateReceiptSchema>;
export type UpdateDisbursementFormInput = z.input<
  typeof updateDisbursementSchema
>;
export type UpdateReceiptFormValues = z.output<typeof updateReceiptSchema>;
export type UpdateDisbursementFormValues = z.output<
  typeof updateDisbursementSchema
>;

export type NewSubscriptionFormInput = z.input<typeof newSubscriptionSchema>;
export type NewSubscriptionFormValues = z.output<typeof newSubscriptionSchema>;
export type UpdateSubscriptionFormInput = z.input<
  typeof updateSubscriptionSchema
>;
export type UpdateSubscriptionFormValues = z.output<
  typeof updateSubscriptionSchema
>;
