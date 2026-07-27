import Database from "better-sqlite3";

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

/**
 * The dev SQLite file predates `updated_at` and `subscription_id` — both
 * arrive in Postgres-only migrations (002 and Phase 3's 003), and this mode is
 * dev-only, so there is nothing to migrate here. `SELECT *` simply doesn't
 * return those columns, hence the coalescing below.
 */
type SqliteReceiptRow = Omit<Receipt, "subscription_id" | "updated_at"> &
  Partial<Pick<Receipt, "subscription_id" | "updated_at">>;

type SqliteDisbursementRow = Omit<Disbursement, "updated_at"> &
  Partial<Pick<Disbursement, "updated_at">>;

function toReceipt(r: SqliteReceiptRow): Receipt {
  return {
    ...r,
    discount: r.discount ?? 0,
    discount_percentage: r.discount_percentage ?? 0,
    subscription_id: r.subscription_id ?? null,
    updated_at: r.updated_at ?? "",
  };
}

function toDisbursement(d: SqliteDisbursementRow): Disbursement {
  return { ...d, updated_at: d.updated_at ?? "" };
}

// Column allowlists for the dynamic SET clause. A patch key that isn't on the
// list never reaches the SQL string — the only interpolation in this file is
// of these literals, never of anything a caller supplied.
const RECEIPT_UPDATABLE = [
  "store",
  "category",
  "price",
  "discount",
  "discount_percentage",
  "note",
  "date",
] as const satisfies readonly (keyof UpdateReceiptInput)[];

const DISBURSEMENT_UPDATABLE = [
  "entity",
  "amount",
  "date_received",
  "reason",
  "refunded_from_receipt",
] as const satisfies readonly (keyof UpdateDisbursementInput)[];

type BindValue = string | number | null;

/**
 * Builds `col = @col, …` plus its bound values, dropping `undefined` (meaning
 * "not being changed") while keeping `null` (meaning "clear this field").
 */
function buildSetClause(
  patch: object,
  allowed: readonly string[],
): { clause: string; params: Record<string, BindValue> } {
  const values = patch as Record<string, unknown>;
  const columns = allowed.filter((c) => values[c] !== undefined);
  return {
    clause: columns.map((c) => `${c} = @${c}`).join(", "),
    params: Object.fromEntries(
      columns.map((c) => [c, values[c] as BindValue]),
    ),
  };
}

/**
 * Named placeholders for an id list. better-sqlite3 is fussy about mixing
 * anonymous `?` with named `@x` binding, so the ids get names too.
 */
function buildIdList(ids: number[]): {
  clause: string;
  params: Record<string, number>;
} {
  return {
    clause: ids.map((_, i) => `@id${i}`).join(", "),
    params: Object.fromEntries(ids.map((id, i) => [`id${i}`, id])),
  };
}

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
        .all() as SqliteReceiptRow[];
      return rows.map(toReceipt);
    } finally {
      db.close();
    }
  }

  async loadDisbursements(): Promise<Disbursement[]> {
    const db = this.open();
    try {
      const rows = db
        .prepare("SELECT * FROM disbursements ORDER BY date_received DESC")
        .all() as SqliteDisbursementRow[];
      return rows.map(toDisbursement);
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
      return toReceipt(
        db
          .prepare("SELECT * FROM receipts WHERE id = ?")
          .get(result.lastInsertRowid) as SqliteReceiptRow
      );
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
      return toDisbursement(
        db
          .prepare("SELECT * FROM disbursements WHERE id = ?")
          .get(result.lastInsertRowid) as SqliteDisbursementRow
      );
    } finally {
      db.close();
    }
  }

  // -------------------------------------------------------------------------
  // Mutation
  //
  // No `updated_at` is written here: in Postgres a trigger owns that column,
  // and this file's database doesn't have it at all.
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
    const set = buildSetClause(patch, RECEIPT_UPDATABLE);
    const list = buildIdList(ids);
    const db = this.open(false);
    try {
      if (set.clause) {
        db.prepare(
          `UPDATE receipts SET ${set.clause} WHERE id IN (${list.clause})`
        ).run({ ...set.params, ...list.params });
      }
      const rows = db
        .prepare(`SELECT * FROM receipts WHERE id IN (${list.clause})`)
        .all(list.params) as SqliteReceiptRow[];
      return rows.map(toReceipt);
    } finally {
      db.close();
    }
  }

  async deleteReceipt(id: number): Promise<void> {
    const db = this.open(false);
    try {
      // Checked explicitly rather than left to the FK: SQLite only enforces
      // foreign keys when `PRAGMA foreign_keys = ON`, which is off by default,
      // so relying on it would let this mode silently orphan refund rows that
      // Postgres would have refused.
      const { linked } = db
        .prepare(
          "SELECT COUNT(*) AS linked FROM disbursements WHERE refunded_from_receipt = ?"
        )
        .get(id) as { linked: number };
      if (linked > 0) {
        throw new ForeignKeyViolationError(
          `${linked} disbursement${linked === 1 ? "" : "s"} refund this receipt. Delete or unlink them first.`
        );
      }

      const result = db.prepare("DELETE FROM receipts WHERE id = ?").run(id);
      if (result.changes === 0) {
        throw new NotFoundError(`Receipt ${id} not found`);
      }
    } finally {
      db.close();
    }
  }

  async disbursementsForReceipt(id: number): Promise<Disbursement[]> {
    const db = this.open();
    try {
      const rows = db
        .prepare(
          "SELECT * FROM disbursements WHERE refunded_from_receipt = ? ORDER BY date_received DESC"
        )
        .all(id) as SqliteDisbursementRow[];
      return rows.map(toDisbursement);
    } finally {
      db.close();
    }
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
    const set = buildSetClause(patch, DISBURSEMENT_UPDATABLE);
    const list = buildIdList(ids);
    const db = this.open(false);
    try {
      if (set.clause) {
        db.prepare(
          `UPDATE disbursements SET ${set.clause} WHERE id IN (${list.clause})`
        ).run({ ...set.params, ...list.params });
      }
      const rows = db
        .prepare(`SELECT * FROM disbursements WHERE id IN (${list.clause})`)
        .all(list.params) as SqliteDisbursementRow[];
      return rows.map(toDisbursement);
    } finally {
      db.close();
    }
  }

  async deleteDisbursement(id: number): Promise<void> {
    const db = this.open(false);
    try {
      const result = db
        .prepare("DELETE FROM disbursements WHERE id = ?")
        .run(id);
      if (result.changes === 0) {
        throw new NotFoundError(`Disbursement ${id} not found`);
      }
    } finally {
      db.close();
    }
  }
}
