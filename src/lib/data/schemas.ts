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
  refunded_from_receipt: z.coerce.number().int().positive().optional().nullable(),
});

export type NewReceiptFormValues = z.infer<typeof newReceiptSchema>;
export type NewDisbursementFormValues = z.infer<typeof newDisbursementSchema>;
