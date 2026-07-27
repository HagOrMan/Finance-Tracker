import Database from "better-sqlite3";

import type {
  DataSource,
  Receipt,
  Disbursement,
  MergedReceipt,
  NewReceiptInput,
  NewDisbursementInput,
} from "./types";
import { mergeReceipts } from "./merge";

// Local-dev-only adapter (DATA_SOURCE=sqlite). Never selected in production
// — see migration.md §8. Opens a short-lived connection per call rather
// than holding one open, since this only ever runs against `next dev`.
export class SqliteDataSource implements DataSource {
  private readonly dbPath: string;

  constructor() {
    const path = process.env.SQLITE_DB_PATH;
    if (!path) {
      throw new Error(
        "SQLITE_DB_PATH is not set. Required when DATA_SOURCE=sqlite."
      );
    }
    this.dbPath = path;
  }

  private open(readonly = true) {
    return new Database(this.dbPath, { readonly, fileMustExist: true });
  }

  async loadReceipts(): Promise<Receipt[]> {
    const db = this.open();
    try {
      const rows = db
        .prepare("SELECT * FROM receipts ORDER BY date DESC")
        .all() as Receipt[];
      return rows.map((r) => ({
        ...r,
        discount: r.discount ?? 0,
        discount_percentage: r.discount_percentage ?? 0,
      }));
    } finally {
      db.close();
    }
  }

  async loadDisbursements(): Promise<Disbursement[]> {
    const db = this.open();
    try {
      return db
        .prepare("SELECT * FROM disbursements ORDER BY date_received DESC")
        .all() as Disbursement[];
    } finally {
      db.close();
    }
  }

  async loadMergedReceipts(): Promise<MergedReceipt[]> {
    const [receipts, disbursements] = await Promise.all([
      this.loadReceipts(),
      this.loadDisbursements(),
    ]);
    return mergeReceipts(receipts, disbursements);
  }

  async insertReceipt(input: NewReceiptInput): Promise<Receipt> {
    const db = this.open(false);
    try {
      const stmt = db.prepare(
        `INSERT INTO receipts (store, category, price, discount, discount_percentage, note, date)
         VALUES (@store, @category, @price, @discount, @discount_percentage, @note, @date)`
      );
      const result = stmt.run({
        store: input.store,
        category: input.category,
        price: input.price,
        discount: input.discount ?? 0,
        discount_percentage: input.discount_percentage ?? 0,
        note: input.note ?? null,
        date: input.date,
      });
      return db
        .prepare("SELECT * FROM receipts WHERE id = ?")
        .get(result.lastInsertRowid) as Receipt;
    } finally {
      db.close();
    }
  }

  async insertDisbursement(
    input: NewDisbursementInput
  ): Promise<Disbursement> {
    const db = this.open(false);
    try {
      const stmt = db.prepare(
        `INSERT INTO disbursements (entity, amount, date_received, reason, refunded_from_receipt)
         VALUES (@entity, @amount, @date_received, @reason, @refunded_from_receipt)`
      );
      const result = stmt.run({
        entity: input.entity,
        amount: input.amount,
        date_received: input.date_received,
        reason: input.reason ?? null,
        refunded_from_receipt: input.refunded_from_receipt ?? null,
      });
      return db
        .prepare("SELECT * FROM disbursements WHERE id = ?")
        .get(result.lastInsertRowid) as Disbursement;
    } finally {
      db.close();
    }
  }
}
