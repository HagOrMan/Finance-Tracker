/**
 * One-time migration: local SQLite (receipts/disbursements) -> Supabase.
 *
 * NOT run automatically as part of the app or its build. Run this manually,
 * once, after applying supabase/migrations/finance_tracker_schema.sql and
 * adding `finance_tracker` to the project's exposed schemas.
 *
 * The rows carry no owner column — these are Pattern A tables reachable only
 * by the secret key — so this doesn't need you to have signed in first.
 *
 * Usage — put SQLITE_DB_PATH in .env.local alongside the Supabase keys, then:
 *
 *   pnpm migrate:sqlite-to-supabase
 *
 * Unlike `next dev`, a bare tsx script does NOT read .env.local, so this file
 * loads it itself (see loadEnvLocal below). Anything already set in the real
 * environment wins, so you can still override a single value per-run — but
 * note the `VAR=value cmd` prefix syntax is bash-only and does nothing in
 * PowerShell. There, set it first:  $env:SQLITE_DB_PATH = "C:\path\to.db"
 */

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import Database from "better-sqlite3";
import { createClient } from "@supabase/supabase-js";

import type { Disbursement, Receipt } from "../src/lib/data/types";

const SCHEMA = "finance_tracker";
const BATCH_SIZE = 500;

/**
 * Minimal .env.local reader. Deliberately hand-rolled rather than using
 * `node:util`'s parseEnv, which needs Node >= 20.12 — this has no version
 * floor and the parsing rules here are worth being explicit about:
 *
 * - split on the FIRST `=` only. Supabase secret keys and JWTs are base64 and
 *   routinely contain or end with `=`; a naive split would truncate them.
 * - never overwrite a variable that is already set, so an explicit
 *   per-run override still takes precedence.
 */
function loadEnvLocal(): void {
  const envPath = resolve(process.cwd(), ".env.local");
  if (!existsSync(envPath)) return;

  for (const rawLine of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim().replace(/^export\s+/, "");
    if (!line || line.startsWith("#")) continue;

    const eq = line.indexOf("=");
    if (eq === -1) continue;

    const key = line.slice(0, eq).trim();
    if (!key || process.env[key] !== undefined) continue;

    const value = line.slice(eq + 1).trim();
    // Strip one layer of matching surrounding quotes, if present.
    process.env[key] =
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
        ? value.slice(1, -1)
        : value;
  }
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Missing required env var: ${name}. Add it to .env.local in the repo ` +
        `root, or set it in your shell first ` +
        `(PowerShell: $env:${name} = "...").`
    );
  }
  return value;
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

async function main() {
  // Must run before the first requireEnv below.
  loadEnvLocal();

  const dbPath = requireEnv("SQLITE_DB_PATH");
  const supabaseUrl = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
  // New-style `sb_secret_…` key (or the legacy service_role JWT — same
  // Postgres role, but the new one can be revoked independently).
  const secretKey = requireEnv("SUPABASE_SECRET_KEY");

  const db = new Database(dbPath, { readonly: true, fileMustExist: true });
  const receipts = db.prepare("SELECT * FROM receipts").all() as Receipt[];
  const disbursements = db.prepare("SELECT * FROM disbursements").all() as Disbursement[];
  db.close();

  console.log(
    `Read ${receipts.length} receipts and ${disbursements.length} disbursements from ${dbPath}`
  );

  // Its own client rather than src/lib/supabase/service.ts, which is
  // `server-only` and so unimportable from a plain tsx script.
  // `persistSession: false` keeps it from writing session state that could
  // collide with a real user session.
  const supabase = createClient(supabaseUrl, secretKey, {
    auth: { autoRefreshToken: false, persistSession: false },
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
