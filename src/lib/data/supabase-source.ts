import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/types/database";
import type {
  DataSource,
  Receipt,
  Disbursement,
  MergedReceipt,
  NewReceiptInput,
  NewDisbursementInput,
  UpdateReceiptInput,
  UpdateDisbursementInput,
} from "./types";
import { ForeignKeyViolationError, NotFoundError } from "./errors";
import { mergeReceipts } from "./merge";

// Dedicated schema (not `public`) — see migration.md §3 for rationale. Must
// be added to Supabase's "exposed schemas" API setting or these calls 404.
const SCHEMA = "finance_tracker";

// Named once so a select and its matching `.select()` on a write can't drift.
// `subscription_id` is deliberately absent: the column doesn't exist until
// Phase 3's migration, and selecting a missing column is a 400 from PostgREST.
const RECEIPT_COLUMNS =
  "id, store, category, price, discount, discount_percentage, note, date, updated_at";
const DISBURSEMENT_COLUMNS =
  "id, entity, amount, date_received, reason, refunded_from_receipt, updated_at";

type SelectedReceiptRow = Omit<Receipt, "subscription_id">;

function toReceipt(row: SelectedReceiptRow): Receipt {
  return {
    ...row,
    // Defensive, same as SqliteDataSource — the schema defaults these to 0,
    // but don't assume every row was written through that constraint.
    discount: row.discount ?? 0,
    discount_percentage: row.discount_percentage ?? 0,
    // Phase 3 adds the column and RECEIPT_COLUMNS starts selecting it. Until
    // then the field exists in the type with no source behind it.
    subscription_id: null,
  };
}

/**
 * Drops `undefined` values while keeping `null`s.
 *
 * The distinction is the whole contract of a patch: `undefined` means "not
 * being changed" and must not reach the UPDATE, while `null` means "clear this
 * field" and must. `JSON.stringify` would drop the undefined keys anyway, but
 * relying on that leaves the invariant undocumented and one refactor away from
 * breaking.
 */
function definedEntries<T extends object>(patch: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(patch).filter(([, value]) => value !== undefined),
  ) as Partial<T>;
}

/** PostgREST surfaces a blocked delete as `23503: foreign_key_violation`. */
function isForeignKeyViolation(error: PostgrestError): boolean {
  return error.code === "23503";
}

/**
 * Expects the SECRET-key client from `src/lib/supabase/service.ts` — these
 * tables grant nothing to `anon`/`authenticated`, so a session-scoped client
 * gets `42501` on every call. Authorization happens before this class is
 * reached; nothing here checks who is asking.
 */
export class SupabaseDataSource implements DataSource {
  constructor(private readonly supabase: SupabaseClient<Database>) {}

  async loadReceipts(): Promise<Receipt[]> {
    const { data, error } = await this.supabase
      .schema(SCHEMA)
      .from("receipts")
      .select(RECEIPT_COLUMNS)
      .order("date", { ascending: false });
    if (error) throw new Error(`Failed to load receipts: ${error.message}`);
    return (data as SelectedReceiptRow[]).map(toReceipt);
  }

  async loadDisbursements(): Promise<Disbursement[]> {
    const { data, error } = await this.supabase
      .schema(SCHEMA)
      .from("disbursements")
      .select(DISBURSEMENT_COLUMNS)
      .order("date_received", { ascending: false });
    if (error) throw new Error(`Failed to load disbursements: ${error.message}`);
    return data as Disbursement[];
  }

  async loadMergedReceipts(): Promise<MergedReceipt[]> {
    const [receipts, disbursements] = await Promise.all([
      this.loadReceipts(),
      this.loadDisbursements(),
    ]);
    return mergeReceipts(receipts, disbursements);
  }

  async insertReceipt(input: NewReceiptInput): Promise<Receipt> {
    const { data, error } = await this.supabase
      .schema(SCHEMA)
      .from("receipts")
      .insert({
        store: input.store,
        category: input.category,
        price: input.price,
        discount: input.discount ?? 0,
        discount_percentage: input.discount_percentage ?? 0,
        note: input.note ?? null,
        date: input.date,
      })
      .select(RECEIPT_COLUMNS)
      .single();
    if (error) throw new Error(`Failed to insert receipt: ${error.message}`);
    return toReceipt(data as SelectedReceiptRow);
  }

  async insertDisbursement(input: NewDisbursementInput): Promise<Disbursement> {
    const { data, error } = await this.supabase
      .schema(SCHEMA)
      .from("disbursements")
      .insert({
        entity: input.entity,
        amount: input.amount,
        date_received: input.date_received,
        reason: input.reason ?? null,
        refunded_from_receipt: input.refunded_from_receipt ?? null,
      })
      .select(DISBURSEMENT_COLUMNS)
      .single();
    if (error) throw new Error(`Failed to insert disbursement: ${error.message}`);
    return data as Disbursement;
  }

