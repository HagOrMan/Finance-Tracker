import type { MergedReceipt } from "@/lib/data/types";
import {
  nameGroupKey,
  rankSpellings,
  tallySpelling,
  type SpellingStat,
} from "@/lib/name-groups";

/**
 * The Stores aggregate — a *lens over the receipts*, not a stored thing.
 *
 * ARCHITECTURE.md: a store's category is an observation over the ledger, never a
 * fact recorded anywhere. That is why this file has no persistence of any kind
 * and why "fixing" a store means rewriting its receipts rather than saving a
 * mapping. The field-agnostic half (grouping keys, similarity, Levenshtein)
 * lives in `name-groups.ts` and is shared with `entities.ts`.
 */

export interface StoreCategoryStat {
  category: string;
  count: number;
  /** sum(price) */
  gross: number;
  /** sum(actual_price) */
  net: number;
}

export interface StoreGroup {
  /** `nameGroupKey` of the raw store name — the identity of this row. */
  key: string;
  /** Most frequent raw spelling; ties break toward the most recently used. */
  displayName: string;
  /** Every raw spelling seen, ranked, for the merge UI. */
  spellings: string[];
  receiptIds: number[];
  receiptCount: number;
  gross: number;
  net: number;
  firstDate: string;
  lastDate: string;
  /** Descending by count. */
  categories: StoreCategoryStat[];
  dominantCategory: string;
  /** `receiptCount - dominant count`. 0 means perfectly consistent. */
  minorityCount: number;
  isInconsistent: boolean;
}

interface StoreAccumulator {
  spellings: Map<string, SpellingStat>;
  receiptIds: number[];
  gross: number;
  net: number;
  firstDate: string;
  lastDate: string;
  categories: Map<string, StoreCategoryStat>;
}

/**
 * Default sort: `minorityCount` desc, then `receiptCount` desc.
 *
 * This ordering *is* the point of the page — the stores you are most likely to
 * have mis-filed float to the top. A store with 3 receipts in the wrong
 * category outranks a store with 200 consistent ones.
 */
export function compareStoreGroups(a: StoreGroup, b: StoreGroup): number {
  return (
    b.minorityCount - a.minorityCount ||
    b.receiptCount - a.receiptCount ||
    a.displayName.localeCompare(b.displayName)
  );
}

export function buildStoreGroups(
  receipts: readonly MergedReceipt[],
): StoreGroup[] {
  const acc = new Map<string, StoreAccumulator>();

  for (const r of receipts) {
    const key = nameGroupKey(r.store);
    let group = acc.get(key);
    if (!group) {
      group = {
        spellings: new Map(),
        receiptIds: [],
        gross: 0,
        net: 0,
        firstDate: r.date,
        lastDate: r.date,
        categories: new Map(),
      };
      acc.set(key, group);
    }

    tallySpelling(group.spellings, r.store, r.date);
    group.receiptIds.push(r.id);
    group.gross += r.price;
    group.net += r.actual_price;
    if (r.date < group.firstDate) group.firstDate = r.date;
    if (r.date > group.lastDate) group.lastDate = r.date;

    const cat = group.categories.get(r.category) ?? {
      category: r.category,
      count: 0,
      gross: 0,
      net: 0,
    };
    cat.count += 1;
    cat.gross += r.price;
    cat.net += r.actual_price;
    group.categories.set(r.category, cat);
  }

  const groups: StoreGroup[] = [];
  for (const [key, group] of acc) {
    const ranked = rankSpellings(group.spellings.values());
    const categories = [...group.categories.values()].sort(
      (a, b) => b.count - a.count || a.category.localeCompare(b.category),
    );
    const dominant = categories[0];
    const receiptCount = group.receiptIds.length;

    groups.push({
      key,
      // `?? key` is unreachable — a group only exists because a receipt created
      // it — but it keeps the type honest without a non-null assertion.
      displayName: ranked[0]?.spelling ?? key,
      spellings: ranked.map((s) => s.spelling),
      receiptIds: group.receiptIds,
      receiptCount,
      gross: group.gross,
      net: group.net,
      firstDate: group.firstDate,
      lastDate: group.lastDate,
      categories,
      dominantCategory: dominant?.category ?? "",
      minorityCount: receiptCount - (dominant?.count ?? 0),
      isInconsistent: categories.length > 1,
    });
  }

  return groups.sort(compareStoreGroups);
}

/** The receipts belonging to a group, newest first. */
export function storeReceipts(
  receipts: readonly MergedReceipt[],
  group: StoreGroup,
): MergedReceipt[] {
  return receipts
    .filter((r) => nameGroupKey(r.store) === group.key)
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : b.id - a.id));
}

/**
 * The ids of a group's receipts filed under anything other than `category` —
 * the "set only the M receipts not in <dominant>" action (ARCHITECTURE.md),
 * which is the common case: one store mis-filed a handful of times.
 */
export function receiptIdsOutsideCategory(
  receipts: readonly MergedReceipt[],
  group: StoreGroup,
  category: string,
): number[] {
  return receipts
    .filter((r) => nameGroupKey(r.store) === group.key && r.category !== category)
    .map((r) => r.id);
}
