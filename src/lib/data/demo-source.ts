/**
 * The third `DataSource` — backed by the browser's demo store.
 *
 * **It runs in the browser, unlike its two siblings.** `SupabaseDataSource` and
 * `SqliteDataSource` are reached through `getDataSource()` inside a route
 * handler; this one is reached through `src/lib/demo/transport.ts`, which
 * short-circuits `fetch` in `use-finance-data.ts` before a request is ever
 * made. That is deliberate and it is why **there is no `demo` branch in
 * `getDataSource()`**: a demo source selected there would run in a Vercel
 * function, so every visitor would share one dataset, it would vanish on each
 * cold start, and one visitor's Reset would reset everybody.
 *
 * It implements the same interface anyway, and that is the point — a method
 * added to `DataSource` breaks this file at build time rather than producing a
 * demo that quietly lacks a feature.
 *
 * **Three things Postgres does in production have to happen here instead**, or
 * the demo shows behaviour the real app doesn't have:
 *
 * 1. `updated_at` — a database trigger in production, stamped by hand here.
 * 2. The two delete guards — foreign keys in production, checked here so the
 *    409 can still name the blocking rows.
 * 3. `unique (subscription_id, date)` — the runner's idempotency guard, without
 *    which "Run due charges" double-charges when pressed twice.
 */
import {
  commitDemoStore,
  DEMO_MAX_ROWS,
  getDataset,
} from "@/lib/demo/store";

import {
  ForeignKeyViolationError,
  NotFoundError,
  UniqueViolationError,
} from "./errors";
import { mergeReceipts } from "./merge";
import type {
  DataSource,
  Disbursement,
  MergedReceipt,
  NewDisbursementInput,
  NewReceiptInput,
  NewSubscriptionInput,
  Receipt,
  Subscription,
  UpdateDisbursementInput,
  UpdateReceiptInput,
  UpdateSubscriptionInput,
} from "./types";

/**
 * Rows are flat, so a spread is a deep copy.
 *
 * Every read returns copies. Without this the arrays TanStack Query caches
 * would share object identity with the store, and a later edit would mutate
 * data already rendered — a class of bug that does not exist against a real
 * database because rows arrive over the wire.
 */
function copy<T extends object>(row: T): T {
  return { ...row };
}

/** Newest first, matching `SupabaseDataSource`'s `.order(..., ascending: false)`. */
function byDateDesc<T extends { id: number }>(
  rows: readonly T[],
  dateOf: (row: T) => string,
): T[] {
  return [...rows].sort((a, b) => {
    const da = dateOf(a);
    const db = dateOf(b);
    if (da !== db) return da < db ? 1 : -1;
    // Ties broken by id so the order is stable across reads. Postgres makes no
    // such promise, but an unstable list visibly reshuffles on every refetch.
    return b.id - a.id;
  });
}

/** Only keys the caller actually set — `undefined` means "not being changed". */
function applyPatch<T extends object>(row: T, patch: Partial<T>): void {
  for (const [key, value] of Object.entries(patch)) {
    if (value !== undefined) {
      (row as Record<string, unknown>)[key] = value;
    }
  }
}

function nowStamp(): string {
  return new Date().toISOString();
}

function assertRoom(count: number, entity: string): void {
  if (count >= DEMO_MAX_ROWS) {
    throw new Error(
      `Demo limit reached (${DEMO_MAX_ROWS} ${entity}). Press “Reset demo” to start from a fresh ledger.`,
    );
  }
}

export class DemoDataSource implements DataSource {
  // -------------------------------------------------------------------------
  // Receipts and disbursements
  // -------------------------------------------------------------------------

  async loadReceipts(): Promise<Receipt[]> {
    return byDateDesc(getDataset().receipts, (r) => r.date).map(copy);
  }

  async loadDisbursements(): Promise<Disbursement[]> {
    return byDateDesc(getDataset().disbursements, (d) => d.date_received).map(copy);
  }

  async loadMergedReceipts(): Promise<MergedReceipt[]> {
    // The real `mergeReceipts`, never a reimplementation: `total_refunded` and
    // `actual_price` are derived facts, and a second definition of what a
    // receipt cost is exactly what ARCHITECTURE.md §1 exists to prevent.
    return mergeReceipts(await this.loadReceipts(), await this.loadDisbursements());
  }

