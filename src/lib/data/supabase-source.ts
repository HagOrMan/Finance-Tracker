import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/types/database";
import type {
  DataSource,
  Receipt,
  Disbursement,
  MergedReceipt,
  NewReceiptInput,
  NewDisbursementInput,
} from "./types";
import { mergeReceipts } from "./merge";

// Dedicated schema (not `public`) — see migration.md §3 for rationale. Must
// be added to Supabase's "exposed schemas" API setting or these calls 404.
const SCHEMA = "finance_tracker";

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
      .select("id, store, category, price, discount, discount_percentage, note, date")
      .order("date", { ascending: false });
    if (error) throw new Error(`Failed to load receipts: ${error.message}`);
    // Defensive, same as SqliteDataSource — the schema defaults these to 0,
    // but don't assume every row was written through that constraint.
    return (data as Receipt[]).map((r) => ({
      ...r,
      discount: r.discount ?? 0,
      discount_percentage: r.discount_percentage ?? 0,
    }));
  }

  async loadDisbursements(): Promise<Disbursement[]> {
    const { data, error } = await this.supabase
      .schema(SCHEMA)
      .from("disbursements")
      .select("id, entity, amount, date_received, reason, refunded_from_receipt")
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
      .select("id, store, category, price, discount, discount_percentage, note, date")
      .single();
    if (error) throw new Error(`Failed to insert receipt: ${error.message}`);
    return data as Receipt;
  }

  async insertDisbursement(
    input: NewDisbursementInput
  ): Promise<Disbursement> {
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
      .select("id, entity, amount, date_received, reason, refunded_from_receipt")
      .single();
    if (error) throw new Error(`Failed to insert disbursement: ${error.message}`);
    return data as Disbursement;
  }
}
