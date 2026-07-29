/**
 * The cached read layer over `getDataSource()`.
 *
 * **Why this exists.** Every browser tab, every hard reload and every device
 * used to mean a fresh Supabase query, because the only cache was TanStack
 * Query's in-memory one and that dies with the page. On a single-user ledger
 * that changes a handful of times a week, almost all of those queries returned
 * a byte-identical answer. This puts Next's Data Cache in front of them, so a
 * page load costs a Vercel function invocation but *not* a Supabase round trip.
 *
 * **The split that keeps it honest:**
 *
 * - **Reads that only display** go through here — the list endpoints and the
 *   report builder.
 * - **Anything that writes, or decides a write, keeps calling `getDataSource()`
 *   directly.** The subscription runner, the delete guards, the bulk updates.
 *   A writer that acts on a cached read can act on a stale price or a stale
 *   `charges_generated`, and no amount of invalidation afterwards un-writes it.
 *
 * **Invalidation is explicit and lives at the route handlers.** Every write
 * route calls the matching `invalidate*()` before it responds. That is a rule
 * someone can forget, which is why it is stated in `CLAUDE.md` as well: a write
 * route with no `invalidate*()` call serves stale rows for up to
 * `CACHE_TTL_SECONDS`.
 *
 * Receipts and disbursements are cached as **two separate entries** and merged
 * per request. Merging is O(n) in memory and free; caching the merged result
 * instead would mean every disbursement edit also threw away the receipts.
 */
import "server-only";

import { revalidateTag, unstable_cache } from "next/cache";

import { mergeReceipts } from "./merge";
import { getDataSource } from "./source";
import type {
  Disbursement,
  MergedReceipt,
  Receipt,
  Subscription,
} from "./types";

export const RECEIPTS_TAG = "finance:receipts";
export const DISBURSEMENTS_TAG = "finance:disbursements";
export const SUBSCRIPTIONS_TAG = "finance:subscriptions";

/**
 * Backstop only — correctness comes from the tags, not from expiry.
 *
 * An hour is short enough that a missed `invalidate*()` call self-heals the
 * same afternoon, and long enough that a day of normal browsing costs a couple
 * of Supabase queries rather than a couple of hundred.
 */
const CACHE_TTL_SECONDS = 3600;

/**
 * `fresh: true` skips the cache **and** drops the entry, so the manual
 * "Refresh data" button re-reads Postgres for everyone rather than handing back
 * the same cached payload it was pressed to escape.
 */
export interface FreshOption {
  fresh?: boolean;
}

const cachedReceipts = unstable_cache(
  async () => (await getDataSource()).loadReceipts(),
  ["finance", "receipts"],
  { tags: [RECEIPTS_TAG], revalidate: CACHE_TTL_SECONDS },
);

const cachedDisbursements = unstable_cache(
  async () => (await getDataSource()).loadDisbursements(),
  ["finance", "disbursements"],
  { tags: [DISBURSEMENTS_TAG], revalidate: CACHE_TTL_SECONDS },
);

const cachedSubscriptions = unstable_cache(
  async () => (await getDataSource()).loadSubscriptions(),
  ["finance", "subscriptions"],
  { tags: [SUBSCRIPTIONS_TAG], revalidate: CACHE_TTL_SECONDS },
);

export async function loadReceiptsCached({
  fresh = false,
}: FreshOption = {}): Promise<Receipt[]> {
  if (!fresh) return cachedReceipts();
  const rows = await (await getDataSource()).loadReceipts();
  invalidateReceipts();
  return rows;
}

export async function loadDisbursementsCached({
  fresh = false,
}: FreshOption = {}): Promise<Disbursement[]> {
  if (!fresh) return cachedDisbursements();
  const rows = await (await getDataSource()).loadDisbursements();
  invalidateDisbursements();
  return rows;
}

export async function loadSubscriptionsCached({
  fresh = false,
}: FreshOption = {}): Promise<Subscription[]> {
  if (!fresh) return cachedSubscriptions();
  const rows = await (await getDataSource()).loadSubscriptions();
  invalidateSubscriptions();
  return rows;
}

export async function loadMergedReceiptsCached(
  options: FreshOption = {},
): Promise<MergedReceipt[]> {
  const [receipts, disbursements] = await Promise.all([
    loadReceiptsCached(options),
    loadDisbursementsCached(options),
  ]);
  return mergeReceipts(receipts, disbursements);
}

/**
 * Both halves of the ledger from one pair of reads.
 *
 * The report needs merged receipts *and* the raw disbursements. Asking for
 * them separately used to load disbursements twice — once on its own and once
 * inside `loadMergedReceipts` — so a single report request cost three queries.
 */
export async function loadLedgerCached(options: FreshOption = {}): Promise<{
  receipts: MergedReceipt[];
  disbursements: Disbursement[];
}> {
  const [receipts, disbursements] = await Promise.all([
    loadReceiptsCached(options),
    loadDisbursementsCached(options),
  ]);
  return { receipts: mergeReceipts(receipts, disbursements), disbursements };
}

// ---------------------------------------------------------------------------
// Invalidation
//
// Call these from the write route, after the write succeeds. `revalidateTag`
// needs a request scope, which every route handler has and no rendering path
// does — another reason writes never happen anywhere else. It also throws if
// called from inside a cached function, which is why the `fresh` branches
// above invalidate on the *uncached* path only.
// ---------------------------------------------------------------------------

/**
 * `expire: 0` — drop the entry now, don't serve it stale while revalidating.
 *
 * Next 16 made this second argument required, and the choice is load-bearing
 * rather than boilerplate. A named profile like `"max"` means
 * stale-while-revalidate: the read immediately after a write may still be
 * served the pre-write rows while a fresh copy is computed behind it. On a
 * ledger that is the wrong trade — you press Save and the number has to change.
 * Zero costs one uncached read after each write, which happens a handful of
 * times a week.
 */
const EXPIRE_NOW = { expire: 0 } as const;

export function invalidateReceipts(): void {
  revalidateTag(RECEIPTS_TAG, EXPIRE_NOW);
}

export function invalidateDisbursements(): void {
  revalidateTag(DISBURSEMENTS_TAG, EXPIRE_NOW);
}

export function invalidateSubscriptions(): void {
  revalidateTag(SUBSCRIPTIONS_TAG, EXPIRE_NOW);
}

/** A subscription charge writes a receipt and advances the counter on the sub. */
export function invalidateSubscriptionCharges(): void {
  invalidateReceipts();
  invalidateSubscriptions();
}