  async insertReceipt(input: NewReceiptInput): Promise<Receipt> {
    const data = getDataset();
    assertRoom(data.receipts.length, "receipts");

    const receipt: Receipt = {
      id: data.nextId.receipts,
      store: input.store,
      category: input.category,
      price: input.price,
      discount: input.discount ?? 0,
      discount_percentage: input.discount_percentage ?? 0,
      note: input.note ?? null,
      date: input.date,
      // Hand-entered rows carry no provenance. Only `insertSubscriptionCharge`
      // sets this.
      subscription_id: null,
      updated_at: nowStamp(),
    };

    data.nextId.receipts += 1;
    data.receipts.push(receipt);
    commitDemoStore();
    return copy(receipt);
  }

  async insertDisbursement(input: NewDisbursementInput): Promise<Disbursement> {
    const data = getDataset();
    assertRoom(data.disbursements.length, "disbursements");

    const disbursement: Disbursement = {
      id: data.nextId.disbursements,
      entity: input.entity,
      amount: input.amount,
      date_received: input.date_received,
      reason: input.reason ?? null,
      refunded_from_receipt: input.refunded_from_receipt ?? null,
      updated_at: nowStamp(),
    };

    data.nextId.disbursements += 1;
    data.disbursements.push(disbursement);
    commitDemoStore();
    return copy(disbursement);
  }

  async updateReceipt(id: number, patch: UpdateReceiptInput): Promise<Receipt> {
    const row = getDataset().receipts.find((r) => r.id === id);
    if (!row) throw new NotFoundError(`Receipt ${id} not found`);
    applyPatch(row, patch);
    row.updated_at = nowStamp();
    commitDemoStore();
    return copy(row);
  }

  async updateReceipts(
    ids: number[],
    patch: UpdateReceiptInput,
  ): Promise<Receipt[]> {
    const wanted = new Set(ids);
    const updated = getDataset().receipts.filter((r) => wanted.has(r.id));
    for (const row of updated) {
      applyPatch(row, patch);
      row.updated_at = nowStamp();
    }
    commitDemoStore();
    // Deliberately shorter than `ids` when some didn't match, rather than
    // throwing: the client's cached list can lag a delete, which is information
    // and not an error.
    return updated.map(copy);
  }

  async deleteReceipt(id: number): Promise<void> {
    const data = getDataset();
    const index = data.receipts.findIndex((r) => r.id === id);
    if (index === -1) throw new NotFoundError(`Receipt ${id} not found`);

    // The FK in production. Hard delete refused while anything refunds this
    // receipt — a cascade would silently destroy refund records.
    const linked = data.disbursements.filter((d) => d.refunded_from_receipt === id);
    if (linked.length > 0) {
      throw new ForeignKeyViolationError(
        `Receipt ${id} is referenced by ${linked.length} disbursement(s)`,
        linked.map(copy),
      );
    }

    data.receipts.splice(index, 1);
    commitDemoStore();
  }

  async disbursementsForReceipt(id: number): Promise<Disbursement[]> {
    return getDataset()
      .disbursements.filter((d) => d.refunded_from_receipt === id)
      .map(copy);
  }

  async updateDisbursement(
    id: number,
    patch: UpdateDisbursementInput,
  ): Promise<Disbursement> {
    const row = getDataset().disbursements.find((d) => d.id === id);
    if (!row) throw new NotFoundError(`Disbursement ${id} not found`);
    applyPatch(row, patch);
    row.updated_at = nowStamp();
    commitDemoStore();
    return copy(row);
  }

  async updateDisbursements(
    ids: number[],
    patch: UpdateDisbursementInput,
  ): Promise<Disbursement[]> {
    const wanted = new Set(ids);
    const updated = getDataset().disbursements.filter((d) => wanted.has(d.id));
    for (const row of updated) {
      applyPatch(row, patch);
      row.updated_at = nowStamp();
    }
    commitDemoStore();
    return updated.map(copy);
  }

  async deleteDisbursement(id: number): Promise<void> {
    const data = getDataset();
    const index = data.disbursements.findIndex((d) => d.id === id);
    if (index === -1) throw new NotFoundError(`Disbursement ${id} not found`);
    // No guard in this direction: nothing references a disbursement. It is the
    // row that does the referencing.
    data.disbursements.splice(index, 1);
    commitDemoStore();
  }

