import { z } from "zod";

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Expected date format YYYY-MM-DD");

// Shared between the quick-add form (client-side validation/UX) and the
// API route handlers (the actual trust boundary — never rely on the form
// alone for a write path).
export const newReceiptSchema = z.object({
  store: z.string().trim().min(1, "Store is required"),
  category: z.string().trim().min(1, "Category is required"),
  price: z.coerce.number().positive("Price must be greater than 0"),
  discount: z.coerce.number().min(0).default(0),
  discount_percentage: z.coerce.number().min(0).max(100).default(0),
  note: z.string().trim().optional().nullable(),
  date: isoDate,
});

export const newDisbursementSchema = z.object({
  entity: z.string().trim().min(1, "Entity is required"),
  amount: z.coerce.number().positive("Amount must be greater than 0"),
  date_received: isoDate,
  reason: z.string().trim().optional().nullable(),
  // Not coerced, unlike the money fields: this one never passes through a text
  // input. The combobox writes a number (or null) with `setValue`, and the API
  // reads it off JSON. Coercing would widen the *input* type to `unknown`, and
  // react-hook-form's `DeepPartial<unknown>` is `{}` — which `null` can't be
  // assigned to, breaking the form's `defaultValues`.
  refunded_from_receipt: z.number().int().positive().optional().nullable(),
});

// The form needs both ends of the schema. `z.coerce` means what react-hook-form
// holds while you type (`Input` — a number field's DOM value is a string) is not
// what the resolver hands to `onSubmit` (`Values` — coerced, defaults applied),
// so `useForm` has to be told both: `useForm<Input, unknown, Values>`.
export type NewReceiptFormInput = z.input<typeof newReceiptSchema>;
export type NewDisbursementFormInput = z.input<typeof newDisbursementSchema>;
export type NewReceiptFormValues = z.output<typeof newReceiptSchema>;
export type NewDisbursementFormValues = z.output<typeof newDisbursementSchema>;