  // -------------------------------------------------------------------------
  // Mutation
  //
  // Every update returns the stored rows rather than echoing the patch, so the
  // caller sees what the database actually holds — including the `updated_at`
  // the trigger just wrote, which no client is allowed to set.
  // -------------------------------------------------------------------------

  async updateReceipt(id: number, patch: UpdateReceiptInput): Promise<Receipt> {
    const rows = await this.updateReceipts([id], patch);
    const row = rows[0];
    if (!row) throw new NotFoundError(`Receipt ${id} not found`);
    return row;
  }

  async updateReceipts(
    ids: number[],
    patch: UpdateReceiptInput,
  ): Promise<Receipt[]> {
    if (ids.length === 0) return [];
    const payload = definedEntries(patch);
    // An UPDATE with nothing to set is a PostgREST error, not a no-op. Callers
    // reach this only through a zod schema that requires at least one field,
    // so treat it as "read them back unchanged" rather than a failure.
    if (Object.keys(payload).length === 0) return this.receiptsByIds(ids);

    const { data, error } = await this.supabase
      .schema(SCHEMA)
      .from("receipts")
      .update(payload)
      .in("id", ids)
      .select(RECEIPT_COLUMNS);
    if (error) throw new Error(`Failed to update receipts: ${error.message}`);
    return (data as SelectedReceiptRow[]).map(toReceipt);
  }

  private async receiptsByIds(ids: number[]): Promise<Receipt[]> {
    const { data, error } = await this.supabase
      .schema(SCHEMA)
      .from("receipts")
      .select(RECEIPT_COLUMNS)
      .in("id", ids);
    if (error) throw new Error(`Failed to load receipts: ${error.message}`);
    return (data as SelectedReceiptRow[]).map(toReceipt);
  }

  async deleteReceipt(id: number): Promise<void> {
    const { data, error } = await this.supabase
      .schema(SCHEMA)
      .from("receipts")
      .delete()
      .eq("id", id)
      .select("id");

    if (error) {
      // The check-then-delete window in the route handler is a race; this is
      // the same 409, caught on the other side of it.
      if (isForeignKeyViolation(error)) {
        throw new ForeignKeyViolationError(
          "A disbursement refunds this receipt. Delete or unlink it first.",
        );
      }
      throw new Error(`Failed to delete receipt: ${error.message}`);
    }
    if (!data || data.length === 0) {
      throw new NotFoundError(`Receipt ${id} not found`);
    }
  }

  async disbursementsForReceipt(id: number): Promise<Disbursement[]> {
    const { data, error } = await this.supabase
      .schema(SCHEMA)
      .from("disbursements")
      .select(DISBURSEMENT_COLUMNS)
      .eq("refunded_from_receipt", id)
      .order("date_received", { ascending: false });
    if (error) {
      throw new Error(`Failed to load linked disbursements: ${error.message}`);
    }
    return data as Disbursement[];
  }

  async updateDisbursement(
    id: number,
    patch: UpdateDisbursementInput,
  ): Promise<Disbursement> {
    const rows = await this.updateDisbursements([id], patch);
    const row = rows[0];
    if (!row) throw new NotFoundError(`Disbursement ${id} not found`);
    return row;
  }

  async updateDisbursements(
    ids: number[],
    patch: UpdateDisbursementInput,
  ): Promise<Disbursement[]> {
    if (ids.length === 0) return [];
    const payload = definedEntries(patch);
    if (Object.keys(payload).length === 0) return this.disbursementsByIds(ids);

    const { data, error } = await this.supabase
      .schema(SCHEMA)
      .from("disbursements")
      .update(payload)
      .in("id", ids)
      .select(DISBURSEMENT_COLUMNS);
    if (error) {
      // Repointing a refund at a receipt that doesn't exist trips the same FK.
      if (isForeignKeyViolation(error)) {
        throw new ForeignKeyViolationError(
          "That receipt does not exist, so the refund can't be linked to it.",
        );
      }
      throw new Error(`Failed to update disbursements: ${error.message}`);
    }
    return data as Disbursement[];
  }

  private async disbursementsByIds(ids: number[]): Promise<Disbursement[]> {
    const { data, error } = await this.supabase
      .schema(SCHEMA)
      .from("disbursements")
      .select(DISBURSEMENT_COLUMNS)
      .in("id", ids);
    if (error) throw new Error(`Failed to load disbursements: ${error.message}`);
    return data as Disbursement[];
  }

  async deleteDisbursement(id: number): Promise<void> {
    const { data, error } = await this.supabase
      .schema(SCHEMA)
      .from("disbursements")
      .delete()
      .eq("id", id)
      .select("id");
    if (error) {
      throw new Error(`Failed to delete disbursement: ${error.message}`);
    }
    if (!data || data.length === 0) {
      throw new NotFoundError(`Disbursement ${id} not found`);
    }
  }
}
