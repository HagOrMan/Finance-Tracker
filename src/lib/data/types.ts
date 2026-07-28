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
   * `SqliteDataSource` always reports `null` — the column arrives in a
   * Postgres-only migration and that dev database has no such table.
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
 * `parsed.data` (zod strips unknown keys) — see ARCHITECTURE.md.
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

// ---------------------------------------------------------------------------
// Subscriptions (Phase 3)
//
// A subscription is a SCHEDULE, not a spend record. Nothing in the app's math
// reads this type — the cron generates receipts from it, and the receipts are
// what every chart, filter and total already understands. See ARCHITECTURE.md.
// ---------------------------------------------------------------------------

export const INTERVAL_UNITS = ["day", "week", "month", "year"] as const;
export type IntervalUnit = (typeof INTERVAL_UNITS)[number];

export interface Subscription {
  id: number;
  /** Human label, e.g. "Netflix Standard". Not written onto the receipt. */
  name: string;
  /** Copied onto each generated receipt. */
  store: string;
  /**
   * Copied onto each generated receipt. Deliberately the subscription's *real*
   * category, not a catch-all "Subscriptions" one (D9) — the category answers
   * "what kind of spending is this", which is the axis every chart slices by.
   */
  category: string;
  /** CURRENT price only. Past charges are receipts, and receipts are facts (D4). */
  price: number;
  interval_unit: IntervalUnit;
  interval_count: number;
  /** Date of the FIRST charge. */
  start_date: string;
  /**
   * How many charges have been written. The next charge date is *derived* from
   * this and `start_date`, never stored — nothing can desync from itself.
   * Internal bookkeeping: absent from `UpdateSubscriptionInput` on purpose.
   */
  charges_generated: number;
  active: boolean;
  note: string | null;
  created_at: string;
  updated_at: string;
}

export interface NewSubscriptionInput {
  name: string;
  store: string;
  category: string;
  price: number;
  interval_unit: IntervalUnit;
  interval_count?: number;
  start_date: string;
  active?: boolean;
  note?: string | null;
}

export type UpdateSubscriptionInput = Partial<
  Pick<
    Subscription,
    | "name"
    | "store"
    | "category"
    | "price"
    | "interval_unit"
    | "interval_count"
    | "start_date"
    | "active"
    | "note"
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
   * Bulk patch by id list (ARCHITECTURE.md). Returns only the rows that existed
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

  // -------------------------------------------------------------------------
  // Subscriptions (Phase 3). `SqliteDataSource` throws on every one of these:
  // that mode is dev-only and its database has no such table (D8).
  // -------------------------------------------------------------------------

  loadSubscriptions(): Promise<Subscription[]>;
  insertSubscription(input: NewSubscriptionInput): Promise<Subscription>;
  updateSubscription(
    id: number,
    patch: UpdateSubscriptionInput,
  ): Promise<Subscription>;
  /** Throws `ForeignKeyViolationError` when generated receipts reference it. */
  deleteSubscription(id: number): Promise<void>;
  /** For the delete guard — the receipts this subscription generated. */
  receiptsForSubscription(id: number): Promise<Receipt[]>;

  /**
   * Writes one generated charge as a receipt.
   *
   * Throws `UniqueViolationError` when a charge for that (subscription, date)
   * already exists. The caller **must** treat that as success-already-recorded
   * rather than a failure — see ARCHITECTURE.md. It is the mechanism that
   * makes the runner self-repairing without transactions.
   */
  insertSubscriptionCharge(
    subscription: Subscription,
    date: string,
  ): Promise<Receipt>;

  /**
   * Advances the charge counter. Separate from `updateSubscription` because
   * `charges_generated` is bookkeeping the runner owns — exposing it on the
   * user-facing patch type would let a form desync the schedule.
   */
  setChargesGenerated(id: number, count: number): Promise<void>;
}
