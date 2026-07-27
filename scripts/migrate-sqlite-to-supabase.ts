/**
 * One-time migration: local SQLite (receipts/disbursements) -> Supabase.
 *
 * NOT run automatically as part of the app or its build. Run this manually,
 * once, after you've: created the Supabase project, applied the schema in
 * migration.md §6, enabled Google/GitHub auth providers, and signed in at
 * least once via the app's /login so an `auth.users` row exists for you.
 *
 * Usage:
 *   SQLITE_DB_PATH="C:\path\to\secret_finances.db" \
 *   NEXT_PUBLIC_SUPABASE_URL="https://xxxx.supabase.co" \
 *   SUPABASE_SERVICE_ROLE_KEY="..." \
 *   MIGRATION_USER_ID="<your auth.users id, from the Supabase dashboard>" \
 *     pnpm migrate:sqlite-to-supabase
 */

import Database from "better-sqlite3";
import { createClient } from "@supabase/supabase-js";

import type { Disbursement, Receipt } from "../src/lib/data/types";

const SCHEMA = "finance_tracker";
const BATCH_SIZE = 500;

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

async function main() {
  const dbPath = requireEnv("SQLITE_DB_PATH");
  const supabaseUrl = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
  const serviceRoleKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
  const userId = requireEnv("MIGRATION_USER_ID");

  const db = new Database(dbPath, { readonly: true, fileMustExist: true });
  const receipts = db.prepare("SELECT * FROM receipts").all() as Receipt[];
  const disbursements = db.prepare("SELECT * FROM disbursements").all() as Disbursement[];
  db.close();

  console.log(
    `Read ${receipts.length} receipts and ${disbursements.length} disbursements from ${dbPath}`
  );

  // Service role key bypasses RLS — required here since this is an admin
  // backfill, never used by the app itself (see migration.md §13).
  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  for (const batch of chunk(receipts, BATCH_SIZE)) {
    const rows = batch.map((r) => ({
      id: r.id,
      store: r.store,
      category: r.category,
      price: r.price,
      discount: r.discount ?? 0,
      discount_percentage: r.discount_percentage ?? 0,
      note: r.note,
      date: r.date,
      user_id: userId,
    }));
    const { error } = await supabase.schema(SCHEMA).from("receipts").insert(rows);
    if (error) throw new Error(`Failed to insert receipts batch: ${error.message}`);
    console.log(`  inserted ${rows.length} receipts`);
  }

  for (const batch of chunk(disbursements, BATCH_SIZE)) {
    const rows = batch.map((d) => ({
      id: d.id,
      entity: d.entity,
      amount: d.amount,
      date_received: d.date_received,
      reason: d.reason,
      refunded_from_receipt: d.refunded_from_receipt,
      user_id: userId,
    }));
    const { error } = await supabase.schema(SCHEMA).from("disbursements").insert(rows);
    if (error) throw new Error(`Failed to insert disbursements batch: ${error.message}`);
    console.log(`  inserted ${rows.length} disbursements`);
  }

  const { count: receiptsCount } = await supabase
    .schema(SCHEMA)
    .from("receipts")
    .select("*", { count: "exact", head: true });
  const { count: disbursementsCount } = await supabase
    .schema(SCHEMA)
    .from("disbursements")
    .select("*", { count: "exact", head: true });

  console.log(
    `\nSupabase now has ${receiptsCount ?? "?"} receipts (source had ${receipts.length}) ` +
      `and ${disbursementsCount ?? "?"} disbursements (source had ${disbursements.length}).`
  );

  const maxReceiptId = Math.max(0, ...receipts.map((r) => r.id));
  const maxDisbursementId = Math.max(0, ...disbursements.map((d) => d.id));

  console.log(
    "\nRun these in the Supabase SQL editor so future inserts don't collide with the migrated ids:\n"
  );
  console.log(`  select setval('${SCHEMA}.receipts_id_seq', ${maxReceiptId});`);
  console.log(`  select setval('${SCHEMA}.disbursements_id_seq', ${maxDisbursementId});`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
