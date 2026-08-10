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

// ---------------------------------------------------------------------------
// Clock-skew retry
//
// PostgREST allows 30 s of skew on a JWT's `iat` and rejects anything beyond
// it. Nothing in this app mints that token: with the `sb_secret_…` key format
// the Supabase gateway signs one per request, so a rejection here is skew
// between Supabase's own components — not this machine, whose clock measured
// 0 s off the Supabase edge when this was diagnosed. Full write-up in
// PROGRESS.md.
// ---------------------------------------------------------------------------

/**
 * Matched on the message text rather than the `PGRST303` code, deliberately:
 * that code also covers plain expiry, which a retry cannot help. If Supabase
 * rewords the message this quietly stops firing — which is exactly the
 * behaviour these reads had before the retry existed.
 */
function isClockSkewRejection(error: unknown): error is Error {
  return error instanceof Error && /issued at future/i.test(error.message);
}

/**
 * Short on purpose. Waiting does **not** let the skew pass: the retry is issued
 * a newly minted token with a new `iat`, so the gap is the same one. What makes
 * a second attempt worth anything is that the observed failure hit one
 * background revalidation while other requests in the same second succeeded —
 * i.e. some instances behind the gateway are skewed, not all — so this is a
 * fresh draw rather than a wait.
 */
const SKEW_RETRY_DELAY_MS = 250;

/**
 * One retry, **reads only**. A retried write needs an idempotency story that
 * these three callers don't have to have — and per this file's header, writes
 * don't come through here at all.
 *
 * If every instance is skewed this simply fails twice and the caller still sees
 * the throw, which is the honest outcome: a foreground read on a cold cache
 * 500s the route, and no retry count fixes a Supabase-side clock.
 */
async function retryOnClockSkew<T>(read: () => Promise<T>): Promise<T> {
  try {
    return await read();
  } catch (error) {
    if (!isClockSkewRejection(error)) throw error;
    // A retry that works is otherwise invisible — without this line there is no
    // way to tell "the skew never came back" from "it came back and this caught
    // it", and only the second one says the mitigation earns its keep.
    console.warn(`Retrying after clock-skew rejection: ${error.message}`);
    await new Promise((resolve) => setTimeout(resolve, SKEW_RETRY_DELAY_MS));
    return read();
  }
}

// Named so the cached entry and the `fresh: true` path below can't drift into
// one being retried and the other not.
const readReceipts = () =>
  retryOnClockSkew(async () => (await getDataSource()).loadReceipts());
const readDisbursements = () =>
  retryOnClockSkew(async () => (await getDataSource()).loadDisbursements());
const readSubscriptions = () =>
  retryOnClockSkew(async () => (await getDataSource()).loadSubscriptions());

const cachedReceipts = unstable_cache(readReceipts, ["finance", "receipts"], {
  tags: [RECEIPTS_TAG],
  revalidate: CACHE_TTL_SECONDS,
});

const cachedDisbursements = unstable_cache(
  readDisbursements,
  ["finance", "disbursements"],
  { tags: [DISBURSEMENTS_TAG], revalidate: CACHE_TTL_SECONDS },
);

const cachedSubscriptions = unstable_cache(
  readSubscriptions,
  ["finance", "subscriptions"],
  { tags: [SUBSCRIPTIONS_TAG], revalidate: CACHE_TTL_SECONDS },
);

export async function loadReceiptsCached({
  fresh = false,
}: FreshOption = {}): Promise<Receipt[]> {
  if (!fresh) return cachedReceipts();
  const rows = await readReceipts();
  invalidateReceipts();
  return rows;
}

export async function loadDisbursementsCached({
  fresh = false,
}: FreshOption = {}): Promise<Disbursement[]> {
  if (!fresh) return cachedDisbursements();
  const rows = await readDisbursements();
  invalidateDisbursements();
  return rows;
}

export async function loadSubscriptionsCached({
  fresh = false,
}: FreshOption = {}): Promise<Subscription[]> {
  if (!fresh) return cachedSubscriptions();
  const rows = await readSubscriptions();
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
