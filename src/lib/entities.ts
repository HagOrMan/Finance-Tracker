import type { Disbursement } from "@/lib/data/types";
import {
  nameGroupKey,
  rankSpellings,
  tallySpelling,
  type SpellingStat,
} from "@/lib/name-groups";

/**
 * The Entities aggregate — the Stores lens, one column over (FEATURES.md §4.7,
 * D11). `disbursements.entity` has exactly the free-text-drift problem
 * `receipts.store` has, and merging is the same operation on a different
 * column, so the grouping/similarity machinery is shared via `name-groups.ts`
 * and only the aggregate differs.
 *
 * An entity has no category axis, so there is no mix bar and no
 * `minorityCount`. What it does have that a store doesn't is the refund split:
 * a disbursement with `refunded_from_receipt` set is money coming back on a
 * specific purchase, and one without it is standalone income. Those are
 * different enough to want separate totals.
 *
 * Renaming is safe in a way editing an amount is not: `refunded_from_receipt`
 * is a foreign key, not a name, so no rename can disturb `actual_price`
 * anywhere in the app.
 */

export interface EntityGroup {
  /** `nameGroupKey` of the raw entity name. */
  key: string;
  displayName: string;
  spellings: string[];
  disbursementIds: number[];
  count: number;
  /** sum(amount) */
  total: number;
  /** Rows with `refunded_from_receipt != null`. */
  refundCount: number;
  refundTotal: number;
  firstDate: string;
  lastDate: string;
}

interface EntityAccumulator {
  spellings: Map<string, SpellingStat>;
  disbursementIds: number[];
  total: number;
  refundCount: number;
  refundTotal: number;
  firstDate: string;
  lastDate: string;
}

export function buildEntityGroups(
  disbursements: readonly Disbursement[],
): EntityGroup[] {
  const acc = new Map<string, EntityAccumulator>();

  for (const d of disbursements) {
    const key = nameGroupKey(d.entity);
    let group = acc.get(key);
    if (!group) {
      group = {
        spellings: new Map(),
        disbursementIds: [],
        total: 0,
        refundCount: 0,
        refundTotal: 0,
        firstDate: d.date_received,
        lastDate: d.date_received,
      };
      acc.set(key, group);
    }

    tallySpelling(group.spellings, d.entity, d.date_received);
    group.disbursementIds.push(d.id);
    group.total += d.amount;
    if (d.refunded_from_receipt != null) {
      group.refundCount += 1;
      group.refundTotal += d.amount;
    }
    if (d.date_received < group.firstDate) group.firstDate = d.date_received;
    if (d.date_received > group.lastDate) group.lastDate = d.date_received;
  }

  const groups: EntityGroup[] = [];
  for (const [key, group] of acc) {
    const ranked = rankSpellings(group.spellings.values());
    groups.push({
      key,
      displayName: ranked[0]?.spelling ?? key,
      spellings: ranked.map((s) => s.spelling),
      disbursementIds: group.disbursementIds,
      count: group.disbursementIds.length,
      total: group.total,
      refundCount: group.refundCount,
      refundTotal: group.refundTotal,
      firstDate: group.firstDate,
      lastDate: group.lastDate,
    });
  }

  return groups.sort(
    (a, b) => b.count - a.count || a.displayName.localeCompare(b.displayName),
  );
}

/**
 * Default sort for the Entities table: duplicate-name candidates first, then
 * `count` desc (FEATURES.md §4.7).
 *
 * Unlike stores there is no category-consistency signal to rank by, so
 * near-duplicate names *are* the finding — which is exactly what this tab was
 * asked for. Takes the candidate keys rather than computing them so the page
 * can render the same set in its callout without doing the O(N²) sweep twice.
 */
export function sortEntityGroups(
  groups: readonly EntityGroup[],
  candidateKeys: ReadonlySet<string>,
): EntityGroup[] {
  return [...groups].sort((a, b) => {
    const aFlagged = candidateKeys.has(a.key) ? 1 : 0;
    const bFlagged = candidateKeys.has(b.key) ? 1 : 0;
    return (
      bFlagged - aFlagged ||
      b.count - a.count ||
      a.displayName.localeCompare(b.displayName)
    );
  });
}

/** The disbursements belonging to a group, newest first. */
export function entityDisbursements(
  disbursements: readonly Disbursement[],
  group: EntityGroup,
): Disbursement[] {
  return disbursements
    .filter((d) => nameGroupKey(d.entity) === group.key)
    .sort((a, b) =>
      a.date_received < b.date_received
        ? 1
        : a.date_received > b.date_received
          ? -1
          : b.id - a.id,
    );
}
