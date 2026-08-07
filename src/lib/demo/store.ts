/**
 * The demo dataset: held in memory, written through to `localStorage`.
 *
 * **Reads never touch `localStorage`.** The whole dataset is parsed once at
 * boot into a module-level object; every read hits that object, and every write
 * mutates it and schedules a debounced write-through of the whole blob. A bulk
 * delete looping the single-row endpoint (`src/lib/bulk-delete.ts`) therefore
 * costs one storage write, not one per row.
 *
 * **Storage failure is not fatal.** Safari's private mode throws on write and a
 * quota can be exhausted; both degrade to memory-only, which forgets on refresh.
 * A demo that forgets beats a demo that white-screens.
 *
 * **Nothing here may run during render.** `hydrateDemoStore()` is called from
 * `DemoBoot`'s effect, and every other entry point is behind a fetch the UI
 * already treats as async. This mirrors what `FiltersHydrator` does for the
 * Zustand filter store, and for the same reason: the server renders with no
 * `localStorage`, so reading it during render is a hydration mismatch.
 */
import type { Disbursement, Receipt, Subscription } from "@/lib/data/types";
import { generateSeed } from "./seed";

/**
 * Namespaced and versioned.
 *
 * Namespaced because `localStorage` here already holds
 * `finance-tracker-filters` (the Zustand persist key in
 * `src/store/filters-store.ts`), and resetting the demo must not also reset the
 * visitor's date range — `ARCHITECTURE.md` §4 is explicit that "Reset filters"
 * and data actions stay separate things.
 *
 * Versioned so a shape change self-invalidates instead of crashing the app on
 * a stale blob. Bump on any change to `DemoDataset`.
 */
export const DEMO_STORAGE_KEY = "finance-tracker-demo:v1";

/**
 * Per-entity row cap.
 *
 * Well above the seed — which is ~13 months at roughly 40 receipts a month
 * before a visitor adds anything — so the cap can only ever be hit by someone
 * deliberately hammering the add button. Size is not the binding constraint: a
 * receipt serializes to ~150 bytes, so the whole cap is a few hundred KB
 * against a ~5 MB quota.
 */
export const DEMO_MAX_ROWS = 2000;

const WRITE_DEBOUNCE_MS = 250;

export interface DemoDataset {
  receipts: Receipt[];
  disbursements: Disbursement[];
  subscriptions: Subscription[];
  /** Monotonic per entity; never reused after a delete, exactly like an identity column. */
  nextId: { receipts: number; disbursements: number; subscriptions: number };
}

let dataset: DemoDataset | null = null;
let writeTimer: ReturnType<typeof setTimeout> | null = null;
/** Flipped false the first time storage refuses us; stops the console spam. */
let storageAvailable = true;

function isDemoDataset(value: unknown): value is DemoDataset {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Partial<DemoDataset>;
  return (
    Array.isArray(v.receipts) &&
    Array.isArray(v.disbursements) &&
    Array.isArray(v.subscriptions) &&
    typeof v.nextId === "object" &&
    v.nextId !== null &&
    typeof v.nextId.receipts === "number" &&
    typeof v.nextId.disbursements === "number" &&
    typeof v.nextId.subscriptions === "number"
  );
}

function readStored(): DemoDataset | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(DEMO_STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    // A blob written by an older version fails this and is silently replaced by
    // a fresh seed, which is the entire point of versioning the key.
    return isDemoDataset(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function writeNow(): void {
  if (dataset === null || typeof window === "undefined" || !storageAvailable) return;
  try {
    window.localStorage.setItem(DEMO_STORAGE_KEY, JSON.stringify(dataset));
  } catch (error) {
    storageAvailable = false;
    console.warn(
      "[demo] localStorage is unavailable; the demo will run from memory and forget on refresh.",
      error,
    );
  }
}

/**
 * Boot. Loads the stored dataset, or generates and stores a fresh seed.
 *
 * Async because `DemoBoot` awaits it and because a future seed generator might
 * genuinely need to be — nothing here blocks today.
 */
export async function hydrateDemoStore(): Promise<void> {
  if (dataset !== null) return;
  const stored = readStored();
  if (stored) {
    dataset = stored;
    return;
  }
  dataset = generateSeed();
  writeNow();
}

/**
 * The live dataset.
 *
 * Throws rather than lazily hydrating: reaching this before `DemoBoot` has run
 * means something rendered data outside the boot gate, and silently seeding
 * here would hide that behind a working screen.
 */
export function getDataset(): DemoDataset {
  if (dataset === null) {
    throw new Error("Demo store used before hydrateDemoStore() resolved");
  }
  return dataset;
}

/** Mutation done — schedule the write-through. */
export function commitDemoStore(): void {
  if (writeTimer !== null) clearTimeout(writeTimer);
  writeTimer = setTimeout(() => {
    writeTimer = null;
    writeNow();
  }, WRITE_DEBOUNCE_MS);
}

/**
 * Back to a fresh seed.
 *
 * Clears **only** this key. The visitor's filters live under a different one
 * and are none of this button's business.
 */
export function resetDemoStore(): void {
  if (writeTimer !== null) {
    clearTimeout(writeTimer);
    writeTimer = null;
  }
  dataset = generateSeed();
  // Immediate, not debounced: the caller reloads the page straight afterwards.
  writeNow();
}
