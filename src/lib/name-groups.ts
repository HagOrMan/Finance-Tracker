/**
 * Field-agnostic name grouping — the string normalizers, the edit distance and
 * the duplicate-candidate rules shared by the Stores and Entities aggregates.
 *
 * ARCHITECTURE.md moved these out of `stores.ts`: nothing in this file knows
 * what a store or an entity *is*, and there should be exactly one similarity
 * implementation sitting under both row models. `src/lib/stores.ts` and
 * `src/lib/entities.ts` build their aggregates on top.
 */

/**
 * Tier 1 — the automatic grouping key (ARCHITECTURE.md).
 *
 * Only differences that are unambiguously the same name: surrounding
 * whitespace, internal runs of whitespace, and case. `"Netflix"`, `" netflix "`
 * and `"Netflix  "` (double space) collapse into one group with no confirmation,
 * because there is no reading of those three as different stores.
 *
 * Everything fuzzier lives in `nameSimilarityKey` and only ever *suggests* —
 * auto-merging "Sobeys" and "So Beys" would be a silent data change.
 */
export function nameGroupKey(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

// U+0300–U+036F, the combining diacritical marks block.
//
// Built with String.fromCharCode rather than written as a regex literal on
// purpose: the marks themselves are zero-width and render on top of whatever
// character precedes them, so a literal class is invisible in most editors and
// a stray one silently changes what it matches. ARCHITECTURE.md flags this.
const COMBINING_MARKS = new RegExp(
  `[${String.fromCharCode(0x0300)}-${String.fromCharCode(0x036f)}]`,
  "g",
);

/**
 * Tier 2 — the suggestion-only similarity key (ARCHITECTURE.md).
 *
 * Strips accents, legal suffixes, TLDs, store numbers and every non-alphanumeric
 * character, so `"Safeway #4021"`, `"safeway"` and `"Safeway Inc."` all reduce
 * to `"safeway"`. **Never applied automatically** — two groups sharing a key are
 * rendered as "these look like the same store, merge?" and nothing more.
 */
export function nameSimilarityKey(name: string): string {
  return (
    nameGroupKey(name)
      .normalize("NFKD")
      .replace(COMBINING_MARKS, "")
      .replace(/\b(inc|ltd|llc|co|corp)\b/g, "")
      .replace(/\.(com|ca|net|org)\b/g, "")
      .replace(/#\d+\b/g, "") // store numbers: "Safeway #4021"
      .replace(/[^a-z0-9]/g, "")
  );
}

/**
 * Levenshtein edit distance, standard two-row dynamic program.
 *
 * Two rows rather than the full matrix because the distance is all we want —
 * nothing here reconstructs the alignment.
 */
export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  let prev: number[] = Array.from({ length: b.length + 1 }, (_, i) => i);
  let curr: number[] = new Array<number>(b.length + 1).fill(0);

  for (let i = 1; i <= a.length; i += 1) {
    curr[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(
        prev[j]! + 1, // deletion
        curr[j - 1]! + 1, // insertion
        prev[j - 1]! + cost, // substitution
      );
    }
    [prev, curr] = [curr, prev];
  }

  return prev[b.length]!;
}

/** Why a pair was flagged, so the UI can say something more useful than "similar". */
export type DuplicateReason = "same-key" | "contains" | "near";

export interface DuplicateCandidate<T> {
  a: T;
  b: T;
  reason: DuplicateReason;
}

/** A containment match on 3 characters or fewer is noise ("co" inside "costco"). */
const MIN_CONTAINED_LENGTH = 4;
/** Below 5 characters, an edit distance of 2 is most of the word. */
const MIN_NEAR_LENGTH = 5;
const MAX_NEAR_DISTANCE = 2;

function candidateReason(a: string, b: string): DuplicateReason | null {
  if (a === b) return "same-key";

  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  if (short.length >= MIN_CONTAINED_LENGTH && long.includes(short)) {
    return "contains";
  }

  // Prefilter before the DP: an edit distance of ≤ 2 cannot span a length gap
  // of more than 2, so most pairs are rejected on a subtraction. At a few
  // hundred distinct names the whole O(N²) sweep is sub-millisecond, which is
  // why nothing further is optimized here.
  if (long.length - short.length > MAX_NEAR_DISTANCE) return null;
  if (short.length >= MIN_NEAR_LENGTH && levenshtein(a, b) <= MAX_NEAR_DISTANCE) {
    return "near";
  }

  return null;
}

/**
 * Every pair of groups that *might* be the same thing under two different
 * spellings. Suggestion only — the caller renders these next to a merge button
 * and a human decides.
 *
 * Generic over anything carrying a `key` (a `nameGroupKey` result), which is
 * what lets one implementation serve both `StoreGroup` and `EntityGroup`
 * without either row model having to carry a similarity key it never displays.
 *
 * Groups whose similarity key reduces to the empty string (a name of only
 * punctuation, say) are dropped: an empty key is "equal" to every other empty
 * key and "contained" in everything, so it would pair with the whole table.
 */
export function duplicateCandidates<T extends { key: string }>(
  groups: readonly T[],
): DuplicateCandidate<T>[] {
  const keyed = groups
    .map((group) => ({ group, sim: nameSimilarityKey(group.key) }))
    .filter((entry) => entry.sim.length > 0);

  const out: DuplicateCandidate<T>[] = [];
  for (let i = 0; i < keyed.length; i += 1) {
    for (let j = i + 1; j < keyed.length; j += 1) {
      const a = keyed[i]!;
      const b = keyed[j]!;
      const reason = candidateReason(a.sim, b.sim);
      if (reason) out.push({ a: a.group, b: b.group, reason });
    }
  }
  return out;
}

/** The set of group keys appearing in at least one candidate pair. */
export function candidateKeySet<T extends { key: string }>(
  candidates: readonly DuplicateCandidate<T>[],
): Set<string> {
  const keys = new Set<string>();
  for (const { a, b } of candidates) {
    keys.add(a.key);
    keys.add(b.key);
  }
  return keys;
}

export interface SpellingStat {
  /** The raw string exactly as it appears in the database. */
  spelling: string;
  count: number;
  /** Most recent date this spelling was used on, "YYYY-MM-DD". */
  lastDate: string;
}

/**
 * Rank a group's raw spellings: most frequent first, ties broken toward the
 * most recently used one, then alphabetically so the order is stable.
 *
 * The first entry is the group's display name (ARCHITECTURE.md) — the merge UI
 * shows the rest so you can see what you are about to normalize away.
 */
export function rankSpellings(
  stats: Iterable<SpellingStat>,
): SpellingStat[] {
  return [...stats].sort(
    (a, b) =>
      b.count - a.count ||
      (a.lastDate < b.lastDate ? 1 : a.lastDate > b.lastDate ? -1 : 0) ||
      a.spelling.localeCompare(b.spelling),
  );
}

/**
 * Fold one row's raw name into a spelling tally. Shared by both aggregates
 * because "count it, remember the latest date it was used" is identical
 * whether the column is `store` or `entity`.
 */
export function tallySpelling(
  into: Map<string, SpellingStat>,
  spelling: string,
  date: string,
): void {
  const existing = into.get(spelling);
  if (!existing) {
    into.set(spelling, { spelling, count: 1, lastDate: date });
    return;
  }
  existing.count += 1;
  if (date > existing.lastDate) existing.lastDate = date;
}