  // -------------------------------------------------------------------------
  // Subscriptions
  // -------------------------------------------------------------------------

  async loadSubscriptions(): Promise<Subscription[]> {
    // Active first, then by name — matching `SupabaseDataSource`'s two
    // `.order()` calls, so `/subscriptions` reads the same in both modes.
    return [...getDataset().subscriptions]
      .sort((a, b) => {
        if (a.active !== b.active) return a.active ? -1 : 1;
        return a.name.localeCompare(b.name);
      })
      .map(copy);
  }

  async insertSubscription(input: NewSubscriptionInput): Promise<Subscription> {
    const data = getDataset();
    assertRoom(data.subscriptions.length, "subscriptions");

    const stamp = nowStamp();
    const subscription: Subscription = {
      id: data.nextId.subscriptions,
      name: input.name,
      store: input.store,
      category: input.category,
      price: input.price,
      interval_unit: input.interval_unit,
      interval_count: input.interval_count ?? 1,
      start_date: input.start_date,
      // Always zero on create. The schedule is derived from this, so a value
      // arriving from outside would silently reschedule the whole series —
      // which is why it is absent from `NewSubscriptionInput` in the first place.
      charges_generated: 0,
      active: input.active ?? true,
      note: input.note ?? null,
      created_at: stamp,
      updated_at: stamp,
    };

    data.nextId.subscriptions += 1;
    data.subscriptions.push(subscription);
    commitDemoStore();
    return copy(subscription);
  }

  async updateSubscription(
    id: number,
    patch: UpdateSubscriptionInput,
  ): Promise<Subscription> {
    const row = getDataset().subscriptions.find((s) => s.id === id);
    if (!row) throw new NotFoundError(`Subscription ${id} not found`);
    applyPatch(row, patch);
    row.updated_at = nowStamp();
    commitDemoStore();
    return copy(row);
  }

  async deleteSubscription(id: number): Promise<void> {
    const data = getDataset();
    const index = data.subscriptions.findIndex((s) => s.id === id);
    if (index === -1) throw new NotFoundError(`Subscription ${id} not found`);

    // Generated receipts keep their provenance: `on delete set null` would
    // quietly discard the one thing saying where those charges came from.
    const generated = data.receipts.filter((r) => r.subscription_id === id);
    if (generated.length > 0) {
      throw new ForeignKeyViolationError(
        `Subscription ${id} has generated ${generated.length} receipt(s)`,
        generated.map(copy),
      );
    }

    data.subscriptions.splice(index, 1);
    commitDemoStore();
  }

  async receiptsForSubscription(id: number): Promise<Receipt[]> {
    return byDateDesc(
      getDataset().receipts.filter((r) => r.subscription_id === id),
      (r) => r.date,
    ).map(copy);
  }

  async insertSubscriptionCharge(
    subscription: Subscription,
    date: string,
  ): Promise<Receipt> {
    const data = getDataset();

    // `receipts_subscription_charge_uniq`, in application code because there is
    // no database here to hold it. Throwing is **not** a failure path: the
    // runner reads it as success-already-recorded, which is what makes a
    // double-press of "Run due charges" a no-op instead of a double charge.
    const exists = data.receipts.some(
      (r) => r.subscription_id === subscription.id && r.date === date,
    );
    if (exists) {
      throw new UniqueViolationError(
        `Charge for subscription ${subscription.id} on ${date} already exists`,
      );
    }

    assertRoom(data.receipts.length, "receipts");

    const receipt: Receipt = {
      id: data.nextId.receipts,
      store: subscription.store,
      category: subscription.category,
      price: subscription.price,
      discount: 0,
      discount_percentage: 0,
      // The subscription's own note, falling back to its name — the
      // human-readable half of the provenance, where `subscription_id` is the
      // machine-readable half. Matches `SupabaseDataSource`.
      note: subscription.note ?? subscription.name,
      date,
      subscription_id: subscription.id,
      updated_at: nowStamp(),
    };

    data.nextId.receipts += 1;
    data.receipts.push(receipt);
    commitDemoStore();
    return copy(receipt);
  }

  async setChargesGenerated(id: number, count: number): Promise<void> {
    const row = getDataset().subscriptions.find((s) => s.id === id);
    if (!row) throw new NotFoundError(`Subscription ${id} not found`);
    row.charges_generated = count;
    commitDemoStore();
  }
}
