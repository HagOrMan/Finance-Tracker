// Ported verbatim from the old Gooey uploader script's CATEGORY_OPTIONS.
export const CATEGORY_OPTIONS = [
  "Groceries",
  "Eating Out (Stressed)",
  "Eating Out (Social)",
  "Social",
  "Health",
  "Rent",
  "School",
  "Transportation",
  "Gift",
  "Professional Development (including events)",
  "Travel",
  "Other",
] as const;

export interface Receipt {
  id: number;
  store: string;
  category: string;
  price: number;
  discount: number;
  discount_percentage: number;
  note: string | null;
  date: string; // YYYY-MM-DD, always treated as a plain string — never parsed with `new Date()`
  /**
   * Null for hand-entered receipts; set for cron-generated subscription charges.
   * The column itself doesn't exist until Phase 3's migration — until then both
   * data sources hardcode `null`. It lives in the type from Phase 0 so the code
   * that consumes receipts doesn't have to change shape twice.
   */
  subscription_id: number | null;
  /** Display-only ("last edited"). Never sent on a write — the DB trigger owns it. */
  updated_at: string;
}

export interface Disbursement {
  id: number;
  entity: string;
  amount: number;
  date_received: string; // YYYY-MM-DD
  reason: string | null;
  refunded_from_receipt: number | null;
  /** Display-only ("last edited"). Never sent on a write — the DB trigger owns it. */
  updated_at: string;
}

export interface MergedReceipt extends Receipt {
  total_refunded: number;
  actual_price: number;
}

export interface NewReceiptInput {
  store: string;
  category: string;
  price: number;
  discount?: number;
  discount_percentage?: number;
  note?: string | null;
  date: string;
}

export interface NewDisbursementInput {
  entity: string;
  amount: number;
  date_received: string;
  reason?: string | null;
  refunded_from_receipt?: number | null;
}

/**
 * Patch shapes for the edit path.
 *
 * Built from `Pick` rather than `Partial<NewReceiptInput>` on purpose: the
 * fields a caller may change are exactly the fields it may *set*, and nothing
 * else. `id`, `created_at`, `updated_at` and `subscription_id` are absent by
 * construction, which is half of why a patch can never rewrite provenance.
 * The other half is that route handlers build the patch only from
 * `parsed.data` (zod strips unknown keys) — see FEATURES.md §3.3.
 */
export type UpdateReceiptInput = Partial<
  Pick<
    Receipt,
    | "store"
    | "category"
    | "price"
    | "discount"
    | "discount_percentage"
    | "note"
    | "date"
  >
>;

export type UpdateDisbursementInput = Partial<
  Pick<
    Disbursement,
    "entity" | "amount" | "date_received" | "reason" | "refunded_from_receipt"
  >
>;

export interface DataSource {
  loadReceipts(): Promise<Receipt[]>;
  loadDisbursements(): Promise<Disbursement[]>;
  loadMergedReceipts(): Promise<MergedReceipt[]>;
  insertReceipt(input: NewReceiptInput): Promise<Receipt>;
  insertDisbursement(input: NewDisbursementInput): Promise<Disbursement>;

  /** Throws `NotFoundError` when no row has that id. */
  updateReceipt(id: number, patch: UpdateReceiptInput): Promise<Receipt>;
  /**
   * Bulk patch by id list (FEATURES.md D7). Returns only the rows that existed
   * — a shorter array than `ids` means some ids didn't match, which is not an
   * error: the client's cached list can lag a delete.
   */
  updateReceipts(ids: number[], patch: UpdateReceiptInput): Promise<Receipt[]>;
  /** Throws `NotFoundError`, or `ForeignKeyViolationError` if a refund points at it. */
  deleteReceipt(id: number): Promise<void>;
  /** For the delete guard — the disbursements that would block a delete. */
  disbursementsForReceipt(id: number): Promise<Disbursement[]>;

  updateDisbursement(
    id: number,
    patch: UpdateDisbursementInput,
  ): Promise<Disbursement>;
  updateDisbursements(
    ids: number[],
    patch: UpdateDisbursementInput,
  ): Promise<Disbursement[]>;
  deleteDisbursement(id: number): Promise<void>;
}
